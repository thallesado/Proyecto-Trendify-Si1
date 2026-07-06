# Imagenes de productos

Coloca aqui las imagenes de cada producto usando el `id_producto` como nombre
de archivo. La aplicacion las carga automaticamente.

## Convencion

```
1.jpg     -> producto con id_producto = 1
2.png     -> producto con id_producto = 2
3.webp    -> producto con id_producto = 3
```

Extensiones soportadas (en orden de prioridad): `.jpg`, `.jpeg`, `.png`, `.webp`.

Si el archivo no existe, la card del producto muestra un placeholder con la
inicial del nombre (gradiente fuchsia -> amber). No se rompe nada.

## Donde se ven

- Tienda publica (`TiendaPublica.jsx`)
- Catalogo del POS (`CajaManager.jsx`)

## Vite y produccion

Vite sirve el contenido de `frontend/public/` directamente en la raiz `/`.
En desarrollo: http://127.0.0.1:5173/products/1.jpg
En `npm run build`: los archivos se copian a `dist/products/`.

## Tips

- Imagenes cuadradas se ven mejor (las cards usan `aspect-square`).
- Tamanos recomendados: 400x400 a 800x800 px, JPG comprimido.
- Si actualizas un archivo, refresca el navegador con Ctrl+Shift+R para
  evitar el cache.
