import os
import re

file_path = "c:/Users/diego/Desktop/Sistemas de Informacion/PROGRAMAS/SISTEMA_DE_INFORMACION_I/backend/catalogos/views.py"
with open(file_path, "r", encoding="utf-8") as f:
    orig_content = f.read()

content = orig_content
for viewset in ["RolViewSet", "MarcaViewSet", "UsuarioViewSet", "ProveedorViewSet", "InventarioViewSet", "VentaViewSet"]:
    content = re.sub(rf"class {viewset}\(viewsets.ModelViewSet\):", rf"class {viewset}(BitacoraMixin, viewsets.ModelViewSet):", content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched basic ViewSets")
