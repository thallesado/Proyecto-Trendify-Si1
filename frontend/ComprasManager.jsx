import { useEffect, useMemo, useState } from 'react';
import api from './src/utils/api';
import { filtrarPorTexto, obtenerImagenesProducto } from './src/utils/formHelpers';
import ProductoImagen from './src/components/ProductoImagen';

const PROVEEDORES_URL = '/api/proveedores/';
const PRODUCTOS_URL = '/api/productos/';
const COMPRAS_URL = '/api/compras/';

const EMPTY_ITEM = {
  id_producto: '',
  cantidad: 1,
  precio_unitario: '',
  lote: '',
  fecha_vencimiento: '',
  stock_minimo: '',
};

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
}

function CompraDetalleModal({ compra, open, onClose }) {
  if (!open || !compra) return null;

  const detalles = compra.detalles_compra || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Compra #{compra.id_compra}</h3>
            <p className="text-sm text-slate-500">
              {compra.proveedor_nombre || '-'} · {formatDate(compra.fecha_compra)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            X
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="font-semibold text-slate-600">Registrado por:</span> {compra.usuario_nombre || '-'}</p>
            <p><span className="font-semibold text-slate-600">Estado:</span> {compra.estado_compra || '-'}</p>
            <p className="sm:col-span-2">
              <span className="font-semibold text-slate-600">Total:</span>{' '}
              <span className="text-lg font-bold text-slate-900">{formatCurrency(compra.monto_total)}</span>
            </p>
          </div>

          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Items de la compra</h4>
          {detalles.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No hay detalle de items disponible.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 font-semibold">Cant.</th>
                    <th className="px-3 py-2 font-semibold">Precio</th>
                    <th className="px-3 py-2 font-semibold">Lote</th>
                    <th className="px-3 py-2 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((det) => (
                    <tr key={det.id_detalle_compra} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{det.producto_nombre || det.id_producto}</td>
                      <td className="px-3 py-2 text-slate-700">{det.cantidad}</td>
                      <td className="px-3 py-2 text-slate-700">{formatCurrency(det.precio_unitario)}</td>
                      <td className="px-3 py-2 text-slate-600">{det.lote || '-'}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{formatCurrency(det.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComprasManager() {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [comprasPrevias, setComprasPrevias] = useState([]);

  const [idProveedor, setIdProveedor] = useState('');
  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [busquedaCompras, setBusquedaCompras] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [compraDetalle, setCompraDetalle] = useState(null);

  const productosActivos = useMemo(
    () => productos.filter((p) => (p.estado || '').toLowerCase() === 'activo'),
    [productos]
  );

  const productosPorId = useMemo(() => {
    const mapa = new Map();
    productos.forEach((p) => mapa.set(Number(p.id_producto ?? p.id), p));
    return mapa;
  }, [productos]);

  const productosFiltrados = useMemo(
    () => filtrarPorTexto(productosActivos, busquedaProducto, ['nombre', 'descripcion']),
    [productosActivos, busquedaProducto]
  );

  const comprasFiltradas = useMemo(() => {
    const q = busquedaCompras.trim().toLowerCase();
    if (!q) return comprasPrevias;
    return comprasPrevias.filter(
      (c) =>
        String(c.id_compra).includes(q) ||
        String(c.proveedor_nombre || '').toLowerCase().includes(q) ||
        String(c.usuario_nombre || '').toLowerCase().includes(q)
    );
  }, [comprasPrevias, busquedaCompras]);

  const totalCompra = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + Number(item.cantidad || 0) * Number(item.precio_unitario || 0),
        0
      ),
    [items]
  );

  const cargarDatos = async () => {
    setLoading(true);
    setError('');
    try {
      const [provResp, prodResp, comprasResp] = await Promise.all([
        api.get(PROVEEDORES_URL),
        api.get(PRODUCTOS_URL),
        api.get(COMPRAS_URL),
      ]);
      setProveedores(normalizeList(provResp.data).filter((p) => (p.estado || '').toLowerCase() === 'activo'));
      setProductos(normalizeList(prodResp.data));
      setComprasPrevias(normalizeList(comprasResp.data));
    } catch (err) {
      console.error('Error cargando datos de compras:', err);
      setError('No se pudieron cargar proveedores/productos/compras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const agregarProductoACompra = (producto) => {
    const idProducto = Number(producto.id_producto ?? producto.id);
    if (!Number.isFinite(idProducto)) return;

    setItems((prev) => {
      const existe = prev.find((it) => Number(it.id_producto) === idProducto);
      if (existe) {
        return prev.map((it) =>
          Number(it.id_producto) === idProducto
            ? { ...it, cantidad: Number(it.cantidad || 0) + 1 }
            : it
        );
      }

      return [
        ...prev,
        {
          ...EMPTY_ITEM,
          id_producto: idProducto,
          cantidad: 1,
          precio_unitario: Number(producto.precio_compra) || '',
        },
      ];
    });
  };

  const actualizarItem = (index, campo, valor) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const next = { ...it, [campo]: valor };
        return next;
      })
    );
  };

  const eliminarItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const registrarCompra = async () => {
    setError('');
    setSuccess('');

    if (!idProveedor) {
      setError('Selecciona un proveedor.');
      return;
    }

    if (items.length === 0) {
      setError('Agrega al menos un item a la compra.');
      return;
    }

    for (const it of items) {
      if (!it.id_producto) {
        setError('Cada item debe tener un producto seleccionado.');
        return;
      }
      if (!it.cantidad || Number(it.cantidad) <= 0) {
        setError('La cantidad de cada item debe ser mayor a cero.');
        return;
      }
      if (it.precio_unitario === '' || Number(it.precio_unitario) < 0) {
        setError('El precio unitario de cada item debe ser >= 0.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        id_proveedor: Number(idProveedor),
        estado_compra: 'completada',
        detalles: items.map((it) => {
          const detalle = {
            id_producto: Number(it.id_producto),
            cantidad: Number(it.cantidad),
            precio_unitario: Number(it.precio_unitario),
            lote: it.lote || null,
            fecha_vencimiento: it.fecha_vencimiento || null,
          };
          if (it.stock_minimo !== '' && it.stock_minimo !== undefined && it.stock_minimo !== null) {
            const parsed = Number(it.stock_minimo);
            if (Number.isFinite(parsed) && parsed >= 0) {
              detalle.stock_minimo = parsed;
            }
          }
          return detalle;
        }),
      };

      const { data } = await api.post(COMPRAS_URL, payload);
      setSuccess(`Compra #${data.id_compra} registrada por ${formatCurrency(data.monto_total)}.`);
      setItems([]);
      setIdProveedor('');
      await cargarDatos();
    } catch (err) {
      console.error('Error registrando compra:', err);
      setError(err?.response?.data?.detail || 'No se pudo registrar la compra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1500px]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Compras / Ingreso de Productos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Registra ingresos de stock por compras a proveedores. El inventario se incrementa automaticamente.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Nueva Compra</h3>

        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Proveedor
          </label>
          <select
            value={idProveedor}
            onChange={(e) => setIdProveedor(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
          >
            <option value="">Selecciona un proveedor activo</option>
            {proveedores.map((p) => (
              <option key={p.id_proveedor} value={p.id_proveedor}>
                {p.nombre_empresa}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Productos</h4>
              <p className="mt-1 text-xs text-slate-500">Elige productos para agregarlos a la compra.</p>
            </div>
            <input
              type="search"
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 sm:w-72"
            />
          </div>

          <div className="grid max-h-[26rem] gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {loading ? (
              <p className="col-span-full rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-500">
                Cargando productos...
              </p>
            ) : productosFiltrados.length === 0 ? (
              <p className="col-span-full rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-500">
                {busquedaProducto ? 'No hay productos que coincidan.' : 'No hay productos activos disponibles.'}
              </p>
            ) : (
              productosFiltrados.map((producto) => {
                const idProducto = Number(producto.id_producto ?? producto.id);
                const itemSeleccionado = items.find((it) => Number(it.id_producto) === idProducto);
                const imagenes = obtenerImagenesProducto(producto.atributos);
                const imagenSrc = imagenes[0] || producto.atributos?.imagen_data_uri;

                return (
                  <article
                    key={idProducto}
                    className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <ProductoImagen
                      idProducto={idProducto}
                      nombre={producto.nombre}
                      imagenSrc={imagenSrc}
                      className="h-16 w-16 shrink-0 rounded-xl border border-slate-200"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h5 className="line-clamp-2 text-sm font-bold text-slate-900">{producto.nombre}</h5>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Precio compra: {formatCurrency(producto.precio_compra)}
                      </p>
                      {itemSeleccionado && (
                        <p className="mt-1 text-xs font-bold text-emerald-700">
                          En compra: {itemSeleccionado.cantidad}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => agregarProductoACompra(producto)}
                        className="mt-auto rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                      >
                        Añadir a la compra
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="mb-3">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Productos seleccionados</h4>
          <p className="mt-1 text-xs text-slate-500">
            Completa cantidad, precio, lote, vencimiento y stock mínimo antes de registrar.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Producto</th>
                <th className="px-3 py-2 font-semibold">Cantidad</th>
                <th className="px-3 py-2 font-semibold">Precio compra</th>
                <th className="px-3 py-2 font-semibold">Lote</th>
                <th className="px-3 py-2 font-semibold">Vencimiento</th>
                <th className="px-3 py-2 font-semibold" title="Opcional - ajusta el stock minimo del producto en inventario">Stock min.</th>
                <th className="px-3 py-2 font-semibold">Subtotal</th>
                <th className="px-3 py-2 font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No hay items. Agrega al menos uno.
                  </td>
                </tr>
              ) : (
                items.map((it, i) => {
                  const subtotal = Number(it.cantidad || 0) * Number(it.precio_unitario || 0);
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <p className="min-w-[180px] font-semibold text-slate-800">
                          {productosPorId.get(Number(it.id_producto))?.nombre || `Producto #${it.id_producto}`}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={it.cantidad}
                          onChange={(e) => actualizarItem(i, 'cantidad', e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={it.precio_unitario}
                          onChange={(e) => actualizarItem(i, 'precio_unitario', e.target.value)}
                          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.lote}
                          onChange={(e) => actualizarItem(i, 'lote', e.target.value)}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          placeholder="Opcional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={it.fecha_vencimiento}
                          onChange={(e) => actualizarItem(i, 'fecha_vencimiento', e.target.value)}
                          className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={it.stock_minimo ?? ''}
                          onChange={(e) => actualizarItem(i, 'stock_minimo', e.target.value)}
                          placeholder="-"
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          title="Opcional: actualiza el stock minimo del producto"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-700">{formatCurrency(subtotal)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => eliminarItem(i)}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs text-white transition hover:bg-red-700"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-xl bg-slate-900 px-5 py-4 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Total compra</p>
          <p className="mt-1 text-3xl font-bold">{formatCurrency(totalCompra)}</p>

          <button
            type="button"
            onClick={registrarCompra}
            disabled={saving || loading}
            className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Registrando compra...' : 'Registrar Compra'}
          </button>
        </div>
      </article>

      <article className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Historial de compras</h3>
          <button
            type="button"
            onClick={cargarDatos}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        <input
          type="search"
          value={busquedaCompras}
          onChange={(e) => setBusquedaCompras(e.target.value)}
          placeholder="Buscar por ID, proveedor o usuario..."
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 font-semibold">Usuario</th>
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Items</th>
                <th className="px-3 py-2 font-semibold">Monto</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody>
              {comprasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    {busquedaCompras ? 'No hay compras que coincidan.' : 'No hay compras registradas.'}
                  </td>
                </tr>
              ) : (
                comprasFiltradas.map((c) => (
                  <tr key={c.id_compra} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">#{c.id_compra}</td>
                    <td className="px-3 py-2 text-slate-700">{c.proveedor_nombre || c.id_proveedor}</td>
                    <td className="px-3 py-2 text-slate-600">{c.usuario_nombre || '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDate(c.fecha_compra)}</td>
                    <td className="px-3 py-2 text-slate-700">{c.detalles_compra?.length || 0}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{formatCurrency(c.monto_total)}</td>
                    <td className="px-3 py-2 text-slate-700">{c.estado_compra}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setCompraDetalle(c)}
                        className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <CompraDetalleModal
        compra={compraDetalle}
        open={Boolean(compraDetalle)}
        onClose={() => setCompraDetalle(null)}
      />
    </section>
  );
}
