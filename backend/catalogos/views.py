import csv
import os
from decimal import Decimal
from io import BytesIO
from urllib.parse import urlencode

from django.db import transaction
from django.db.models import Q, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.db.utils import OperationalError, ProgrammingError
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework import status, viewsets
from rest_framework.response import Response
import stripe

from .authentication import CustomJWTAuthentication

# Importa modelos y serializers de esta misma app.
from .models import (
    Bitacora,
    Categoria,
    Cliente,
    Compra,
    DetalleCompra,
    DetallePedidoGuardado,
    DetalleVenta,
    Inventario,
    Marca,
    MovimientoInventario,
    PedidoGuardado,
    PagoTransaccion,
    Producto,
    Proveedor,
    Rol,
    Usuario,
    Venta,
    Favorito,
)
from .serializers import (
    BitacoraSerializer,
    CategoriaSerializer,
    ClienteSerializer,
    CompraSerializer,
    DetalleVentaSerializer,
    FavoritoDetalleSerializer,
    InventarioSerializer,
    MarcaSerializer,
    MovimientoInventarioSerializer,
    PedidoGuardadoSerializer,
    ProductoPublicoSerializer,
    ProductoSerializer,
    ProveedorSerializer,
    RolSerializer,
    UsuarioSerializer,
    VentaSerializer,
)
from .permissions import (
    IsAdminOrAuditorRole,
    IsAdminOrComprasRole,
    IsAdminOrVendedorRole,
    IsAdminRole,
    IsCatalogoReadRole,
    IsClienteRole,
    IsInventarioRole,
    ROLE_CLIENTE,
    extract_user_role_id,
)


# Campos que nunca deben aparecer en el detalle de la bitacora.
BITACORA_CAMPOS_SENSIBLES = {'password_hash', 'password'}
# Cuando un valor del diff supera este tamano (ej. data URI base64 de imagen),
# lo resumimos para no inflar la bitacora con miles de caracteres por UPDATE.
BITACORA_VALOR_MAX_CARACTERES = 200


def _resumir_valor_bitacora(valor):
    texto = str(valor) if valor is not None else ''
    if len(texto) <= BITACORA_VALOR_MAX_CARACTERES:
        return texto
    return f'<{len(texto)} caracteres omitidos>'


def get_client_ip_from_request(request):
    """Extrae la IP del cliente respetando X-Forwarded-For si existe."""
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _estado_pago_desde_estado_venta(estado_venta):
    estado = (estado_venta or '').strip().lower()
    if estado == 'completada':
        return 'confirmado'
    if estado == 'rechazada':
        return 'rechazado'
    return 'pendiente'


def _estado_venta_pos_desde_metodo_pago(metodo_pago):
    """CU08/CU09: efectivo y tarjeta completan la venta; QR/transferencia quedan pendientes."""
    metodo = (metodo_pago or '').strip().lower()
    if metodo in ('qr', 'pago_movil_qr', 'transferencia'):
        return 'pendiente_verificacion'
    return 'completada'


def _venta_pendiente_confirmacion(estado_venta):
    estado = (estado_venta or '').strip().lower()
    return estado in ('pendiente_validacion', 'pendiente_verificacion')


def _validar_stock_y_productos_venta(detalles):
    """Agrupa cantidades por producto y valida estado activo + stock (CU08/CU11)."""
    cantidades_por_producto = {}
    for detalle in detalles:
        producto = detalle['id_producto']
        pid = producto.pk
        cantidad = int(detalle['cantidad'])
        if cantidad <= 0:
            raise ValueError('Cada item debe tener cantidad mayor a cero.')
        cantidades_por_producto[pid] = cantidades_por_producto.get(pid, 0) + cantidad

    errores = []
    for pid, cantidad_total in cantidades_por_producto.items():
        producto = Producto.objects.select_for_update().filter(pk=pid).first()
        if producto is None:
            errores.append(f'Producto no encontrado (id={pid}).')
            continue
        if (producto.estado or '').strip().lower() != 'activo':
            errores.append(f'El producto "{producto.nombre}" no esta activo.')
            continue
        inventario = Inventario.objects.select_for_update().filter(id_producto=producto).first()
        stock_disponible = int(inventario.stock_actual) if inventario else 0
        if cantidad_total > stock_disponible:
            errores.append(
                f'Stock insuficiente para "{producto.nombre}". '
                f'Disponible: {stock_disponible}, solicitado: {cantidad_total}.'
            )

    if errores:
        raise ValueError(' '.join(errores))


def _tabla_pago_transacciones_disponible():
    try:
        PagoTransaccion.objects.values_list('id_pago_transaccion', flat=True)[:1]
        return True
    except (ProgrammingError, OperationalError):
        return False


def _crear_pago_transaccion_segura(**kwargs):
    if not _tabla_pago_transacciones_disponible():
        return None
    try:
        return PagoTransaccion.objects.create(**kwargs)
    except (ProgrammingError, OperationalError):
        return None


def _actualizar_ultima_pago_transaccion_segura(id_venta, **update_fields):
    if not _tabla_pago_transacciones_disponible():
        return
    try:
        tx = (
            PagoTransaccion.objects
            .filter(id_venta=id_venta)
            .order_by('-id_pago_transaccion')
            .first()
        )
        if tx is None:
            return
        for key, value in update_fields.items():
            setattr(tx, key, value)
        tx.actualizado_en = timezone.now()
        tx.save(update_fields=[*list(update_fields.keys()), 'actualizado_en'])
    except (ProgrammingError, OperationalError):
        return


def _stripe_config():
    def _read_local_env_value(key):
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
        env_path = os.path.abspath(env_path)
        if not os.path.exists(env_path):
            return ''
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    if k.strip() == key:
                        return v.strip().strip('"').strip("'")
        except OSError:
            return ''
        return ''

    secret_key = (os.environ.get('STRIPE_SECRET_KEY') or _read_local_env_value('STRIPE_SECRET_KEY')).strip()
    webhook_secret = (os.environ.get('STRIPE_WEBHOOK_SECRET') or _read_local_env_value('STRIPE_WEBHOOK_SECRET')).strip()
    currency = (os.environ.get('STRIPE_CURRENCY') or _read_local_env_value('STRIPE_CURRENCY') or 'bob').strip().lower()
    return secret_key, webhook_secret, currency


