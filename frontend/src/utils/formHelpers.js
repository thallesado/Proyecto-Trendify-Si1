/** Solo digitos para telefonos (permite vacio mientras escribe). */
export function sanitizeTelefono(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Filtra lista por texto en uno o mas campos. */
export function filtrarPorTexto(items, query, campos) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    campos.some((campo) => String(item?.[campo] ?? '').toLowerCase().includes(q))
  );
}

/** Imagenes del producto: galeria + compatibilidad con imagen unica. */
export function obtenerImagenesProducto(atributos) {
  const lista = [];
  const attrs = atributos || {};
  if (Array.isArray(attrs.imagenes_data_uri)) {
    attrs.imagenes_data_uri.forEach((uri) => {
      if (uri && !lista.includes(uri)) lista.push(uri);
    });
  }
  if (attrs.imagen_data_uri && !lista.includes(attrs.imagen_data_uri)) {
    lista.unshift(attrs.imagen_data_uri);
  }
  return lista;
}

export function buildReciboUrl(idVenta, formato = 'html') {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return `${base}/api/ventas/${idVenta}/recibo/?formato=${formato}`;
}
