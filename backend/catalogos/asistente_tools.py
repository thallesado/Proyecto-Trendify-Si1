"""Herramientas del asistente CU24 — consultas reales sobre la BD Trendify."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import (
    Bitacora,
    Categoria,
    Cliente,
    Compra,
    DetalleVenta,
    Inventario,
    Marca,
    MovimientoInventario,
    Producto,
    Proveedor,
    Rol,
    Usuario,
    Venta,
)

MODULOS_VALIDOS = {
    'caja',
    'dashboard',
    'productos_top',
    'clientes_frecuentes',
    'alertas_predictivas',
    'tendencias',
    'categorias',
    'clientes',
    'productos',
    'proveedores',
    'compras',
    'pedidos_online',
    'inventario',
    'usuarios',
    'roles',
    'bitacora',
    'perfil',
}


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


def tool_consultar_ventas_hoy(_args: dict) -> dict:
    hoy = timezone.now().date()
    qs = _ventas_completadas_qs(hoy, hoy)
    total = _suma_ventas(qs)
    count = qs.count()
    return {
        'fecha': hoy.isoformat(),
        'num_ventas': count,
        'monto_total_bob': str(total),
    }


def tool_consultar_stock_producto(args: dict) -> dict:
    nombre = (args.get('producto') or '').strip()
    if not nombre:
        return {'encontrado': False, 'mensaje': 'Indica el nombre del producto.'}

    producto = (
        Producto.objects.filter(nombre__icontains=nombre, estado__iexact='activo')
        .select_related('inventario')
        .first()
    )
    if producto is None:
        return {'encontrado': False, 'mensaje': f'No hay producto activo con nombre similar a "{nombre}".'}

    stock = int(producto.inventario.stock_actual) if getattr(producto, 'inventario', None) else 0
    return {
        'encontrado': True,
        'id_producto': producto.id_producto,
        'nombre': producto.nombre,
        'stock_actual': stock,
    }


def tool_consultar_productos_top(args: dict) -> dict:
    hoy = timezone.now().date()
    periodo = (args.get('periodo') or 'mes').strip().lower()
    criterio = (args.get('criterio') or 'unidades').strip().lower()

    if periodo == 'hoy':
        inicio = fin = hoy
    elif periodo == 'semana':
        inicio = hoy - timedelta(days=hoy.weekday())
        fin = hoy
    else:
        inicio = hoy.replace(day=1)
        fin = hoy

    detalles = DetalleVenta.objects.filter(
        id_venta__estado_venta__iexact='completada',
        id_venta__fecha_hora__date__gte=inicio,
        id_venta__fecha_hora__date__lte=fin,
    )
    ranking = (
        detalles.values('id_producto', 'id_producto__nombre')
        .annotate(
            total_unidades=Coalesce(Sum('cantidad'), 0),
            ingresos=Coalesce(Sum('subtotal'), Decimal('0.00')),
        )
        .order_by('-total_unidades' if criterio != 'ingresos' else '-ingresos')[:5]
    )
    items = [
        {
            'nombre': row['id_producto__nombre'],
            'unidades': int(row['total_unidades'] or 0),
            'ingresos_bob': str(row['ingresos'] or 0),
        }
        for row in ranking
    ]
    return {'periodo': periodo, 'criterio': criterio, 'items': items}


def tool_consultar_clientes_frecuentes(args: dict) -> dict:
    dias = int(args.get('dias') or 90)
    hoy = timezone.now().date()
    inicio = hoy - timedelta(days=max(dias, 1))
    ventas = _ventas_completadas_qs(inicio, hoy)
    agregados = (
        ventas.values('id_cliente', 'id_cliente__nombre_completo', 'id_cliente__es_top')
        .annotate(
            num_compras=Count('id_venta'),
            monto_acumulado=Coalesce(Sum('monto_total'), Decimal('0.00')),
        )
        .order_by('-monto_acumulado')[:5]
    )
    items = [
        {
            'nombre': row['id_cliente__nombre_completo'],
            'es_top': bool(row['id_cliente__es_top']),
            'compras': int(row['num_compras'] or 0),
            'monto_bob': str(row['monto_acumulado'] or 0),
        }
        for row in agregados
    ]
    return {'dias': dias, 'items': items}


def tool_consultar_alertas_stock(_args: dict) -> dict:
    hoy = timezone.now().date()
    desde = timezone.now() - timedelta(days=30)
    bajo_minimo = Inventario.objects.filter(stock_actual__lte=F('stock_minimo')).count()

    alertas = []
    for producto in Producto.objects.filter(estado__iexact='activo').select_related('inventario')[:50]:
        inventario = getattr(producto, 'inventario', None)
        if inventario is None:
            continue
        stock = int(inventario.stock_actual)
        stock_min = int(inventario.stock_minimo)
        salidas = (
            MovimientoInventario.objects.filter(
                id_producto=producto,
                tipo_movimiento='salida',
                fecha_movimiento__gte=desde,
            ).aggregate(total=Coalesce(Sum('cantidad'), 0))['total']
            or 0
        )
        if salidas <= 0 and stock > stock_min:
            continue
        velocidad = float(salidas) / 30.0 if salidas > 0 else 0
        dias_est = round(stock / velocidad, 1) if velocidad > 0 else None
        if dias_est is not None and dias_est > 7 and stock > stock_min:
            continue
        if stock <= stock_min or (dias_est is not None and dias_est <= 7):
            alertas.append({
                'nombre': producto.nombre,
                'stock_actual': stock,
                'stock_minimo': stock_min,
                'dias_estimados': dias_est,
            })

    alertas.sort(key=lambda a: (a['dias_estimados'] if a['dias_estimados'] is not None else 999))
    return {
        'fecha': hoy.isoformat(),
        'productos_bajo_minimo': bajo_minimo,
        'alertas_predictivas': alertas[:5],
    }


def tool_consultar_kpis(args: dict) -> dict:
    hoy = timezone.now().date()
    periodo = (args.get('periodo') or 'mes').strip().lower()
    if periodo == 'hoy':
        inicio = fin = hoy
    elif periodo == 'semana':
        inicio = hoy - timedelta(days=hoy.weekday())
        fin = hoy
    else:
        inicio = hoy.replace(day=1)
        fin = hoy

    ventas_periodo = _suma_ventas(_ventas_completadas_qs(inicio, fin))
    ventas_hoy = _suma_ventas(_ventas_completadas_qs(hoy, hoy))
    pedidos_pendientes = Venta.objects.filter(
        estado_venta__iexact='pendiente_validacion'
    ).count() + Venta.objects.filter(
        estado_venta__iexact='pendiente_verificacion'
    ).count()

    return {
        'periodo': periodo,
        'ventas_hoy_bob': str(ventas_hoy),
        'ventas_periodo_bob': str(ventas_periodo),
        'pedidos_pendientes': pedidos_pendientes,
        'productos_bajo_minimo': Inventario.objects.filter(stock_actual__lte=F('stock_minimo')).count(),
    }


def tool_navegar_modulo(args: dict) -> dict:
    modulo = (args.get('modulo') or '').strip().lower()
    if modulo not in MODULOS_VALIDOS:
        return {'ok': False, 'mensaje': f'Modulo "{modulo}" no valido.', 'modulo': None}
    return {'ok': True, 'modulo': modulo}


def tool_consultar_resumen_sistema(args: dict) -> dict:
    """Conteos y listas del panel admin: usuarios, roles, catalogo, pedidos."""
    seccion = (args.get('seccion') or 'general').strip().lower()

    roles_qs = Rol.objects.all().order_by('id_rol')
    roles_lista = [
        {'id_rol': r.id_rol, 'nombre': r.nombre_rol, 'descripcion': (r.descripcion or '')[:80]}
        for r in roles_qs
    ]
    usuarios_activos = Usuario.objects.filter(estado__iexact='activo')
    usuarios_por_rol = (
        usuarios_activos.values('id_rol__nombre_rol')
        .annotate(cantidad=Count('id_usuario'))
        .order_by('-cantidad')
    )
    usuarios_resumen = [
        {'rol': row['id_rol__nombre_rol'], 'cantidad': int(row['cantidad'])}
        for row in usuarios_por_rol
    ]

    pendientes_validacion = Venta.objects.filter(estado_venta__iexact='pendiente_validacion').count()
    pendientes_verificacion = Venta.objects.filter(estado_venta__iexact='pendiente_verificacion').count()

    base = {
        'seccion': seccion,
        'roles_total': roles_qs.count(),
        'roles': roles_lista,
        'usuarios_total': Usuario.objects.count(),
        'usuarios_activos': usuarios_activos.count(),
        'usuarios_por_rol': usuarios_resumen,
        'clientes_total': Cliente.objects.filter(estado__iexact='activo').count(),
        'clientes_top': Cliente.objects.filter(es_top=True, estado__iexact='activo').count(),
        'productos_activos': Producto.objects.filter(estado__iexact='activo').count(),
        'categorias_activas': Categoria.objects.filter(estado__iexact='activo').count(),
        'marcas_activas': Marca.objects.filter(estado__iexact='activo').count(),
        'proveedores_activos': Proveedor.objects.filter(estado__iexact='activo').count(),
        'compras_registradas': Compra.objects.count(),
        'ventas_total': Venta.objects.count(),
        'ventas_completadas': Venta.objects.filter(estado_venta__iexact='completada').count(),
        'pedidos_pendientes_validacion': pendientes_validacion,
        'pedidos_pendientes_verificacion': pendientes_verificacion,
        'productos_bajo_minimo': Inventario.objects.filter(stock_actual__lte=F('stock_minimo')).count(),
    }

    if seccion == 'usuarios':
        return {k: base[k] for k in (
            'seccion', 'usuarios_total', 'usuarios_activos', 'usuarios_por_rol',
        )}
    if seccion == 'roles':
        return {k: base[k] for k in ('seccion', 'roles_total', 'roles')}
    if seccion == 'catalogo':
        return {k: base[k] for k in (
            'seccion', 'productos_activos', 'categorias_activas',
            'marcas_activas', 'proveedores_activos', 'productos_bajo_minimo',
        )}
    if seccion == 'pedidos':
        return {k: base[k] for k in (
            'seccion', 'pedidos_pendientes_validacion', 'pedidos_pendientes_verificacion',
            'ventas_total', 'ventas_completadas',
        )}
    return base


def tool_consultar_pedidos_pendientes(_args: dict) -> dict:
    ventas = (
        Venta.objects.filter(
            Q(estado_venta__iexact='pendiente_validacion')
            | Q(estado_venta__iexact='pendiente_verificacion')
        )
        .select_related('id_cliente')
        .order_by('-fecha_hora')[:8]
    )
    items = [
        {
            'id_venta': v.id_venta,
            'cliente': v.id_cliente.nombre_completo if v.id_cliente else '',
            'monto_bob': str(v.monto_total),
            'estado': v.estado_venta,
            'metodo_pago': v.metodo_pago,
            'fecha': v.fecha_hora.isoformat() if v.fecha_hora else None,
        }
        for v in ventas
    ]
    return {
        'total': len(items),
        'pendientes_validacion': Venta.objects.filter(estado_venta__iexact='pendiente_validacion').count(),
        'pendientes_verificacion': Venta.objects.filter(estado_venta__iexact='pendiente_verificacion').count(),
        'items': items,
    }


def tool_buscar_cliente(args: dict) -> dict:
    nombre = (args.get('nombre') or '').strip()
    if not nombre:
        return {'encontrado': False, 'mensaje': 'Indica el nombre del cliente.'}
    clientes = Cliente.objects.filter(
        nombre_completo__icontains=nombre,
        estado__iexact='activo',
    ).order_by('nombre_completo')[:5]
    if not clientes:
        return {'encontrado': False, 'mensaje': f'No hay clientes activos con nombre similar a "{nombre}".'}
    items = [
        {
            'nombre': c.nombre_completo,
            'telefono': c.telefono or '',
            'ciudad': c.ciudad or '',
            'es_top': bool(c.es_top),
        }
        for c in clientes
    ]
    return {'encontrado': True, 'cantidad': len(items), 'items': items}


def tool_consultar_ventas_periodo(args: dict) -> dict:
    hoy = timezone.now().date()
    periodo = (args.get('periodo') or 'mes').strip().lower()
    if periodo == 'hoy':
        inicio = fin = hoy
    elif periodo == 'semana':
        inicio = hoy - timedelta(days=hoy.weekday())
        fin = hoy
    elif periodo == 'anio':
        inicio = hoy.replace(month=1, day=1)
        fin = hoy
    else:
        inicio = hoy.replace(day=1)
        fin = hoy

    qs = _ventas_completadas_qs(inicio, fin)
    return {
        'periodo': periodo,
        'fecha_inicio': inicio.isoformat(),
        'fecha_fin': fin.isoformat(),
        'num_ventas': qs.count(),
        'monto_total_bob': str(_suma_ventas(qs)),
    }


def tool_consultar_compras(args: dict) -> dict:
    """Compras a proveedores: ultimas ordenes y totales por periodo."""
    hoy = timezone.now().date()
    periodo = (args.get('periodo') or 'mes').strip().lower()
    proveedor_nombre = (args.get('proveedor') or '').strip()

    if periodo == 'hoy':
        inicio = fin = hoy
    elif periodo == 'semana':
        inicio = hoy - timedelta(days=hoy.weekday())
        fin = hoy
    elif periodo == 'anio':
        inicio = hoy.replace(month=1, day=1)
        fin = hoy
    else:
        inicio = hoy.replace(day=1)
        fin = hoy

    compras_qs = Compra.objects.filter(
        fecha_compra__date__gte=inicio,
        fecha_compra__date__lte=fin,
    ).select_related('id_proveedor', 'id_usuario')

    if proveedor_nombre:
        compras_qs = compras_qs.filter(id_proveedor__nombre_empresa__icontains=proveedor_nombre)

    monto_total = compras_qs.aggregate(
        total=Coalesce(Sum('monto_total'), Decimal('0.00'))
    )['total'] or Decimal('0')
    compras = compras_qs.order_by('-fecha_compra')[:10]

    items = [
        {
            'id_compra': c.id_compra,
            'proveedor': c.id_proveedor.nombre_empresa if c.id_proveedor else '',
            'monto_bob': str(c.monto_total),
            'estado': c.estado_compra,
            'registrado_por': c.id_usuario.nombre_completo if c.id_usuario else '',
            'fecha': c.fecha_compra.isoformat() if c.fecha_compra else None,
        }
        for c in compras
    ]

    por_proveedor = (
        Compra.objects.filter(fecha_compra__date__gte=inicio, fecha_compra__date__lte=fin)
        .values('id_proveedor__nombre_empresa')
        .annotate(total=Coalesce(Sum('monto_total'), Decimal('0.00')), cantidad=Count('id_compra'))
        .order_by('-total')[:5]
    )
    resumen_proveedores = [
        {
            'proveedor': row['id_proveedor__nombre_empresa'],
            'compras': int(row['cantidad']),
            'monto_bob': str(row['total'] or 0),
        }
        for row in por_proveedor
    ]

    return {
        'periodo': periodo,
        'fecha_inicio': inicio.isoformat(),
        'fecha_fin': fin.isoformat(),
        'num_compras': compras_qs.count(),
        'monto_total_periodo_bob': str(monto_total),
        'ultimas_compras': items,
        'top_proveedores_periodo': resumen_proveedores,
    }


def tool_consultar_bitacora(args: dict) -> dict:
    """Ultimos movimientos auditados del sistema."""
    limite = min(int(args.get('limite') or 8), 15)
    accion_filtro = (args.get('accion') or '').strip()
    tabla_filtro = (args.get('tabla') or '').strip()

    qs = Bitacora.objects.select_related('id_usuario').order_by('-fecha_hora')
    if accion_filtro:
        qs = qs.filter(accion__icontains=accion_filtro)
    if tabla_filtro:
        qs = qs.filter(tabla_afectada__icontains=tabla_filtro)

    registros = qs[:limite]
    items = [
        {
            'fecha': b.fecha_hora.isoformat() if b.fecha_hora else None,
            'usuario': b.id_usuario.nombre_completo if b.id_usuario else '',
            'accion': b.accion,
            'tabla': b.tabla_afectada,
            'detalle': (b.detalle or '')[:120],
        }
        for b in registros
    ]

    return {
        'total_mostrados': len(items),
        'registros_recientes': items,
    }


EJECUTORES = {
    'consultar_ventas_hoy': tool_consultar_ventas_hoy,
    'consultar_ventas_periodo': tool_consultar_ventas_periodo,
    'consultar_stock_producto': tool_consultar_stock_producto,
    'consultar_productos_top': tool_consultar_productos_top,
    'consultar_clientes_frecuentes': tool_consultar_clientes_frecuentes,
    'consultar_alertas_stock': tool_consultar_alertas_stock,
    'consultar_kpis': tool_consultar_kpis,
    'consultar_resumen_sistema': tool_consultar_resumen_sistema,
    'consultar_pedidos_pendientes': tool_consultar_pedidos_pendientes,
    'consultar_compras': tool_consultar_compras,
    'consultar_bitacora': tool_consultar_bitacora,
    'buscar_cliente': tool_buscar_cliente,
    'navegar_modulo': tool_navegar_modulo,
}


def ejecutar_herramienta(nombre: str, argumentos: dict | None) -> dict:
    fn = EJECUTORES.get(nombre)
    if fn is None:
        return {'error': f'Herramienta desconocida: {nombre}'}
    try:
        return fn(argumentos or {})
    except (TypeError, ValueError) as exc:
        return {'error': str(exc)}
