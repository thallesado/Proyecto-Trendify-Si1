from django.urls import include, path
from rest_framework.routers import DefaultRouter

# Importa los ViewSets desde views.py de la app catalogos.
from .views import (
    BitacoraViewSet,
    CategoriaPublicaViewSet,
    CategoriaViewSet,
    CheckoutPublicoView,
    ClienteViewSet,
    CompraViewSet,
    InventarioViewSet,
    MarcaPublicaViewSet,
    MarcaViewSet,
    MiPerfilClienteView,
    MisFavoritosView,
    MovimientoInventarioViewSet,
    PedidoGuardadoDetalleView,
    PedidosGuardadosView,
    ProductoPublicoViewSet,
    ProductoPopularViewSet,
    ProductoViewSet,
    ProveedorViewSet,
    ReciboVentaView,
    RolViewSet,
    StripeWebhookView,
    UsuarioViewSet,
    VentaViewSet,
    MisPedidosView,
)
from .views_reportes import ReportesViewSet
from .views_auth import CambiarPasswordView, LoginView, LogoutView, RegistroClienteView

router = DefaultRouter()
router.register(r'roles', RolViewSet, basename='rol')
router.register(r'categorias', CategoriaViewSet, basename='categoria')
router.register(r'marcas', MarcaViewSet, basename='marca')
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'proveedores', ProveedorViewSet, basename='proveedor')
router.register(r'productos', ProductoViewSet, basename='producto')
router.register(r'inventario', InventarioViewSet, basename='inventario')
router.register(r'movimientos', MovimientoInventarioViewSet, basename='movimiento-inventario')
router.register(r'bitacora', BitacoraViewSet, basename='bitacora')
router.register(r'ventas', VentaViewSet, basename='venta')
router.register(r'compras', CompraViewSet, basename='compra')

public_router = DefaultRouter()
public_router.register(r'categorias', CategoriaPublicaViewSet, basename='categoria-publica')
public_router.register(r'marcas', MarcaPublicaViewSet, basename='marca-publica')
public_router.register(r'productos', ProductoPublicoViewSet, basename='producto-publico')
public_router.register(r'productos-populares', ProductoPopularViewSet, basename='producto-popular')

router.register(r'reportes', ReportesViewSet, basename='reportes')

urlpatterns = [
    # Habilita endpoints CRUD automaticos de DRF.
    path('auth/registro/', RegistroClienteView.as_view(), name='auth-registro'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/cambiar-password/', CambiarPasswordView.as_view(), name='auth-cambiar-password'),
    path('mis-pedidos/', MisPedidosView.as_view(), name='mis-pedidos'),
    path('mis-favoritos/', MisFavoritosView.as_view(), name='mis-favoritos'),
    path('mi-perfil-cliente/', MiPerfilClienteView.as_view(), name='mi-perfil-cliente'),
    path('pedidos-guardados/', PedidosGuardadosView.as_view(), name='pedidos-guardados'),
    path('pedidos-guardados/<int:pk>/', PedidoGuardadoDetalleView.as_view(), name='pedido-guardado-detalle'),
    path('ventas/<int:pk>/recibo/', ReciboVentaView.as_view(), name='venta-recibo'),
    path('public/checkout/', CheckoutPublicoView.as_view(), name='checkout-publico'),
    path('public/payments/webhook/stripe/', StripeWebhookView.as_view(), name='webhook-stripe'),
    path('public/', include(public_router.urls)),
    path('', include(router.urls)),
]
