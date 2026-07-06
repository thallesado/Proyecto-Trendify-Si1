import { useEffect, useMemo, useState } from 'react';

import api from './src/utils/api';
import { filtrarPorTexto } from './src/utils/formHelpers';

const USUARIOS_URL = '/api/usuarios/';
const ROLES_URL = '/api/roles/';

const EMPTY_FORM = {
  username: '',
  password_hash: '',
  nombre_completo: '',
  id_rol: '',
  estado: 'activo',
  descripcion: '',
};

function UsuarioFormFields({ formData, roles, onChange, editing = false }) {
  return (
    <>
      <input
        type="text"
        name="username"
        value={formData.username}
        onChange={onChange}
        placeholder="Username"
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
      />

      <input
        type="text"
        name="password_hash"
        value={formData.password_hash}
        onChange={onChange}
        placeholder={editing ? 'Nueva contrasena (opcional)' : 'Password'}
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
      />

      <input
        type="text"
        name="nombre_completo"
        value={formData.nombre_completo}
        onChange={onChange}
        placeholder="Nombre completo"
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
      />

      <select
        name="id_rol"
        value={formData.id_rol}
        onChange={onChange}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
      >
        <option value="">Selecciona rol</option>
        {roles.map((rol) => (
          <option key={rol.id_rol ?? rol.id} value={rol.id_rol ?? rol.id}>
            {rol.nombre_rol}
          </option>
        ))}
      </select>

      <select
        name="estado"
        value={formData.estado}
        onChange={onChange}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-500"
      >
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </select>

      <textarea
        name="descripcion"
        value={formData.descripcion}
        onChange={onChange}
        placeholder="Descripcion (opcional): cargo, notas, biografia..."
        rows={3}
        className="md:col-span-2 xl:col-span-5 rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500"
      />
    </>
  );
}

export default function UsuarioManager() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [modalAbierto, setModalAbierto] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const [usuariosResponse, rolesResponse] = await Promise.all([
        api.get(USUARIOS_URL),
        api.get(ROLES_URL),
      ]);

      setUsuarios(Array.isArray(usuariosResponse.data) ? usuariosResponse.data : []);
      setRoles(Array.isArray(rolesResponse.data) ? rolesResponse.data : []);
    } catch (err) {
      console.error('Error al cargar usuarios/roles:', err);
      setError('No se pudieron cargar usuarios y roles. Verifica la API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const usuariosFiltrados = useMemo(
    () => filtrarPorTexto(usuarios, busqueda, ['username', 'nombre_completo', 'descripcion']),
    [usuarios, busqueda]
  );

  const cerrarModal = () => {
    setModalAbierto(false);
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const handleCreateChange = (event) => {
    const { name, value } = event.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (usuario) => {
    setError('');
    setSuccess('');
    const id = usuario.id_usuario ?? usuario.id;
    const rolId = Number(usuario.id_rol?.id_rol ?? usuario.id_rol);
    setEditingId(id);
    setEditForm({
      username: usuario.username || '',
      password_hash: '',
      nombre_completo: usuario.nombre_completo || '',
      id_rol: String(rolId || ''),
      estado: usuario.estado || 'activo',
      descripcion: usuario.descripcion || '',
    });
    setModalAbierto(true);
  };

  const guardarUsuario = async (formData, idEdicion = null) => {
    setError('');
    setSuccess('');

    if (!formData.username.trim() || !formData.nombre_completo.trim() || !formData.id_rol) {
      setError('Completa todos los campos obligatorios del formulario.');
      return false;
    }

    if (!idEdicion && !formData.password_hash) {
      setError('La contrasena es obligatoria al crear un usuario.');
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        username: formData.username.trim(),
        nombre_completo: formData.nombre_completo.trim(),
        id_rol: Number(formData.id_rol),
        estado: formData.estado,
        descripcion: formData.descripcion.trim() || null,
      };

      if (formData.password_hash.trim()) {
        payload.password_hash = formData.password_hash;
      }

      if (idEdicion) {
        await api.patch(`${USUARIOS_URL}${idEdicion}/`, payload);
        setSuccess(`Usuario #${idEdicion} actualizado.`);
        cerrarModal();
      } else {
        await api.post(USUARIOS_URL, payload);
        setSuccess('Usuario creado correctamente.');
        setCreateForm(EMPTY_FORM);
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('Error al guardar usuario:', err);
      setError('No se pudo guardar el usuario. Revisa los datos e intenta nuevamente.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    await guardarUsuario(createForm);
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingId) return;
    await guardarUsuario(editForm, editingId);
  };

  const handleDelete = async (idUsuario) => {
    const confirmar = window.confirm('Deseas eliminar este usuario?');
    if (!confirmar) return;

    setError('');
    try {
      await api.delete(`${USUARIOS_URL}${idUsuario}/`);
      setUsuarios((prev) => prev.filter((usuario) => (usuario.id_usuario ?? usuario.id) !== idUsuario));
      if (editingId === idUsuario) cerrarModal();
    } catch (err) {
      console.error('Error al eliminar usuario:', err);
      setError('No se pudo eliminar el usuario.');
    }
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5">
          <h2 className="text-2xl font-bold text-slate-800">Gestion de Usuarios</h2>
          <p className="mt-1 text-sm text-slate-500">Crea usuarios desde el formulario. La edicion se abre en un modal.</p>
        </header>

        <form onSubmit={handleCreateSubmit} className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <UsuarioFormFields formData={createForm} roles={roles} onChange={handleCreateChange} />
          <div className="md:col-span-2 xl:col-span-5">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && !modalAbierto ? 'Guardando...' : 'Crear usuario'}
            </button>
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
            placeholder="Buscar por username, nombre o descripcion..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          />
        </div>

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ID</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Username</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Nombre</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Rol</th>
                <th className="px-4 py-3 font-semibold">Descripcion</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay usuarios que coincidan con la busqueda.' : 'No hay usuarios registrados.'}
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map((usuario) => {
                  const id = usuario.id_usuario ?? usuario.id;
                  const rolId = Number(usuario.id_rol?.id_rol ?? usuario.id_rol);
                  const rol = roles.find((r) => Number(r.id_rol ?? r.id) === rolId);

                  return (
                    <tr key={id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{usuario.username}</td>
                      <td className="px-4 py-3 text-slate-700">{usuario.nombre_completo}</td>
                      <td className="px-4 py-3 text-slate-700">{rol?.nombre_rol || rolId || '-'}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-600 whitespace-normal break-words">{usuario.descripcion || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{usuario.estado || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(usuario)}
                            className="rounded-md bg-sky-600 px-3 py-1.5 text-white transition hover:bg-sky-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
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

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Editar usuario #{editingId}</h3>
                <p className="text-sm text-slate-500">Modifica los datos y guarda los cambios.</p>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                X
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="grid gap-3 sm:grid-cols-2">
              <UsuarioFormFields formData={editForm} roles={roles} onChange={handleEditChange} editing />
              <div className="sm:col-span-2 flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Actualizar usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
