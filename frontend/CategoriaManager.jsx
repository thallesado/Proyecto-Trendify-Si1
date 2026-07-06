import { useEffect, useMemo, useState } from 'react';
import api from './src/utils/api';
import { filtrarPorTexto } from './src/utils/formHelpers';

const API_URL = '/api/categorias/';

const EMPTY_FORM = { nombre: '', descripcion: '' };

export default function CategoriaManager() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchCategorias = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(API_URL);
      setCategorias(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar categorias:', err);
      setError('No se pudieron cargar las categorias. Verifica que el backend este activo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  const categoriasFiltradas = useMemo(
    () => filtrarPorTexto(categorias, busqueda, ['nombre', 'descripcion']),
    [categorias, busqueda]
  );

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (categoria) => {
    setError('');
    setSuccess('');
    setEditingId(categoria.id_categoria ?? categoria.id);
    setFormData({
      nombre: categoria.nombre || '',
      descripcion: categoria.descripcion || '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    const payload = {
      nombre: formData.nombre.trim(),
      descripcion: formData.descripcion.trim(),
      estado: 'activo',
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`${API_URL}${editingId}/`, payload);
        setSuccess(`Categoria #${editingId} actualizada.`);
      } else {
        await api.post(API_URL, payload);
        setSuccess('Categoria registrada correctamente.');
      }
      resetForm();
      await fetchCategorias();
    } catch (err) {
      console.error('Error al guardar categoria:', err);
      setError('No se pudo guardar la categoria. Revisa los datos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idCategoria) => {
    const confirmar = window.confirm('Deseas eliminar esta categoria?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${API_URL}${idCategoria}/`);
      setCategorias((prev) => prev.filter((item) => (item.id_categoria ?? item.id) !== idCategoria));
      if (editingId === idCategoria) resetForm();
    } catch (err) {
      console.error('Error al eliminar categoria:', err);
      setError('No se pudo eliminar la categoria.');
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold text-slate-800">Gestion de Categorias</h2>

        {editingId && (
          <p className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800">
            Editando categoria #{editingId}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 md:grid-cols-3">
          <input
            type="text"
            name="nombre"
            placeholder="Nombre de la categoria"
            value={formData.nombre}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <input
            type="text"
            name="descripcion"
            placeholder="Descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 rounded-lg px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                editingId ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Registrar'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar categoria..."
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">Nombre</th>
                <th className="px-3 py-2 font-semibold">Descripcion</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Cargando categorias...
                  </td>
                </tr>
              ) : categoriasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay categorias que coincidan.' : 'No hay categorias registradas.'}
                  </td>
                </tr>
              ) : (
                categoriasFiltradas.map((categoria) => {
                  const id = categoria.id_categoria ?? categoria.id;
                  return (
                    <tr key={id} className="border-b border-slate-100 bg-white">
                      <td className="px-3 py-2 text-slate-700">{id}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{categoria.nombre}</td>
                      <td className="px-3 py-2 text-slate-700">{categoria.descripcion || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{categoria.estado || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(categoria)}
                            className="rounded-md bg-sky-600 px-3 py-1.5 text-white transition hover:bg-sky-700"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(id)}
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
    </section>
  );
}
