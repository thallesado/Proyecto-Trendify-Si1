from django.contrib import admin

from .models import Categoria, Marca, Rol


@admin.register(Rol)
class RolAdmin(admin.ModelAdmin):
    list_display = ('id_rol', 'nombre_rol')
    search_fields = ('nombre_rol',)


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ('id_categoria', 'nombre', 'estado')
    list_filter = ('estado',)
    search_fields = ('nombre', 'descripcion')


@admin.register(Marca)
class MarcaAdmin(admin.ModelAdmin):
    list_display = ('id_marca', 'nombre', 'estado')
    list_filter = ('estado',)
    search_fields = ('nombre',)
