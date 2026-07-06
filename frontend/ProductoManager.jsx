import { useEffect, useMemo, useState } from 'react';
import api from './src/utils/api';
import { filtrarPorTexto, obtenerImagenesProducto } from './src/utils/formHelpers';

const API_BASE = '/api';
const PRODUCTOS_URL = `${API_BASE}/productos/`;
const CATEGORIAS_URL = `${API_BASE}/categorias/`;
const MARCAS_URL = `${API_BASE}/marcas/`;

const TAMANO_MAX_IMAGEN_BYTES = 10 * 1024 * 1024; // 10 MB

const EMPTY_FORM = {
  nombre: '',
  descripcion: '',
  precio_compra: '',
  precio_venta: '',
  estado: 'activo',
  id_categoria: '',
  id_marca: '',
};

function leerArchivoComoDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ProductoManager() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [imagenesDataUri, setImagenesDataUri] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  // Modal "Nueva marca"
  const [mostrarModalMarca, setMostrarModalMarca] = useState(false);
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('');
  const [creandoMarca, setCreandoMarca] = useState(false);
  const [errorMarca, setErrorMarca] = useState('');

  const productosFiltrados = useMemo(
    () => filtrarPorTexto(productos, busqueda, ['nombre', 'descripcion', 'categoria_nombre']),
    [productos, busqueda]
  );

  const canSubmit = useMemo(() => {
    return (
      formData.nombre.trim() &&
      formData.precio_compra !== '' &&
      formData.precio_venta !== '' &&
      formData.id_categoria !== '' &&
      formData.id_marca !== ''
    );
  }, [formData]);

  const cargarDatosIniciales = async () => {
    setLoading(true);
    setError('');

    try {
      const [resProductos, resCategorias, resMarcas] = await Promise.all([
        api.get(PRODUCTOS_URL),
        api.get(CATEGORIAS_URL),
        api.get(MARCAS_URL),
      ]);

      setProductos(Array.isArray(resProductos.data) ? resProductos.data : []);
      setCategorias(Array.isArray(resCategorias.data) ? resCategorias.data : []);
      setMarcas(Array.isArray(resMarcas.data) ? resMarcas.data : []);
    } catch (err) {
      console.error('Error cargando catalogos/productos:', err);
      setError('No se pudieron cargar productos, categorias o marcas. Verifica tu API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImagenChange = async (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > TAMANO_MAX_IMAGEN_BYTES) {
      setError(`La imagen supera los 10 MB. Tamano actual: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      e.target.value = '';
      return;
    }

    try {
      const dataUri = await leerArchivoComoDataUri(file);
      setImagenesDataUri((prev) => [...prev, dataUri]);
    } catch (err) {
      console.error('Error leyendo imagen:', err);
      setError('No se pudo leer la imagen seleccionada.');
    }
  };

  const quitarImagen = (indice) => {
    setImagenesDataUri((prev) => prev.filter((_, idx) => idx !== indice));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setImagenesDataUri([]);
    setEditingId(null);
  };

  const handleEditProducto = (producto) => {
    setError('');
    setSuccess('');
    setEditingId(producto.id_producto ?? producto.id);
    setFormData({
      nombre: producto.nombre || '',
      descripcion: producto.descripcion || '',
      precio_compra: String(producto.precio_compra ?? ''),
      precio_venta: String(producto.precio_venta ?? ''),
      estado: producto.estado || 'activo',
      id_categoria: String(producto.id_categoria ?? ''),
      id_marca: String(producto.id_marca ?? ''),
    });
    setImagenesDataUri(obtenerImagenesProducto(producto.atributos));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!canSubmit) {
      setError('Completa los campos obligatorios del formulario.');
      return;
    }

    setSaving(true);
    try {
      const productoActual = editingId
        ? productos.find((p) => (p.id_producto ?? p.id) === editingId)
        : null;
      const atributosBase = productoActual?.atributos || {};

      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        precio_compra: formData.precio_compra,
        precio_venta: formData.precio_venta,
        estado: formData.estado,
        id_categoria: Number(formData.id_categoria),
        id_marca: Number(formData.id_marca),
        atributos: {
          ...atributosBase,
          imagen_data_uri: imagenesDataUri[0] || null,
          imagenes_data_uri: imagenesDataUri.length ? imagenesDataUri : null,
        },
      };

      if (editingId) {
        await api.patch(`${PRODUCTOS_URL}${editingId}/`, payload);
        setSuccess(`Producto #${editingId} actualizado.`);
      } else {
        const { data } = await api.post(PRODUCTOS_URL, payload);
        setSuccess(`Producto #${data?.id_producto ?? ''} registrado.`);
      }

      resetForm();
      await cargarDatosIniciales();
    } catch (err) {
      console.error('Error al guardar producto:', err);
      setError(err?.response?.data?.detail || 'No se pudo guardar el producto. Revisa los datos.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProducto = async (idProducto) => {
    const confirmar = window.confirm('Deseas eliminar este producto?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${PRODUCTOS_URL}${idProducto}/`);
      setProductos((prev) => prev.filter((p) => (p.id_producto ?? p.id) !== idProducto));
      if (editingId === idProducto) resetForm();
    } catch (err) {
      console.error('Error al eliminar producto:', err);
      setError('No se pudo eliminar el producto.');
    }
  };

  const abrirModalMarca = () => {
    setNuevaMarcaNombre('');
    setErrorMarca('');
    setMostrarModalMarca(true);
  };

  const cerrarModalMarca = () => {
    setMostrarModalMarca(false);
    setNuevaMarcaNombre('');
    setErrorMarca('');
  };

  const crearMarca = async () => {
    const nombre = nuevaMarcaNombre.trim();
    if (!nombre) {
      setErrorMarca('El nombre de la marca es obligatorio.');
      return;
    }

    setCreandoMarca(true);
    setErrorMarca('');
    try {
      const { data } = await api.post(MARCAS_URL, { nombre, estado: 'activo' });
      const nuevaId = data?.id_marca ?? data?.id;
      // Refrescamos la lista y auto-seleccionamos la nueva marca.
      const resMarcas = await api.get(MARCAS_URL);
      setMarcas(Array.isArray(resMarcas.data) ? resMarcas.data : []);
      if (nuevaId !== undefined) {
        setFormData((prev) => ({ ...prev, id_marca: String(nuevaId) }));
      }
      cerrarModalMarca();
    } catch (err) {
      console.error('Error creando marca:', err);
      setErrorMarca(err?.response?.data?.detail || 'No se pudo crear la marca.');
    } finally {
      setCreandoMarca(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5">
          <h2 className="text-2xl font-bold text-slate-800">Gestion de Productos</h2>
          <p className="mt-1 text-sm text-slate-500">Core del negocio: alta y control del catalogo de productos.</p>
        </header>

        {editingId && (
          <p className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800">
            Editando producto #{editingId}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="text"
            name="nombre"
            value={formData.nombre}
            onChange={handleInputChange}
            placeholder="Nombre del producto"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <input
            type="text"
            name="descripcion"
            value={formData.descripcion}
            onChange={handleInputChange}
            placeholder="Descripcion"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            name="precio_compra"
            value={formData.precio_compra}
            onChange={handleInputChange}
            placeholder="Precio compra"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            name="precio_venta"
            value={formData.precio_venta}
            onChange={handleInputChange}
            placeholder="Precio venta"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <select
            name="id_categoria"
            value={formData.id_categoria}
            onChange={handleInputChange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
          >
            <option value="">Selecciona categoria</option>
            {categorias.map((cat) => (
              <option key={cat.id_categoria ?? cat.id} value={cat.id_categoria ?? cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              name="id_marca"
              value={formData.id_marca}
              onChange={handleInputChange}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
            >
              <option value="">Selecciona marca</option>
              {marcas.map((m) => (
                <option key={m.id_marca ?? m.id} value={m.id_marca ?? m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={abrirModalMarca}
              className="shrink-0 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-fuchsia-700"
              title="Crear nueva marca"
            >
              + Nueva
            </button>
          </div>

          <select
            name="estado"
            value={formData.estado}
            onChange={handleInputChange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>

          <div className="md:col-span-2 xl:col-span-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Imagenes del producto (opcional, max 10 MB c/u)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImagenChange}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white file:hover:bg-slate-800"
              />
            </div>
            {imagenesDataUri.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imagenesDataUri.map((uri, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={uri}
                      alt={`Preview ${idx + 1}`}
                      className="h-24 w-24 rounded-xl object-cover ring-2 ring-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => quitarImagen(idx)}
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2 xl:col-span-4 flex gap-2">
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                editingId
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving
                ? 'Guardando...'
                : editingId
                ? 'Actualizar Producto'
                : 'Registrar Producto'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
        )}

        <div className="mb-4">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, descripcion o categoria..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          />
        </div>

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Imagen</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold">Precio Compra</th>
                <th className="px-4 py-3 font-semibold">Precio Venta</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                    Cargando datos...
                  </td>
                </tr>
              ) : productosFiltrados.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                    {busqueda ? 'No hay productos que coincidan con la busqueda.' : 'No hay productos registrados.'}
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((producto) => {
                  const id = producto.id_producto ?? producto.id;
                  const imagenes = obtenerImagenesProducto(producto.atributos);
                  const imagenProd = imagenes[0];
                  return (
                    <tr key={id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        {imagenProd ? (
                          <img src={imagenProd} alt={producto.nombre} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                            sin img
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{producto.nombre}</td>
                      <td className="px-4 py-3 text-slate-700">{producto.categoria_nombre || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">${producto.precio_compra}</td>
                      <td className="px-4 py-3 text-slate-700">${producto.precio_venta}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            producto.estado === 'activo'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {producto.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditProducto(producto)}
                            className="rounded-md bg-sky-600 px-3 py-1.5 text-white transition hover:bg-sky-700"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteProducto(id)}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-white transition hover:bg-red-700"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarModalMarca && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-800">Nueva marca</h3>
            <p className="mt-1 text-sm text-slate-500">
              La marca quedara activa y disponible para todos los productos.
            </p>

            <input
              type="text"
              value={nuevaMarcaNombre}
              onChange={(e) => setNuevaMarcaNombre(e.target.value)}
              placeholder="Nombre de la marca"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              autoFocus
            />

            {errorMarca && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMarca}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={cerrarModalMarca}
                disabled={creandoMarca}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={crearMarca}
                disabled={creandoMarca}
                className="flex-1 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-fuchsia-700 disabled:opacity-50"
              >
                {creandoMarca ? 'Creando...' : 'Crear marca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
