from rest_framework import viewsets

# Importa los modelos de la app actual y sus serializers correspondientes.
from .models import Categoria, Marca, Rol
from .serializers import CategoriaSerializer, MarcaSerializer, RolSerializer


class RolViewSet(viewsets.ModelViewSet):
    queryset = Rol.objects.all()
    serializer_class = RolSerializer


class CategoriaViewSet(viewsets.ModelViewSet):
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer


class MarcaViewSet(viewsets.ModelViewSet):
    queryset = Marca.objects.all()
    serializer_class = MarcaSerializer
