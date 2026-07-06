import { useMemo, useState } from 'react';
import ProductoImagen from './ProductoImagen';
import { obtenerImagenesProducto } from '../utils/formHelpers';

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  });
}

export default function ProductoDetalleModal({
  producto,
  open,
  onClose,
  onAddToCart,
  stockActual,
}) {
  const [indiceImagen, setIndiceImagen] = useState(0);

  const imagenes = useMemo(
    () => (producto ? obtenerImagenesProducto(producto.atributos) : []),
    [producto]
  );

  if (!open || !producto) return null;

  const id = producto.id_producto ?? producto.id;
  const stock = stockActual ?? Math.max(0, Number(producto.stock_actual ?? 0));
  const imagenActual = imagenes[indiceImagen] || producto.atributos?.imagen_data_uri;

  const agregar = () => {
    if (stock <= 0) return;
    onAddToCart?.(producto);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900 line-clamp-2 pr-4">{producto.nombre}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            X
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <ProductoImagen
              idProducto={id}
              nombre={producto.nombre}
              imagenSrc={imagenActual}
              className="aspect-square w-full"
            />
            {imagenes.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setIndiceImagen((i) => (i - 1 + imagenes.length) % imagenes.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-bold shadow"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setIndiceImagen((i) => (i + 1) % imagenes.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-bold shadow"
                >
                  ›
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {imagenes.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-2 w-2 rounded-full ${idx === indiceImagen ? 'bg-fuchsia-600' : 'bg-white/80'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <p className="mt-4 text-2xl font-black text-slate-900">{currency(producto.precio_venta)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Stock disponible: {stock}</p>

          {producto.descripcion && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Descripcion</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{producto.descripcion}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={agregar}
            disabled={stock <= 0}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stock <= 0 ? 'Sin stock' : 'Anadir al carrito'}
          </button>
        </div>
      </div>
    </div>
  );
}
