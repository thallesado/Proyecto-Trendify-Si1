from django.urls import include, path
from rest_framework.routers import DefaultRouter

# Importa los ViewSets definidos en views.py de esta misma app.
from .views import CategoriaViewSet, MarcaViewSet, RolViewSet

router = DefaultRouter()
router.register(r'roles', RolViewSet, basename='rol')
router.register(r'categorias', CategoriaViewSet, basename='categoria')
router.register(r'marcas', MarcaViewSet, basename='marca')

urlpatterns = [
    # Incluye automaticamente rutas CRUD para cada recurso registrado en el router.
    path('', include(router.urls)),
]
