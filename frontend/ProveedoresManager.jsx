import { useEffect, useMemo, useState } from 'react';
import api from './src/utils/api';
import { filtrarPorTexto, sanitizeTelefono } from './src/utils/formHelpers';

const API_URL = '/api/proveedores/';

const EMPTY_FORM = {
  nombre_empresa: '',
  contacto: '',
  telefono: '',
  estado: 'activo',
};

export default function ProveedoresManager() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchProveedores = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(API_URL);
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
      setError('No se pudieron cargar los proveedores. Verifica que el backend este activo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProveedores();
  }, []);

  const proveedoresFiltrados = useMemo(
    () => filtrarPorTexto(proveedores, busqueda, ['nombre_empresa', 'contacto', 'telefono']),
    [proveedores, busqueda]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'telefono' ? sanitizeTelefono(value) : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.nombre_empresa.trim()) {
      setError('El nombre de la empresa es obligatorio.');
      return;
    }

    const payload = {
      nombre_empresa: formData.nombre_empresa.trim(),
      contacto: formData.contacto.trim(),
      telefono: sanitizeTelefono(formData.telefono),
      estado: formData.estado || 'activo',
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`${API_URL}${editingId}/`, payload);
      } else {
        await api.post(API_URL, payload);
      }
      resetForm();
      await fetchProveedores();
    } catch (err) {
      console.error('Error al guardar proveedor:', err);
      setError('No se pudo guardar el proveedor. Revisa los datos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (proveedor) => {
    setEditingId(proveedor.id_proveedor);
    setFormData({
      nombre_empresa: proveedor.nombre_empresa || '',
      contacto: proveedor.contacto || '',
      telefono: proveedor.telefono || '',
      estado: proveedor.estado || 'activo',
    });
  };

  const handleDelete = async (idProveedor) => {
    const confirmar = window.confirm('Deseas eliminar este proveedor?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${API_URL}${idProveedor}/`);
      setProveedores((prev) => prev.filter((p) => p.id_proveedor !== idProveedor));
      if (editingId === idProveedor) resetForm();
    } catch (err) {
      console.error('Error al eliminar proveedor:', err);
      setError('No se pudo eliminar el proveedor.');
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold text-slate-800">Gestion de Proveedores</h2>

        {editingId && (
          <p className="mb-3 inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-700">
            Editando proveedor #{editingId}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 md:grid-cols-2">
          <input
            type="text"
            name="nombre_empresa"
            placeholder="Nombre de la empresa"
            value={formData.nombre_empresa}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />
          <input
            type="text"
            name="contacto"
            placeholder="Persona de contacto"
            value={formData.contacto}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />
          <input
            type="tel"
            inputMode="numeric"
            name="telefono"
            placeholder="Telefono (solo numeros)"
            value={formData.telefono}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />
          <select
            name="estado"
            value={formData.estado}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>

          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 rounded-lg px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                editingId
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {saving
                ? 'Guardando...'
                : editingId
                ? 'Actualizar Proveedor'
                : 'Registrar Proveedor'}
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
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-4">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por empresa, contacto o telefono..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          />
        </div>

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">Empresa</th>
                <th className="px-3 py-2 font-semibold">Contacto</th>
                <th className="px-3 py-2 font-semibold">Telefono</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : proveedoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay proveedores que coincidan con la busqueda.' : 'No hay proveedores registrados.'}
                  </td>
                </tr>
              ) : (
                proveedoresFiltrados.map((proveedor) => (
                  <tr key={proveedor.id_proveedor} className="border-b border-slate-100 bg-white">
                    <td className="px-3 py-2 text-slate-700">{proveedor.id_proveedor}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {proveedor.nombre_empresa}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{proveedor.contacto || '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{proveedor.telefono || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          proveedor.estado === 'activo'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {proveedor.estado || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(proveedor)}
                          className="rounded-md bg-sky-600 px-3 py-1.5 text-white transition hover:bg-sky-700"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(proveedor.id_proveedor)}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-white transition hover:bg-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
