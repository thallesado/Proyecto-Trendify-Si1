"""Paquete P8 — Reportes e Inteligencia de Negocio (CU21–CU26)."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Bitacora,
    Cliente,
    DetalleVenta,
    Inventario,
    MovimientoInventario,
    Producto,
    Venta,
)
from .permissions import IsAdminOrVendedorRole, IsAdminRole


def _get_client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _registrar_consulta_reporte(request, accion, detalle):
    usuario = getattr(request, 'user', None)
    if usuario is None or not hasattr(usuario, 'id_usuario'):
        return
    Bitacora.objects.create(
        id_usuario=usuario,
        accion=accion,
        tabla_afectada='reportes',
        registro_afectado_id=None,
        detalle=detalle,
        fecha_hora=timezone.now(),
        direccion_ip=_get_client_ip(request),
    )


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip()[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def _resolver_rango(request, default_preset='mes'):
    """Devuelve (inicio, fin, preset) normalizando fechas invalidas."""
    hoy = timezone.now().date()
    preset = (request.query_params.get('periodo') or default_preset).strip().lower()

    if preset == 'hoy':
        return hoy, hoy, preset
    if preset == 'semana':
        inicio = hoy - timedelta(days=hoy.weekday())
        return inicio, hoy, preset
    if preset == 'mes':
        inicio = hoy.replace(day=1)
        return inicio, hoy, preset

    inicio = _parse_date(request.query_params.get('fecha_inicio'))
    fin = _parse_date(request.query_params.get('fecha_fin'))
    if inicio is None:
        inicio = hoy.replace(day=1)
    if fin is None:
        fin = hoy
    if fin < inicio:
        inicio, fin = fin, inicio
    if fin > hoy:
        fin = hoy
    return inicio, fin, 'personalizado'


def _ventas_completadas_qs(fecha_inicio=None, fecha_fin=None):
    qs = Venta.objects.filter(estado_venta__iexact='completada')
    if fecha_inicio:
        qs = qs.filter(fecha_hora__date__gte=fecha_inicio)
    if fecha_fin:
        qs = qs.filter(fecha_hora__date__lte=fecha_fin)
    return qs


def _suma_ventas(qs):
    agg = qs.aggregate(total=Coalesce(Sum('monto_total'), Decimal('0.00')))
    return agg['total'] or Decimal('0.00')


def _variacion_pct(actual, anterior):
    actual_f = float(actual or 0)
    anterior_f = float(anterior or 0)
    if anterior_f == 0:
        return 100.0 if actual_f > 0 else 0.0
    return round(((actual_f - anterior_f) / anterior_f) * 100, 1)


class ReportesViewSet(viewsets.ViewSet):
    """Endpoints de lectura para CU21–CU26."""

    def get_permissions(self):
        if self.action in ('productos_top', 'ventas_hoy', 'consulta_voz', 'asistente'):
            return [IsAdminOrVendedorRole()]
        return [IsAdminRole()]

    @action(detail=False, methods=['get'], url_path='kpis')
    def kpis(self, request):
        inicio, fin, preset = _resolver_rango(request)
        hoy = timezone.now().date()

        ventas_hoy = _suma_ventas(_ventas_completadas_qs(hoy, hoy))
        inicio_mes = hoy.replace(day=1)
        ventas_mes = _suma_ventas(_ventas_completadas_qs(inicio_mes, hoy))
        ventas_periodo = _suma_ventas(_ventas_completadas_qs(inicio, fin))

        dias_periodo = max((fin - inicio).days + 1, 1)
        inicio_anterior = inicio - timedelta(days=dias_periodo)
        fin_anterior = inicio - timedelta(days=1)
        ventas_anterior = _suma_ventas(_ventas_completadas_qs(inicio_anterior, fin_anterior))

        pedidos_pendientes = Venta.objects.filter(
            Q(estado_venta__iexact='pendiente_validacion')
            | Q(estado_venta__iexact='pendiente_verificacion')
        ).count()

        alertas_stock = Inventario.objects.filter(stock_actual__lte=F('stock_minimo')).count()
        productos_activos = (
            Producto.objects.filter(estado__iexact='activo')
            .filter(inventario__stock_actual__gt=0)
            .count()
        )

        ventas_count_periodo = _ventas_completadas_qs(inicio, fin).count()

        evolucion = []
        cursor = inicio
        while cursor <= fin:
            total_dia = _suma_ventas(_ventas_completadas_qs(cursor, cursor))
            evolucion.append({'fecha': cursor.isoformat(), 'monto': str(total_dia)})
            cursor += timedelta(days=1)

        _registrar_consulta_reporte(
            request,
            'CONSULTAR_DASHBOARD',
            f'KPIs periodo={preset} ({inicio} a {fin}).',
        )

        return Response({
            'periodo': preset,
            'fecha_inicio': inicio.isoformat(),
            'fecha_fin': fin.isoformat(),
            'ventas_hoy': str(ventas_hoy),
            'ventas_mes': str(ventas_mes),
            'ventas_periodo': str(ventas_periodo),
            'ventas_count_periodo': ventas_count_periodo,
            'variacion_periodo_pct': _variacion_pct(ventas_periodo, ventas_anterior),
            'ventas_periodo_anterior': str(ventas_anterior),
            'pedidos_pendientes': pedidos_pendientes,
            'alertas_stock': alertas_stock,
            'productos_activos': productos_activos,
            'evolucion_diaria': evolucion,
        })

    @action(detail=False, methods=['get'], url_path='ventas-hoy')
    def ventas_hoy(self, request):
        hoy = timezone.now().date()
        qs = _ventas_completadas_qs(hoy, hoy)
        total = _suma_ventas(qs)
        count = qs.count()
        _registrar_consulta_reporte(request, 'CONSULTA_VOZ', 'Consulta ventas de hoy (asistente).')
        return Response({
            'fecha': hoy.isoformat(),
            'monto_total': str(total),
            'num_ventas': count,
            'mensaje': f'Hoy se registraron {count} ventas por un total de {total} bolivianos.',
        })

    @action(detail=False, methods=['get'], url_path='productos-top')
    def productos_top(self, request):
        inicio, fin, preset = _resolver_rango(request)
        criterio = (request.query_params.get('criterio') or 'unidades').strip().lower()
        id_categoria = request.query_params.get('id_categoria')
        id_marca = request.query_params.get('id_marca')

        detalles = DetalleVenta.objects.filter(
            id_venta__estado_venta__iexact='completada',
            id_venta__fecha_hora__date__gte=inicio,
            id_venta__fecha_hora__date__lte=fin,
        ).select_related('id_producto', 'id_producto__id_categoria', 'id_producto__id_marca')

        if id_categoria:
            detalles = detalles.filter(id_producto__id_categoria_id=id_categoria)
        if id_marca:
            detalles = detalles.filter(id_producto__id_marca_id=id_marca)

        ranking = (
            detalles.values(
                'id_producto',
                'id_producto__nombre',
                'id_producto__id_categoria__nombre',
                'id_producto__id_marca__nombre',
            )
            .annotate(
                total_unidades=Coalesce(Sum('cantidad'), 0),
                ingresos_generados=Coalesce(Sum('subtotal'), Decimal('0.00')),
            )
        )

        orden = '-total_unidades' if criterio != 'ingresos' else '-ingresos_generados'
        ranking = ranking.order_by(orden)[:50]

        total_unidades = sum(int(r['total_unidades'] or 0) for r in ranking)
        total_ingresos = sum(Decimal(str(r['ingresos_generados'] or 0)) for r in ranking)

        items = []
        for row in ranking:
            unidades = int(row['total_unidades'] or 0)
            ingresos = Decimal(str(row['ingresos_generados'] or 0))
            pct_base = total_unidades if criterio != 'ingresos' else total_ingresos
            valor = unidades if criterio != 'ingresos' else float(ingresos)
            pct = round((valor / float(pct_base)) * 100, 1) if pct_base else 0.0
            items.append({
                'id_producto': row['id_producto'],
                'nombre': row['id_producto__nombre'],
                'categoria': row['id_producto__id_categoria__nombre'],
                'marca': row['id_producto__id_marca__nombre'],
                'total_unidades': unidades,
                'ingresos_generados': str(ingresos),
                'porcentaje_periodo': pct,
            })

        _registrar_consulta_reporte(
            request,
            'CONSULTAR_PRODUCTOS_TOP',
            f'Ranking criterio={criterio} periodo={preset}.',
        )

        return Response({
            'periodo': preset,
            'fecha_inicio': inicio.isoformat(),
            'fecha_fin': fin.isoformat(),
            'criterio': criterio,
            'items': items,
        })

    @action(detail=False, methods=['get'], url_path='clientes-frecuentes')
    def clientes_frecuentes(self, request):
        dias = int(request.query_params.get('dias') or 90)
        umbral_compras = int(request.query_params.get('min_compras') or 3)
        umbral_monto = Decimal(str(request.query_params.get('min_monto') or '500'))

        hoy = timezone.now().date()
        inicio = hoy - timedelta(days=max(dias, 1))

        ventas = _ventas_completadas_qs(inicio, hoy)
        agregados = (
            ventas.values('id_cliente', 'id_cliente__nombre_completo', 'id_cliente__telefono', 'id_cliente__es_top')
            .annotate(
                num_compras=Count('id_venta'),
                monto_acumulado=Coalesce(Sum('monto_total'), Decimal('0.00')),
                ultima_compra=Count('id_venta'),
            )
        )

        # ultima compra real
        clientes_data = []
        for row in agregados:
            cid = row['id_cliente']
            ultima = ventas.filter(id_cliente_id=cid).order_by('-fecha_hora').values_list('fecha_hora', flat=True).first()
            num = int(row['num_compras'] or 0)
            monto = Decimal(str(row['monto_acumulado'] or 0))
            ticket = monto / num if num else Decimal('0')

            sugerido_top = num >= umbral_compras or monto >= umbral_monto
            if num == 0:
                categoria = 'Nuevo'
            elif sugerido_top or row['id_cliente__es_top']:
                categoria = 'TOP'
            elif num >= 2:
                categoria = 'Recurrente'
            else:
                categoria = 'Nuevo'

            clientes_data.append({
                'id_cliente': cid,
                'nombre_completo': row['id_cliente__nombre_completo'],
                'telefono': row['id_cliente__telefono'] or '',
                'es_top': bool(row['id_cliente__es_top']),
                'num_compras': num,
                'monto_acumulado': str(monto),
                'ticket_promedio': str(ticket.quantize(Decimal('0.01'))),
                'ultima_compra': ultima.isoformat() if ultima else None,
                'categoria': categoria,
                'sugerido_top': sugerido_top,
            })

        clientes_data.sort(key=lambda x: Decimal(x['monto_acumulado']), reverse=True)

        _registrar_consulta_reporte(request, 'CONSULTAR_CLIENTES_TOP', f'Clientes frecuentes ultimos {dias} dias.')

        return Response({
            'dias': dias,
            'reglas': {
                'min_compras': umbral_compras,
                'min_monto': str(umbral_monto),
            },
            'items': clientes_data,
        })

    @action(detail=False, methods=['get'], url_path='alertas-predictivas')
    def alertas_predictivas(self, request):
        dias_historial = int(request.query_params.get('dias') or 30)
        umbral_dias = int(request.query_params.get('umbral_dias') or 7)
        hoy = timezone.now().date()
        desde = timezone.now() - timedelta(days=max(dias_historial, 1))

        atendidos_ids = set(
            Bitacora.objects.filter(accion='ATENDER_ALERTA_PREDICTIVA')
            .values_list('registro_afectado_id', flat=True)
        )

        alertas = []
        productos = (
            Producto.objects.filter(estado__iexact='activo')
            .select_related('id_categoria', 'inventario')
        )

        for producto in productos:
            inventario = getattr(producto, 'inventario', None)
            stock = int(inventario.stock_actual) if inventario else 0
            stock_min = int(inventario.stock_minimo) if inventario else 0

            if stock < 0:
                alertas.append({
                    'id_producto': producto.id_producto,
                    'nombre': producto.nombre,
                    'categoria': producto.id_categoria.nombre if producto.id_categoria else '',
                    'stock_actual': stock,
                    'stock_minimo': stock_min,
                    'velocidad_diaria': None,
                    'dias_estimados': 0,
                    'nivel': 'critica',
                    'estado_calculo': 'stock_negativo',
                    'atendida': producto.id_producto in atendidos_ids,
                })
                continue

            salidas = (
                MovimientoInventario.objects.filter(
                    id_producto=producto,
                    tipo_movimiento='salida',
                    fecha_movimiento__gte=desde,
                ).aggregate(total=Coalesce(Sum('cantidad'), 0))['total']
                or 0
            )

            if salidas <= 0:
                continue

            velocidad = float(salidas) / float(dias_historial)
            dias_est = round(stock / velocidad, 1) if velocidad > 0 else None

            if dias_est is None:
                continue
            if dias_est > umbral_dias and stock > stock_min:
                continue

            nivel = 'critica' if dias_est <= 3 or stock <= stock_min else 'advertencia'

            alertas.append({
                'id_producto': producto.id_producto,
                'nombre': producto.nombre,
                'categoria': producto.id_categoria.nombre if producto.id_categoria else '',
                'stock_actual': stock,
                'stock_minimo': stock_min,
                'velocidad_diaria': round(velocidad, 2),
                'dias_estimados': dias_est,
                'nivel': nivel,
                'estado_calculo': 'ok',
                'atendida': producto.id_producto in atendidos_ids,
            })

        alertas.sort(key=lambda a: (a['dias_estimados'] if a['dias_estimados'] is not None else 9999))

        _registrar_consulta_reporte(request, 'CONSULTAR_ALERTAS_PREDICTIVAS', f'Alertas umbral={umbral_dias} dias.')

        return Response({
            'dias_historial': dias_historial,
            'umbral_dias': umbral_dias,
            'items': alertas,
        })

    @action(detail=False, methods=['post'], url_path='alertas-atender')
    def atender_alerta(self, request):
        id_producto = request.data.get('id_producto')
        nota = (request.data.get('nota') or '').strip() or 'Alerta marcada como atendida.'
        if not id_producto:
            return Response({'detail': 'id_producto es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)

        producto = Producto.objects.filter(pk=id_producto).first()
        if producto is None:
            return Response({'detail': 'Producto no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        usuario = request.user
        Bitacora.objects.create(
            id_usuario=usuario,
            accion='ATENDER_ALERTA_PREDICTIVA',
            tabla_afectada='productos',
            registro_afectado_id=producto.pk,
            detalle=f'Alerta predictiva atendida para "{producto.nombre}". {nota}',
            fecha_hora=timezone.now(),
            direccion_ip=_get_client_ip(request),
        )
        return Response({'detail': 'Alerta registrada como atendida.', 'id_producto': producto.pk})

    @action(detail=False, methods=['get'], url_path='tendencias')
    def tendencias(self, request):
        dimension = (request.query_params.get('dimension') or 'categoria').strip().lower()
        periodo = (request.query_params.get('periodo') or 'mes').strip().lower()
        hoy = timezone.now().date()

        if periodo == 'trimestre':
            meses_atras = 3
        elif periodo == 'anual':
            meses_atras = 12
        else:
            meses_atras = 6

        inicio = (hoy.replace(day=1) - timedelta(days=30 * (meses_atras - 1))).replace(day=1)

        detalles = DetalleVenta.objects.filter(
            id_venta__estado_venta__iexact='completada',
            id_venta__fecha_hora__date__gte=inicio,
            id_venta__fecha_hora__date__lte=hoy,
        ).select_related(
            'id_producto__id_categoria',
            'id_producto__id_marca',
            'id_venta__id_cliente',
        )

        buckets = {}
        for det in detalles:
            venta = det.id_venta
            mes_key = venta.fecha_hora.strftime('%Y-%m')
            if dimension == 'marca':
                clave = det.id_producto.id_marca.nombre if det.id_producto.id_marca else 'Sin marca'
            elif dimension == 'ciudad':
                clave = venta.id_cliente.ciudad or 'Sin ciudad'
            else:
                clave = det.id_producto.id_categoria.nombre if det.id_producto.id_categoria else 'Sin categoria'

            buckets.setdefault(clave, {})
            buckets[clave][mes_key] = buckets[clave].get(mes_key, Decimal('0')) + Decimal(str(det.subtotal))

        series = []
        for nombre, meses_map in buckets.items():
            puntos = [{'periodo': k, 'monto': str(v)} for k, v in sorted(meses_map.items())]
            if len(puntos) >= 2:
                actual = Decimal(puntos[-1]['monto'])
                anterior = Decimal(puntos[-2]['monto'])
                variacion = _variacion_pct(actual, anterior)
            else:
                variacion = 0.0
            series.append({
                'nombre': nombre,
                'puntos': puntos,
                'variacion_ultimo_pct': variacion,
            })

        series.sort(key=lambda s: Decimal(s['puntos'][-1]['monto']) if s['puntos'] else 0, reverse=True)

        _registrar_consulta_reporte(
            request,
            'CONSULTAR_TENDENCIAS',
            f'Tendencias dimension={dimension} periodo={periodo}.',
        )

        return Response({
            'dimension': dimension,
            'periodo': periodo,
            'fecha_inicio': inicio.isoformat(),
            'fecha_fin': hoy.isoformat(),
            'series': series,
        })

    @action(detail=False, methods=['get'], url_path='consulta-voz')
    def consulta_voz(self, request):
        """Endpoint auxiliar CU24: stock por nombre de producto."""
        nombre = (request.query_params.get('producto') or '').strip()
        if not nombre:
            return Response({'detail': 'Indica el parametro producto.'}, status=status.HTTP_400_BAD_REQUEST)

        producto = (
            Producto.objects.filter(nombre__icontains=nombre, estado__iexact='activo')
            .select_related('inventario')
            .first()
        )
        if producto is None:
            return Response({
                'encontrado': False,
                'mensaje': f'No encontre un producto activo con el nombre "{nombre}".',
            })

        stock = int(producto.inventario.stock_actual) if hasattr(producto, 'inventario') and producto.inventario else 0
        return Response({
            'encontrado': True,
            'id_producto': producto.id_producto,
            'nombre': producto.nombre,
            'stock_actual': stock,
            'mensaje': f'El producto {producto.nombre} tiene {stock} unidades en stock.',
        })

    @action(detail=False, methods=['post'], url_path='asistente')
    def asistente(self, request):
        """CU24 — Asistente conversacional con Gemini (fallback a reglas en frontend)."""
        mensaje = (request.data.get('mensaje') or '').strip()
        if not mensaje:
            return Response({'detail': 'El campo mensaje es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)

        historial = request.data.get('historial')
        if historial is not None and not isinstance(historial, list):
            return Response({'detail': 'historial debe ser una lista.'}, status=status.HTTP_400_BAD_REQUEST)

        from .views_asistente import procesar_mensaje_asistente

        resultado = procesar_mensaje_asistente(mensaje, historial)
        _registrar_consulta_reporte(
            request,
            'CONSULTA_ASISTENTE_GEMINI' if resultado.get('modo') == 'gemini' else 'CONSULTA_ASISTENTE_REGLAS',
            f'Asistente: "{mensaje[:120]}" modo={resultado.get("modo")}',
        )

        if resultado.get('usar_fallback'):
            return Response(resultado, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(resultado)
