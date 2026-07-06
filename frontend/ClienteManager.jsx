import { useEffect, useMemo, useState } from 'react';
import api from './src/utils/api';
import SelectDepartamento from './src/components/SelectDepartamento';
import { filtrarPorTexto, sanitizeTelefono } from './src/utils/formHelpers';

const API_URL = '/api/clientes/';

const EMPTY_FORM = {
  nombre_completo: '',
  telefono: '',
  ciudad: '',
  direccion: '',
  es_top: false,
};

export default function ClienteManager() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchClientes = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(API_URL);
      setClientes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar clientes:', err);
      setError('No se pudieron cargar los clientes. Verifica que el backend este activo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const clientesFiltrados = useMemo(
    () => filtrarPorTexto(clientes, busqueda, ['nombre_completo', 'telefono', 'ciudad', 'direccion']),
    [clientes, busqueda]
  );

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = name === 'telefono' ? sanitizeTelefono(value) : value;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : nextValue,
    }));
  };

  const handleEdit = (cliente) => {
    setError('');
    setSuccess('');
    setEditingId(cliente.id_cliente ?? cliente.id);
    setFormData({
      nombre_completo: cliente.nombre_completo || '',
      telefono: sanitizeTelefono(cliente.telefono || ''),
      ciudad: cliente.ciudad || '',
      direccion: cliente.direccion || '',
      es_top: Boolean(cliente.es_top),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.nombre_completo.trim()) {
      setError('El nombre completo es obligatorio.');
      return;
    }

    const payload = {
      nombre_completo: formData.nombre_completo.trim(),
      telefono: sanitizeTelefono(formData.telefono),
      ciudad: formData.ciudad.trim(),
      direccion: formData.direccion.trim(),
      es_top: formData.es_top,
      estado: 'activo',
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`${API_URL}${editingId}/`, payload);
        setSuccess(`Cliente #${editingId} actualizado.`);
      } else {
        await api.post(API_URL, payload);
        setSuccess('Cliente registrado correctamente.');
      }
      resetForm();
      await fetchClientes();
    } catch (err) {
      console.error('Error al guardar cliente:', err);
      setError('No se pudo guardar el cliente. Revisa los datos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idCliente) => {
    const confirmar = window.confirm('Deseas eliminar este cliente?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${API_URL}${idCliente}/`);
      setClientes((prev) => prev.filter((cliente) => (cliente.id_cliente ?? cliente.id) !== idCliente));
      if (editingId === idCliente) resetForm();
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      setError('No se pudo eliminar el cliente.');
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold text-slate-800">Gestion de Clientes</h2>

        {editingId && (
          <p className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800">
            Editando cliente #{editingId}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 md:grid-cols-2">
          <input
            type="text"
            name="nombre_completo"
            placeholder="Nombre completo"
            value={formData.nombre_completo}
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

          <SelectDepartamento
            name="ciudad"
            value={formData.ciudad}
            onChange={handleChange}
            placeholder="Selecciona departamento"
          />

          <input
            type="text"
            name="direccion"
            placeholder="Direccion"
            value={formData.direccion}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
          />

          <label className="flex items-center gap-2 text-slate-700 md:col-span-2">
            <input
              type="checkbox"
              name="es_top"
              checked={formData.es_top}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Es Cliente TOP
          </label>

          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 rounded-lg px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                editingId ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar Cliente' : 'Registrar Cliente'}
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
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        )}

        <div className="mb-4">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, telefono, ciudad o direccion..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          />
        </div>

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">Nombre</th>
                <th className="px-3 py-2 font-semibold">Telefono</th>
                <th className="px-3 py-2 font-semibold">Ciudad</th>
                <th className="px-3 py-2 font-semibold">Direccion</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Cargando clientes...
                  </td>
                </tr>
              ) : clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay clientes que coincidan con la busqueda.' : 'No hay clientes registrados.'}
                  </td>
                </tr>
              ) : (
                clientesFiltrados.map((cliente) => {
                  const id = cliente.id_cliente ?? cliente.id;
                  const esTop = Boolean(cliente.es_top);

                  return (
                    <tr
                      key={id}
                      className={`border-b border-slate-100 ${esTop ? 'bg-amber-50/60' : 'bg-white'}`}
                    >
                      <td className="px-3 py-2 text-slate-700">{id}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{cliente.nombre_completo}</span>
                          {esTop && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              VIP
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{cliente.telefono || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{cliente.ciudad || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{cliente.direccion || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{cliente.estado || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(cliente)}
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