def _build_frontend_checkout_urls(request, venta_id):
    base_public = (os.environ.get('FRONTEND_PUBLIC_URL') or '').strip().rstrip('/')
    if not base_public:
        origin = (request.META.get('HTTP_ORIGIN') or '').strip().rstrip('/')
        base_public = origin
    if not base_public:
        base_public = 'http://127.0.0.1:5173'

    success_qs = urlencode({'stripe': 'success', 'venta_id': str(venta_id)})
    cancel_qs = urlencode({'stripe': 'cancel', 'venta_id': str(venta_id)})
    return (
        f'{base_public}/?{success_qs}',
        f'{base_public}/?{cancel_qs}',
    )


def _revertir_stock_venta(venta, usuario_actual, motivo):
    if (venta.estado_venta or '').lower() == 'rechazada':
        return False

    with transaction.atomic():
        for detalle in DetalleVenta.objects.filter(id_venta=venta).select_related('id_producto'):
            MovimientoInventario.objects.create(
                id_producto=detalle.id_producto,
                id_usuario=usuario_actual,
                tipo_movimiento='entrada',
                cantidad=detalle.cantidad,
                motivo=motivo,
            )
        venta.estado_venta = 'rechazada'
        venta.save(update_fields=['estado_venta'])
    return True


class BitacoraMixin:
    def _get_client_ip(self):
        return get_client_ip_from_request(self.request)

    def _get_usuario_bitacora(self):
        usuario = getattr(self.request, 'user', None)
        if usuario is None:
            return None

        if not hasattr(usuario, 'id_usuario'):
            return None

        return usuario

    def _registrar_bitacora(self, *, accion, tabla_afectada, registro_afectado_id, detalle):
        usuario = self._get_usuario_bitacora()
        if usuario is None:
            return

        Bitacora.objects.create(
            id_usuario=usuario,
            accion=accion,
            tabla_afectada=tabla_afectada,
            registro_afectado_id=registro_afectado_id,
            detalle=detalle,
            fecha_hora=timezone.now(),
            direccion_ip=self._get_client_ip(),
        )

    def _snapshot_instancia(self, instance):
        """Captura el estado actual de los campos persistidos (sin sensibles)."""
        if instance is None:
            return {}
        snapshot = {}
        for field in instance._meta.fields:
            if field.name in BITACORA_CAMPOS_SENSIBLES:
                continue
            snapshot[field.name] = getattr(instance, field.name)
        return snapshot

    def _diff_cambios(self, antes, despues):
        cambios = []
        for campo, valor_antes in antes.items():
            valor_despues = despues.get(campo)
            if str(valor_antes) != str(valor_despues):
                cambios.append(
                    f"{campo}: '{_resumir_valor_bitacora(valor_antes)}' -> "
                    f"'{_resumir_valor_bitacora(valor_despues)}'"
                )
        return cambios

    def perform_create(self, serializer):
        instance = serializer.save()
        self._registrar_bitacora(
            accion='INSERT',
            tabla_afectada=instance._meta.db_table,
            registro_afectado_id=instance.pk,
            detalle=f'Se creo registro {instance._meta.model_name} con id={instance.pk}.',
        )

    def perform_update(self, serializer):
        instance_anterior = self.get_object()
        antes = self._snapshot_instancia(instance_anterior)
        instance = serializer.save()
        despues = self._snapshot_instancia(instance)
        cambios = self._diff_cambios(antes, despues)
        if cambios:
            detalle = (
                f'Actualizo {instance._meta.model_name} id={instance.pk}. '
                f'Cambios: ' + ', '.join(cambios)
            )
        else:
            detalle = (
                f'Actualizo {instance._meta.model_name} id={instance.pk}. '
                f'Sin cambios visibles.'
            )
        self._registrar_bitacora(
            accion='UPDATE',
            tabla_afectada=instance._meta.db_table,
            registro_afectado_id=instance.pk,
            detalle=detalle,
        )

    def perform_destroy(self, instance):
        tabla_afectada = instance._meta.db_table
        registro_afectado_id = instance.pk
        descripcion = str(instance)
        detalle = (
            f'Se elimino registro {instance._meta.model_name} id={instance.pk} '
            f"({descripcion})."
        )

        super().perform_destroy(instance)

        self._registrar_bitacora(
            accion='DELETE',
            tabla_afectada=tabla_afectada,
            registro_afectado_id=registro_afectado_id,
            detalle=detalle,
        )


class RolViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Rol.objects.all()
    serializer_class = RolSerializer
    permission_classes = [IsAdminRole]


class CategoriaViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [IsCatalogoReadRole]


class MarcaViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Marca.objects.all()
    serializer_class = MarcaSerializer
    permission_classes = [IsCatalogoReadRole]


class UsuarioViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [IsAdminRole]


class ClienteViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [IsAdminOrVendedorRole]


class ProveedorViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [IsAdminOrComprasRole]

    def create(self, request, *args, **kwargs):
        nombre = (request.data.get('nombre_empresa') or '').strip()
        if nombre and Proveedor.objects.filter(nombre_empresa__iexact=nombre).exists():
            return Response(
                {'detail': 'Ya existe un proveedor con ese nombre de empresa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        nombre = (request.data.get('nombre_empresa') or instance.nombre_empresa or '').strip()
        if (
            nombre
            and Proveedor.objects.filter(nombre_empresa__iexact=nombre)
            .exclude(pk=instance.pk)
            .exists()
        ):
            return Response(
                {'detail': 'Ya existe otro proveedor con ese nombre de empresa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)


class ProductoViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Producto.objects.all()
    serializer_class = ProductoSerializer
    permission_classes = [IsCatalogoReadRole]


class MisPedidosView(APIView):
    permission_classes = [IsClienteRole]

    def get(self, request):
        usuario = request.user
        cliente = Cliente.objects.filter(id_usuario_fk=usuario).first()
        if not cliente:
            return Response([])
        
        ventas = Venta.objects.filter(id_cliente=cliente).order_by('-fecha_hora').prefetch_related('detalles_venta')
        serializer = VentaSerializer(ventas, many=True)
        return Response(serializer.data)


class MiPerfilClienteView(APIView):
    """Datos de envio del cliente autenticado (CU20)."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsClienteRole]

    def get(self, request):
        cliente = Cliente.objects.filter(id_usuario_fk=request.user).first()
        if not cliente:
            return Response(
                {'detail': 'No existe un cliente asociado a tu usuario.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ClienteSerializer(cliente)
        return Response(serializer.data)

    def patch(self, request):
        cliente = Cliente.objects.filter(id_usuario_fk=request.user).first()
        if not cliente:
            return Response(
                {'detail': 'No existe un cliente asociado a tu usuario.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        campos = {}
        for campo in ('nombre_completo', 'telefono', 'ciudad', 'direccion'):
            if campo in request.data:
                valor = str(request.data.get(campo) or '').strip()
                campos[campo] = valor

        if not campos:
            return Response({'detail': 'No hay campos para actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

        telefono_nuevo = campos.get('telefono')
        if telefono_nuevo and Cliente.objects.filter(telefono=telefono_nuevo).exclude(pk=cliente.pk).exists():
            return Response(
                {'detail': 'El telefono ya esta registrado por otro cliente.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for campo, valor in campos.items():
            setattr(cliente, campo, valor)
        cliente.save(update_fields=list(campos.keys()))

        serializer = ClienteSerializer(cliente)
        return Response(serializer.data)

class MisFavoritosView(APIView):
    """Favoritos del cliente autenticado."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsClienteRole]

    def get(self, request):
        favoritos = (
            Favorito.objects
            .filter(id_usuario=request.user)
            .order_by('id_favorito')
        )

        serializer = FavoritoDetalleSerializer(favoritos, many=True)
        return Response(serializer.data)

    def post(self, request):
        id_producto = request.data.get('id_producto')

        if not id_producto:
            return Response(
                {'detail': 'El id_producto es obligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        producto = Producto.objects.filter(id_producto=id_producto, estado__iexact='activo').first()
        if not producto:
            return Response(
                {'detail': 'El producto no existe o no esta activo.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        favorito, creado = Favorito.objects.get_or_create(
            id_usuario=request.user,
            id_producto=producto,
        )

        if not creado:
            return Response(
                {'detail': 'El producto ya esta en favoritos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = FavoritoDetalleSerializer(favorito)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        id_producto = request.data.get('id_producto')

        if not id_producto:
            return Response(
                {'detail': 'El id_producto es obligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        eliminado, _ = Favorito.objects.filter(
            id_usuario=request.user,
            id_producto_id=id_producto,
        ).delete()

        if eliminado == 0:
            return Response(
                {'detail': 'El producto no estaba en favoritos.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {'detail': 'Producto eliminado de favoritos.'},
            status=status.HTTP_200_OK,
        )
class PedidosGuardadosView(APIView):
    permission_classes = [IsClienteRole]

    def _get_cliente(self, request):
        return Cliente.objects.filter(id_usuario_fk=request.user).first()

    def get(self, request):
        cliente = self._get_cliente(request)
        if not cliente:
            return Response([])

        pedidos = (
            PedidoGuardado.objects
            .filter(id_cliente=cliente)
            .prefetch_related('detalles_pedido_guardado__id_producto')
            .order_by('-actualizado_en', '-id_pedido_guardado')
        )
        serializer = PedidoGuardadoSerializer(pedidos, many=True)
        return Response(serializer.data)

    def post(self, request):
        cliente = self._get_cliente(request)
        if not cliente:
            return Response(
                {'detail': 'No existe un cliente asociado a tu usuario.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nombre = str(request.data.get('nombre') or '').strip()
        carrito = request.data.get('carrito') or []

        if not nombre:
            return Response({'detail': 'Ingresa un nombre para el pedido.'}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(carrito, list) or not carrito:
            return Response({'detail': 'El carrito debe tener al menos un producto.'}, status=status.HTTP_400_BAD_REQUEST)

        detalles_validados = []
        for item in carrito:
            id_producto = item.get('id_producto') or item.get('id')
            try:
                cantidad = int(item.get('cantidad', 0))
            except (TypeError, ValueError):
                return Response({'detail': 'Cantidad invalida en carrito.'}, status=status.HTTP_400_BAD_REQUEST)

            if not id_producto or cantidad <= 0:
                return Response(
                    {'detail': 'Cada item requiere id_producto y cantidad > 0.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            producto = Producto.objects.filter(id_producto=id_producto, estado__iexact='activo').first()
            if producto is None:
                return Response(
                    {'detail': f'Producto no encontrado o inactivo: {id_producto}.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            detalles_validados.append((producto, cantidad))

        with transaction.atomic():
            pedido = PedidoGuardado.objects.create(id_cliente=cliente, nombre=nombre)

            for producto, cantidad in detalles_validados:
                DetallePedidoGuardado.objects.create(
                    id_pedido_guardado=pedido,
                    id_producto=producto,
                    cantidad=cantidad,
                )

        output = PedidoGuardadoSerializer(
            PedidoGuardado.objects
            .prefetch_related('detalles_pedido_guardado__id_producto')
            .get(pk=pedido.pk)
        )
        return Response(output.data, status=status.HTTP_201_CREATED)


class PedidoGuardadoDetalleView(APIView):
    permission_classes = [IsClienteRole]

    def delete(self, request, pk):
        cliente = Cliente.objects.filter(id_usuario_fk=request.user).first()
        if not cliente:
            return Response(status=status.HTTP_204_NO_CONTENT)

        pedido = PedidoGuardado.objects.filter(id_cliente=cliente, pk=pk).first()
        if pedido:
            pedido.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoriaPublicaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Categoria.objects.filter(estado__iexact='activo').order_by('nombre')
    serializer_class = CategoriaSerializer
    permission_classes = [AllowAny]


class MarcaPublicaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Marca.objects.filter(estado__iexact='activo').order_by('nombre')
    serializer_class = MarcaSerializer
    permission_classes = [AllowAny]


class ProductoPublicoPagination(PageNumberPagination):
    page_size = 48
    page_size_query_param = 'page_size'
    max_page_size = 200


class ProductoPublicoViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductoPublicoSerializer
    permission_classes = [AllowAny]
    pagination_class = ProductoPublicoPagination

    def get_queryset(self):
        stock_subquery = Inventario.objects.filter(
            id_producto=OuterRef('pk')
        ).values('stock_actual')[:1]

        qs = (
            Producto.objects
            .select_related('id_categoria', 'id_marca')
            .filter(estado__iexact='activo')
            .annotate(
                stock_actual=Coalesce(
                    Subquery(stock_subquery, output_field=IntegerField()),
                    0,
                )
            )
            .filter(stock_actual__gt=0)
            .order_by('nombre')
        )

        params = self.request.query_params
        texto = (params.get('q') or '').strip()
        if texto:
            qs = qs.filter(
                Q(nombre__icontains=texto)
                | Q(id_marca__nombre__icontains=texto)
                | Q(id_categoria__nombre__icontains=texto)
            )

        id_categoria = params.get('id_categoria')
        if id_categoria:
            qs = qs.filter(id_categoria_id=id_categoria)

        id_marca = params.get('id_marca')
        if id_marca:
            qs = qs.filter(id_marca_id=id_marca)

        precio_min = params.get('precio_min')
        if precio_min not in (None, ''):
            try:
                qs = qs.filter(precio_venta__gte=Decimal(str(precio_min)))
            except Exception:
                pass

        precio_max = params.get('precio_max')
        if precio_max not in (None, ''):
            try:
                qs = qs.filter(precio_venta__lte=Decimal(str(precio_max)))
            except Exception:
                pass

        return qs


class InventarioViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Inventario.objects.filter(id_producto__estado__iexact='activo').select_related('id_producto')
    serializer_class = InventarioSerializer
    permission_classes = [IsInventarioRole]


class MovimientoInventarioViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = MovimientoInventario.objects.all()
    serializer_class = MovimientoInventarioSerializer
    permission_classes = [IsInventarioRole]


class BitacoraPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200


class BitacoraViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Bitacora.objects.select_related('id_usuario').all().order_by('-fecha_hora')
    serializer_class = BitacoraSerializer
    permission_classes = [IsAdminOrAuditorRole]
    pagination_class = BitacoraPagination

    def _filtrar_queryset(self, qs):
        params = self.request.query_params

        fecha_inicio = params.get('fecha_inicio')
        if fecha_inicio:
            qs = qs.filter(fecha_hora__date__gte=fecha_inicio)

        fecha_fin = params.get('fecha_fin')
        if fecha_fin:
            qs = qs.filter(fecha_hora__date__lte=fecha_fin)

        id_usuario = params.get('id_usuario')
        if id_usuario:
            qs = qs.filter(id_usuario_id=id_usuario)

        accion = params.get('accion')
        if accion:
            qs = qs.filter(accion__iexact=accion.strip())

        tabla = params.get('tabla_afectada')
        if tabla:
            qs = qs.filter(tabla_afectada__iexact=tabla.strip())

        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(detalle__icontains=q)
                | Q(accion__icontains=q)
                | Q(tabla_afectada__icontains=q)
            )

        return qs

    def get_queryset(self):
        qs = super().get_queryset()
        return self._filtrar_queryset(qs)

    @action(detail=False, methods=['get'], url_path='usuarios-disponibles')
    def usuarios_disponibles(self, request):
        """Lista compacta de usuarios para poblar el filtro de bitacora."""
        usuarios = Usuario.objects.order_by('nombre_completo').values(
            'id_usuario', 'nombre_completo', 'username'
        )
        return Response(list(usuarios))

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        """Descarga la bitacora filtrada en formato CSV."""
        qs = self._filtrar_queryset(super().get_queryset())

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="bitacora.csv"'
        response.write('﻿')  # BOM UTF-8 para que Excel respete los acentos
        response.write('sep=,\r\n')  # Hint para que Excel reconozca el delimitador

        writer = csv.writer(response)
        writer.writerow([
            'Fecha y hora',
            'Usuario',
            'Username',
            'Accion',
            'Tabla afectada',
            'Registro afectado',
            'Detalle',
            'IP',
        ])
        for log in qs.iterator():
            usuario = log.id_usuario
            writer.writerow([
                log.fecha_hora.isoformat() if log.fecha_hora else '',
                getattr(usuario, 'nombre_completo', '') or '',
                getattr(usuario, 'username', '') or '',
                log.accion or '',
                log.tabla_afectada or '',
                log.registro_afectado_id if log.registro_afectado_id is not None else '',
                log.detalle or '',
                log.direccion_ip or '',
            ])

        return response


class VentaViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = Venta.objects.select_related('id_cliente', 'id_usuario').prefetch_related('detalles_venta').all().order_by('-fecha_hora')
    serializer_class = VentaSerializer
    permission_classes = [IsAdminOrVendedorRole]

    def get_queryset(self):
        qs = super().get_queryset()
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado_venta__iexact=estado.strip())
        return qs

    @action(detail=False, methods=['get'], url_path='pendientes')
    def listar_pendientes(self, request):
        qs = self.get_queryset().filter(
            Q(estado_venta__iexact='pendiente_validacion')
            | Q(estado_venta__iexact='pendiente_verificacion')
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Las ventas no pueden modificarse despues de registrarse.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Las ventas no pueden eliminarse desde la API.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'], url_path='confirmar')
    def confirmar(self, request, pk=None):
        venta = self.get_object()
        if not _venta_pendiente_confirmacion(venta.estado_venta):
            return Response(
                {'detail': f'La venta no esta pendiente. Estado actual: {venta.estado_venta}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        venta.estado_venta = 'completada'
        venta.save(update_fields=['estado_venta'])
        _actualizar_ultima_pago_transaccion_segura(
            id_venta=venta,
            estado_pago='confirmado',
            detalle='Pago confirmado manualmente por el equipo.',
        )

        self._registrar_bitacora(
            accion='CONFIRMAR_PAGO',
            tabla_afectada=venta._meta.db_table,
            registro_afectado_id=venta.pk,
            detalle=(
                f'Confirmacion de pago para venta #{venta.pk} '
                f'(metodo {venta.metodo_pago}, comprobante {venta.numero_comprobante or "-"}).'
            ),
        )

        serializer = self.get_serializer(venta)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='rechazar')
    def rechazar(self, request, pk=None):
        venta = self.get_object()
        if not _venta_pendiente_confirmacion(venta.estado_venta):
            return Response(
                {'detail': f'La venta no esta pendiente. Estado actual: {venta.estado_venta}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        motivo = (request.data.get('motivo') or '').strip() or 'Sin motivo especificado'
        usuario_actual = self._get_usuario_bitacora()
        if usuario_actual is None:
            return Response(
                {'detail': 'Usuario no autenticado.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        _revertir_stock_venta(
            venta=venta,
            usuario_actual=usuario_actual,
            motivo=f'Reverso por venta rechazada #{venta.pk}',
        )
        _actualizar_ultima_pago_transaccion_segura(
            id_venta=venta,
            estado_pago='rechazado',
            detalle=f'Pago rechazado manualmente. Motivo: {motivo}.',
        )

        self._registrar_bitacora(
            accion='RECHAZAR_PAGO',
            tabla_afectada=venta._meta.db_table,
            registro_afectado_id=venta.pk,
            detalle=(
                f'Rechazo de pago para venta #{venta.pk}. Motivo: {motivo}. '
                'Stock revertido al inventario.'
            ),
        )

        serializer = self.get_serializer(venta)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        detalles = serializer.validated_data.pop('detalles', [])
        if not detalles:
            return Response({'detail': 'Debes enviar al menos un item en detalles.'}, status=status.HTTP_400_BAD_REQUEST)

        usuario = getattr(request, 'user', None)
        if usuario is None or not hasattr(usuario, 'id_usuario'):
            return Response({'detail': 'Usuario no autenticado.'}, status=status.HTTP_401_UNAUTHORIZED)

        metodo_pago = (serializer.validated_data.get('metodo_pago') or '').strip().lower()
        monto_recibido_in = serializer.validated_data.get('monto_recibido')
        numero_comprobante_in = (serializer.validated_data.get('numero_comprobante') or '').strip() or None
        imagen_qr_url_in = (serializer.validated_data.get('imagen_qr_url') or '').strip() or None

        estado_venta = _estado_venta_pos_desde_metodo_pago(metodo_pago)
        monto_total = Decimal('0.00')

        with transaction.atomic():
            try:
                _validar_stock_y_productos_venta(detalles)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            venta = Venta.objects.create(
                id_cliente=serializer.validated_data['id_cliente'],
                id_usuario=usuario,
                fecha_hora=timezone.now(),
                monto_total=Decimal('0.00'),
                metodo_pago=metodo_pago,
                estado_venta=estado_venta,
                numero_comprobante=numero_comprobante_in,
                imagen_qr_url=imagen_qr_url_in,
            )

            for detalle in detalles:
                producto = detalle['id_producto']
                cantidad = int(detalle['cantidad'])
                precio_unitario = Decimal(str(producto.precio_venta))
                subtotal = precio_unitario * cantidad

                DetalleVenta.objects.create(
                    id_venta=venta,
                    id_producto=producto,
                    cantidad=cantidad,
                    precio_unitario=precio_unitario,
                    subtotal=subtotal,
                )

                MovimientoInventario.objects.create(
                    id_producto=producto,
                    id_usuario=usuario,
                    tipo_movimiento='salida',
                    cantidad=cantidad,
                    motivo='Venta desde POS',
                )

                monto_total += subtotal

            # CU09 — validacion de pago segun metodo
            if metodo_pago == 'efectivo':
                if monto_recibido_in is None:
                    transaction.set_rollback(True)
                    return Response(
                        {'detail': 'En pago en efectivo es obligatorio el monto recibido.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                monto_recibido = Decimal(str(monto_recibido_in))
                if monto_recibido < monto_total:
                    transaction.set_rollback(True)
                    return Response(
                        {'detail': f'El monto recibido ({monto_recibido}) es menor al total ({monto_total}).'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                venta.monto_recibido = monto_recibido
                venta.vuelto = monto_recibido - monto_total
            elif metodo_pago in ('qr', 'pago_movil_qr', 'transferencia'):
                if not numero_comprobante_in:
                    transaction.set_rollback(True)
                    return Response(
                        {'detail': 'En pagos QR o transferencia el numero de comprobante es obligatorio.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                venta.monto_recibido = monto_total
                venta.vuelto = Decimal('0.00')
            else:
                # tarjeta u otros: solo se exige que cuadre el total
                venta.monto_recibido = monto_total
                venta.vuelto = Decimal('0.00')

            venta.monto_total = monto_total
            venta.save(update_fields=['monto_total', 'monto_recibido', 'vuelto'])
            _crear_pago_transaccion_segura(
                id_venta=venta,
                proveedor='manual_pos',
                estado_pago=_estado_pago_desde_estado_venta(venta.estado_venta),
                monto=venta.monto_total,
                moneda='BOB',
                detalle=f'Pago registrado desde caja (metodo: {metodo_pago}).',
                creado_en=timezone.now(),
                actualizado_en=timezone.now(),
            )

        self._registrar_bitacora(
            accion='INSERT',
            tabla_afectada=venta._meta.db_table,
            registro_afectado_id=venta.pk,
            detalle=f'Se creo registro {venta._meta.model_name} con id={venta.pk} por {monto_total}.',
        )

        output = self.get_serializer(venta)
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)


class ReciboVentaView(APIView):
    """CU10 — Genera el recibo de una venta en HTML o PDF.

    Permisos: AllowAny intencionalmente, porque el recibo se abre desde
    un link <a target="_blank"> que no propaga el Bearer token, y tambien
    se envia por WhatsApp como URL publica. La unica forma de acceder
    es conociendo el id_venta.
    """
    permission_classes = [AllowAny]

    def get(self, request, pk, *args, **kwargs):
        formato = (request.query_params.get('formato') or 'html').strip().lower()

        venta = (
            Venta.objects
            .select_related('id_cliente', 'id_usuario')
            .filter(pk=pk)
            .first()
        )
        if venta is None:
            raise Http404('Venta no encontrada.')

        usuario = getattr(request, 'user', None)
        if usuario is not None and getattr(usuario, 'is_authenticated', False) and hasattr(usuario, 'id_usuario'):
            Bitacora.objects.create(
                id_usuario=usuario,
                accion='GENERAR_RECIBO',
                tabla_afectada='ventas',
                registro_afectado_id=venta.pk,
                detalle=f'Consulta de recibo ({formato}) para venta #{venta.pk}.',
                fecha_hora=timezone.now(),
                direccion_ip=get_client_ip_from_request(request),
            )

        detalles = (
            DetalleVenta.objects
            .select_related('id_producto')
            .filter(id_venta=venta)
            .order_by('id_detalle_venta')
        )

        contexto = {'venta': venta, 'detalles': detalles}
        html = render_to_string('recibos/recibo_venta.html', contexto)

        if formato == 'pdf':
            try:
                from xhtml2pdf import pisa
            except ImportError:
                return HttpResponse(
                    'xhtml2pdf no esta instalado. Ejecuta: pip install xhtml2pdf',
                    status=500,
                )
            buffer = BytesIO()
            resultado = pisa.CreatePDF(html, dest=buffer)
            if resultado.err:
                return HttpResponse('Error al generar PDF.', status=500)
            response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
            response['Content-Disposition'] = (
                f'inline; filename="recibo_venta_{venta.id_venta}.pdf"'
            )
            return response

        # default: HTML
        return HttpResponse(html, content_type='text/html; charset=utf-8')


class CompraViewSet(BitacoraMixin, viewsets.ModelViewSet):
    queryset = (
        Compra.objects
        .select_related('id_proveedor', 'id_usuario')
        .prefetch_related('detalles_compra')
        .all()
        .order_by('-fecha_compra')
    )
    serializer_class = CompraSerializer
    permission_classes = [IsAdminOrComprasRole]

    def update(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Las compras no pueden modificarse despues de registrarse.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Las compras no pueden eliminarse desde la API.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        detalles = serializer.validated_data.pop('detalles', [])
        if not detalles:
            return Response(
                {'detail': 'Debes enviar al menos un item en detalles.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usuario = getattr(request, 'user', None)
        if usuario is None or not hasattr(usuario, 'id_usuario'):
            return Response(
                {'detail': 'Usuario no autenticado.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        proveedor = serializer.validated_data['id_proveedor']
        if (proveedor.estado or '').lower() != 'activo':
            return Response(
                {'detail': 'El proveedor no esta activo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        monto_total = Decimal('0.00')

        with transaction.atomic():
            compra = Compra.objects.create(
                id_proveedor=proveedor,
                id_usuario=usuario,
                fecha_compra=timezone.now(),
                monto_total=Decimal('0.00'),
                estado_compra=serializer.validated_data.get('estado_compra') or 'completada',
            )

            for detalle in detalles:
                producto = detalle['id_producto']
                cantidad = int(detalle['cantidad'])
                precio_unitario = Decimal(str(detalle['precio_unitario']))
                subtotal = precio_unitario * cantidad

                DetalleCompra.objects.create(
                    id_compra=compra,
                    id_producto=producto,
                    lote=detalle.get('lote') or None,
                    fecha_vencimiento=detalle.get('fecha_vencimiento') or None,
                    cantidad=cantidad,
                    precio_unitario=precio_unitario,
                    subtotal=subtotal,
                )

                MovimientoInventario.objects.create(
                    id_producto=producto,
                    id_usuario=usuario,
                    tipo_movimiento='entrada',
                    cantidad=cantidad,
                    motivo=f'Ingreso por compra #{compra.id_compra}',
                )

                # Si el detalle indica un stock_minimo, lo aplicamos al inventario
                # del producto (el inventario ya existe gracias al signal de
                # actualizar_stock_por_movimiento que se ejecuto arriba).
                stock_minimo_in = detalle.get('stock_minimo')
                if stock_minimo_in is not None:
                    Inventario.objects.filter(id_producto=producto).update(
                        stock_minimo=int(stock_minimo_in)
                    )

                monto_total += subtotal

            compra.monto_total = monto_total
            compra.save(update_fields=['monto_total'])

        self._registrar_bitacora(
            accion='INSERT',
            tabla_afectada=compra._meta.db_table,
            registro_afectado_id=compra.pk,
            detalle=f'Se creo registro {compra._meta.model_name} con id={compra.pk} por {monto_total}.',
        )

        output = self.get_serializer(compra)
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)


METODOS_PAGO_PUBLICOS = {'qr', 'transferencia', 'efectivo_contra_entrega', 'stripe_card'}
METODOS_PAGO_REQUIEREN_COMPROBANTE = {'qr', 'transferencia'}
HEADER_IDEMPOTENCY_KEY = 'HTTP_X_IDEMPOTENCY_KEY'


def _obtener_idempotency_key_checkout(request):
    key = (request.META.get(HEADER_IDEMPOTENCY_KEY) or '').strip()
    return key or None


class CheckoutPublicoView(APIView):
    """CU20: pedido online solo para cliente autenticado."""
    authentication_classes = [CustomJWTAuthentication]
    permission_classes = [IsClienteRole]

    def post(self, request, *args, **kwargs):
        cliente_data = request.data.get('cliente') or {}
        carrito = request.data.get('carrito') or []
        metodo_pago = (request.data.get('metodo_pago') or 'qr').strip().lower()
        # Compatibilidad con el nombre antiguo del frontend.
        if metodo_pago == 'pago_movil_qr':
            metodo_pago = 'qr'
        numero_comprobante = (request.data.get('numero_comprobante') or '').strip() or None
        imagen_qr_url = (request.data.get('imagen_qr_url') or '').strip() or None
        idempotency_key = _obtener_idempotency_key_checkout(request)

        if idempotency_key and _tabla_pago_transacciones_disponible():
            try:
                tx_existente = (
                    PagoTransaccion.objects
                    .select_related('id_venta')
                    .filter(idempotency_key=idempotency_key)
                    .order_by('-id_pago_transaccion')
                    .first()
                )
            except (ProgrammingError, OperationalError):
                tx_existente = None

            if tx_existente and tx_existente.id_venta:
                venta_existente = tx_existente.id_venta
                return Response(
                    {
                        'message': 'Pedido ya registrado previamente con la misma clave de idempotencia.',
                        'id_venta': venta_existente.id_venta,
                        'monto_total': str(venta_existente.monto_total),
                        'estado_venta': venta_existente.estado_venta,
                        'idempotent_replay': True,
                    },
                    status=status.HTTP_200_OK,
                )

        if metodo_pago not in METODOS_PAGO_PUBLICOS:
            return Response(
                {'detail': f'Metodo de pago no soportado: {metodo_pago}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if metodo_pago in METODOS_PAGO_REQUIEREN_COMPROBANTE and not numero_comprobante:
            return Response(
                {'detail': 'Debes ingresar el numero de comprobante para el metodo seleccionado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cliente_autenticado = Cliente.objects.filter(id_usuario_fk=request.user).first()
        if cliente_autenticado is None:
            return Response(
                {'detail': 'No existe un cliente asociado a tu usuario.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nombre = str(cliente_data.get('nombre') or cliente_autenticado.nombre_completo or '').strip()
        telefono = str(cliente_data.get('telefono') or cliente_autenticado.telefono or '').strip()
        ciudad = str(cliente_data.get('ciudad') or cliente_autenticado.ciudad or '').strip()
        direccion = str(cliente_data.get('direccion') or cliente_autenticado.direccion or '').strip()

        if not nombre or not telefono or not ciudad or not direccion:
            return Response(
                {'detail': 'Completa nombre, telefono, ciudad y direccion de envio antes de confirmar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(carrito, list) or not carrito:
            return Response(
                {'detail': 'El carrito debe contener al menos un producto.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cantidades_por_producto = {}
        for item in carrito:
            id_producto = item.get('id_producto') or item.get('id')
            try:
                cantidad = int(item.get('cantidad', 0))
            except (TypeError, ValueError):
                return Response({'detail': 'Cantidad invalida en carrito.'}, status=status.HTTP_400_BAD_REQUEST)
            if not id_producto or cantidad <= 0:
                return Response(
                    {'detail': 'Cada item del carrito requiere id_producto y cantidad > 0.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pid = int(id_producto)
            cantidades_por_producto[pid] = cantidades_por_producto.get(pid, 0) + cantidad

        usuario_sistema = Usuario.objects.filter(id_usuario=1).first() or Usuario.objects.order_by('id_usuario').first()
        if usuario_sistema is None:
            return Response(
                {'detail': 'No existe un usuario del sistema para registrar la venta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        monto_total = Decimal('0.00')

        with transaction.atomic():
            cliente = cliente_autenticado
            cliente.nombre_completo = nombre
            cliente.telefono = telefono
            cliente.ciudad = ciudad
            cliente.direccion = direccion
            cliente.save(update_fields=['nombre_completo', 'telefono', 'ciudad', 'direccion'])

            venta = Venta.objects.create(
                id_cliente=cliente,
                id_usuario=usuario_sistema,
                fecha_hora=timezone.now(),
                monto_total=Decimal('0.00'),
                metodo_pago=metodo_pago,
                estado_venta='pendiente_validacion',
                numero_comprobante=numero_comprobante,
                imagen_qr_url=imagen_qr_url,
            )

            for pid, cantidad_total in cantidades_por_producto.items():
                producto = Producto.objects.select_for_update().filter(id_producto=pid).first()
                if producto is None:
                    return Response({'detail': f'Producto no encontrado: {pid}.'}, status=status.HTTP_404_NOT_FOUND)

                if (producto.estado or '').strip().lower() != 'activo':
                    return Response(
                        {'detail': f'El producto "{producto.nombre}" no esta disponible.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                inventario = Inventario.objects.select_for_update().filter(id_producto=producto).first()
                stock_disponible = int(inventario.stock_actual) if inventario else 0
                if cantidad_total > stock_disponible:
                    return Response(
                        {'detail': f'Stock insuficiente para {producto.nombre}. Disponible: {stock_disponible}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                precio_unitario = Decimal(str(producto.precio_venta))
                subtotal = precio_unitario * cantidad_total

                DetalleVenta.objects.create(
                    id_venta=venta,
                    id_producto=producto,
                    cantidad=cantidad_total,
                    precio_unitario=precio_unitario,
                    subtotal=subtotal,
                )

                MovimientoInventario.objects.create(
                    id_producto=producto,
                    id_usuario=usuario_sistema,
                    tipo_movimiento='salida',
                    cantidad=cantidad_total,
                    motivo='Venta web publica (pendiente validacion)',
                )

                monto_total += subtotal

            venta.monto_total = monto_total
            venta.save(update_fields=['monto_total'])
            estado_pago_inicial = (
                'pendiente_pasarela'
                if metodo_pago == 'stripe_card'
                else (
                    'pendiente_contra_entrega'
                    if metodo_pago == 'efectivo_contra_entrega'
                    else 'pendiente_validacion'
                )
            )
            proveedor_checkout = 'stripe' if metodo_pago == 'stripe_card' else 'manual_checkout'
            _crear_pago_transaccion_segura(
                id_venta=venta,
                proveedor=proveedor_checkout,
                estado_pago=estado_pago_inicial,
                monto=venta.monto_total,
                moneda='BOB',
                idempotency_key=idempotency_key,
                detalle=(
                    f'Checkout publico creado (metodo: {metodo_pago})'
                    + (f' con comprobante {numero_comprobante}.' if numero_comprobante else '.')
                ),
                creado_en=timezone.now(),
                actualizado_en=timezone.now(),
            )

            # Bitacora del checkout publico (siempre contra usuario_sistema).
            Bitacora.objects.create(
                id_usuario=usuario_sistema,
                accion='CHECKOUT_PUBLICO',
                tabla_afectada='ventas',
                registro_afectado_id=venta.pk,
                detalle=(
                    f'Pedido online #{venta.pk} de {cliente.nombre_completo} '
                    f'por {monto_total} via {metodo_pago}'
                    + (f' (comprobante {numero_comprobante})' if numero_comprobante else '')
                    + '. En espera de validacion.'
                ),
                fecha_hora=timezone.now(),
                direccion_ip=get_client_ip_from_request(request),
            )

        if metodo_pago == 'stripe_card':
            stripe_secret, _webhook_secret, stripe_currency = _stripe_config()
            if not stripe_secret:
                _revertir_stock_venta(
                    venta=venta,
                    usuario_actual=usuario_sistema,
                    motivo=f'Reverso por fallo de configuracion Stripe en venta #{venta.pk}',
                )
                _actualizar_ultima_pago_transaccion_segura(
                    id_venta=venta,
                    estado_pago='error_configuracion',
                    detalle='STRIPE_SECRET_KEY no configurada.',
                )
                return Response(
                    {'detail': 'La pasarela Stripe no esta configurada en el servidor.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            stripe.api_key = stripe_secret
            success_url, cancel_url = _build_frontend_checkout_urls(request, venta.id_venta)
            line_items = []
            for detalle in DetalleVenta.objects.filter(id_venta=venta).select_related('id_producto'):
                unit_amount = int((Decimal(str(detalle.precio_unitario)) * 100).quantize(Decimal('1')))
                line_items.append(
                    {
                        'price_data': {
                            'currency': stripe_currency,
                            'product_data': {'name': detalle.id_producto.nombre},
                            'unit_amount': unit_amount,
                        },
                        'quantity': int(detalle.cantidad),
                    }
                )

            try:
                session = stripe.checkout.Session.create(
                    mode='payment',
                    line_items=line_items,
                    metadata={
                        'id_venta': str(venta.id_venta),
                        'metodo_pago': 'stripe_card',
                    },
                    success_url=success_url,
                    cancel_url=cancel_url,
                )
            except Exception as exc:
                _revertir_stock_venta(
                    venta=venta,
                    usuario_actual=usuario_sistema,
                    motivo=f'Reverso por error Stripe en venta #{venta.pk}',
                )
                _actualizar_ultima_pago_transaccion_segura(
                    id_venta=venta,
                    estado_pago='error_pasarela',
                    detalle=f'Error creando checkout Stripe: {exc}',
                )
                return Response(
                    {'detail': 'No se pudo iniciar el checkout de Stripe. Intenta nuevamente.'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            _actualizar_ultima_pago_transaccion_segura(
                id_venta=venta,
                id_transaccion_externa=session.id,
                detalle='Checkout Stripe creado correctamente.',
            )
            return Response(
                {
                    'message': 'Pedido registrado. Redirigiendo a Stripe Checkout...',
                    'id_venta': venta.id_venta,
                    'monto_total': str(venta.monto_total),
                    'estado_venta': venta.estado_venta,
                    'checkout_url': session.url,
                    'pasarela': 'stripe',
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {
                'message': 'Pedido registrado. Esta pendiente de validacion por el equipo.',
                'id_venta': venta.id_venta,
                'monto_total': str(venta.monto_total),
                'estado_venta': venta.estado_venta,
            },
            status=status.HTTP_201_CREATED,
        )


class StripeWebhookView(APIView):
    """Webhook preparado para Stripe.

    Se deja listo para activacion cuando existan STRIPE_WEBHOOK_SECRET
    y el flujo de payment_intent en frontend/backend.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        if not _tabla_pago_transacciones_disponible():
            return Response(
                {'detail': 'La tabla de transacciones de pago aun no esta disponible.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        stripe_secret, webhook_secret, stripe_currency = _stripe_config()
        if not stripe_secret or not webhook_secret:
            return Response(
                {'detail': 'Webhook Stripe deshabilitado: faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        signature = request.META.get('HTTP_STRIPE_SIGNATURE', '')
        if not signature:
            return Response({'detail': 'Falta header Stripe-Signature.'}, status=status.HTTP_400_BAD_REQUEST)

        stripe.api_key = stripe_secret
        try:
            event = stripe.Webhook.construct_event(
                payload=request.body,
                sig_header=signature,
                secret=webhook_secret,
            )
        except Exception:
            return Response({'detail': 'Firma de webhook invalida.'}, status=status.HTTP_400_BAD_REQUEST)

        event_id = str(event.get('id') or '').strip()
        event_type = str(event.get('type') or '').strip()
        if not event_id:
            return Response({'detail': 'Evento sin id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if PagoTransaccion.objects.filter(evento_webhook_id=event_id).exists():
                return Response({'received': True, 'idempotent_replay': True}, status=status.HTTP_200_OK)
        except (ProgrammingError, OperationalError):
            return Response({'detail': 'No se pudo consultar eventos de pago.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        data_object = (event.get('data') or {}).get('object') or {}
        metadata = data_object.get('metadata') or {}
        venta_id_meta = metadata.get('id_venta')
        checkout_session_id = None
        payment_intent_id = None

        if event_type.startswith('checkout.session'):
            checkout_session_id = str(data_object.get('id') or '').strip() or None
            payment_intent_id = str(data_object.get('payment_intent') or '').strip() or None
        else:
            payment_intent_id = str(data_object.get('id') or '').strip() or None

        venta = None
        if venta_id_meta:
            venta = Venta.objects.filter(id_venta=venta_id_meta).first()
        if venta is None and checkout_session_id:
            tx = (
                PagoTransaccion.objects
                .select_related('id_venta')
                .filter(id_transaccion_externa=checkout_session_id)
                .order_by('-id_pago_transaccion')
                .first()
            )
            if tx:
                venta = tx.id_venta

        if venta is None:
            return Response({'detail': 'Evento recibido, pero sin venta vinculada.'}, status=status.HTTP_202_ACCEPTED)

        estado_pago = 'pendiente'
        detalle_estado = f'Webhook Stripe {event_type}'
        cambio_estado = None
        requiere_reversa_stock = False

        if event_type in ('checkout.session.completed', 'payment_intent.succeeded'):
            estado_pago = 'confirmado'
            cambio_estado = 'completada'
        elif event_type in ('checkout.session.expired', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.failed'):
            estado_pago = 'rechazado'
            cambio_estado = 'rechazada'
            requiere_reversa_stock = True

        with transaction.atomic():
            if cambio_estado == 'completada' and (venta.estado_venta or '').lower() == 'pendiente_validacion':
                venta.estado_venta = 'completada'
                venta.save(update_fields=['estado_venta'])

            if cambio_estado == 'rechazada' and (venta.estado_venta or '').lower() == 'pendiente_validacion':
                usuario_sistema = Usuario.objects.filter(id_usuario=1).first() or Usuario.objects.order_by('id_usuario').first()
                if usuario_sistema and requiere_reversa_stock:
                    _revertir_stock_venta(
                        venta=venta,
                        usuario_actual=usuario_sistema,
                        motivo=f'Reverso automatico por webhook Stripe ({event_type}) venta #{venta.pk}',
                    )

            _crear_pago_transaccion_segura(
                id_venta=venta,
                proveedor='stripe',
                estado_pago=estado_pago,
                monto=venta.monto_total,
                moneda=stripe_currency.upper(),
                id_transaccion_externa=payment_intent_id or checkout_session_id,
                evento_webhook_id=event_id,
                detalle=detalle_estado,
                creado_en=timezone.now(),
                actualizado_en=timezone.now(),
            )

        return Response({'received': True}, status=status.HTTP_200_OK)
