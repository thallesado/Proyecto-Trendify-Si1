from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    # Incluye las rutas de la app catalogos bajo /api/.
    path('api/', include('catalogos.urls')),
]
