import { useEffect, useMemo, useState } from 'react';

import api from './src/utils/api';
import { filtrarPorTexto } from './src/utils/formHelpers';

const API_URL = '/api/roles/';

const EMPTY_FORM = { nombre_rol: '', descripcion: '' };

export default function RolManager() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchRoles = async () => {
    setLoading(true);
    setError('');

    try {
      const { data } = await api.get(API_URL);
      setRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar roles:', err);
      setError('No se pudieron cargar los roles. Verifica el backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const rolesFiltrados = useMemo(
    () => filtrarPorTexto(roles, busqueda, ['nombre_rol', 'descripcion']),
    [roles, busqueda]
  );

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEdit = (rol) => {
    setError('');
    setSuccess('');
    setEditingId(rol.id_rol ?? rol.id);
    setFormData({
      nombre_rol: rol.nombre_rol || '',
      descripcion: rol.descripcion || '',
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.nombre_rol.trim()) {
      setError('El nombre del rol es obligatorio.');
      return;
    }

    const payload = {
      nombre_rol: formData.nombre_rol.trim(),
      descripcion: formData.descripcion.trim(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`${API_URL}${editingId}/`, payload);
        setSuccess(`Rol #${editingId} actualizado.`);
      } else {
        await api.post(API_URL, payload);
        setSuccess('Rol creado correctamente.');
      }
      resetForm();
      await fetchRoles();
    } catch (err) {
      console.error('Error al guardar rol:', err);
      setError('No se pudo guardar el rol. Revisa los datos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idRol) => {
    const confirmar = window.confirm('Deseas eliminar este rol?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${API_URL}${idRol}/`);
      setRoles((prev) => prev.filter((rol) => (rol.id_rol ?? rol.id) !== idRol));
      if (editingId === idRol) resetForm();
    } catch (err) {
      console.error('Error al eliminar rol:', err);
      setError('No se pudo eliminar el rol. Puede tener usuarios asociados.');
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5">
          <h2 className="text-2xl font-bold text-slate-800">Gestion de Roles</h2>
          <p className="mt-1 text-sm text-slate-500">Crea y administra los perfiles de acceso del sistema.</p>
        </header>

        {editingId && (
          <p className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800">
            Editando rol #{editingId}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 md:grid-cols-3">
          <input
            type="text"
            name="nombre_rol"
            value={formData.nombre_rol}
            onChange={handleChange}
            placeholder="Nombre del rol"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <input
            type="text"
            name="descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            placeholder="Descripcion"
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                editingId ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Rol'}
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
          placeholder="Buscar rol..."
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Descripcion</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Cargando roles...
                  </td>
                </tr>
              ) : rolesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay roles que coincidan.' : 'No hay roles registrados.'}
                  </td>
                </tr>
              ) : (
                rolesFiltrados.map((rol) => {
                  const id = rol.id_rol ?? rol.id;
                  return (
                    <tr key={id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{rol.nombre_rol}</td>
                      <td className="px-4 py-3 text-slate-700">{rol.descripcion || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(rol)}
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
