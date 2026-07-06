import { useMemo, useState } from 'react';

import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';

const ROLE_LABELS = {
  1: 'Administrador',
  2: 'Vendedor',
  3: 'Bodeguero',
  4: 'Compras',
  5: 'Auditor',
  6: 'Cliente',
};

function extractRoleId(user) {
  if (!user) return null;
  const candidates = [
    user?.id_rol?.id_rol,
    user?.id_rol,
    user?.rol?.id_rol,
    user?.rol,
    user?.role_id,
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export default function Perfil() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    password_actual: '',
    password_nuevo: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const roleId = useMemo(() => extractRoleId(user), [user]);
  const roleLabel = ROLE_LABELS[roleId] || user?.id_rol?.nombre_rol || 'Usuario';

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.password_actual || !formData.password_nuevo) {
      setError('Completa ambos campos de contrasena.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post('/api/auth/cambiar-password/', {
        password_actual: formData.password_actual,
        password_nuevo: formData.password_nuevo,
      });

      setSuccess(data?.detail || 'Contrasena actualizada correctamente.');
      setFormData({
        password_actual: '',
        password_nuevo: '',
      });
    } catch (err) {
      console.error('Error al cambiar contrasena:', err);
      setError(err?.response?.data?.detail || 'No se pudo cambiar la contrasena.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Mi Perfil</h2>
        <p className="mt-1 text-sm text-slate-500">
          Datos de tu cuenta y cambio de contrasena del panel administrativo.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <UserAvatar username={user?.username} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-slate-900">{user?.nombre_completo || user?.username || '-'}</p>
              <p className="truncate text-sm text-slate-500">@{user?.username || '-'}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Rol</dt>
              <dd className="font-semibold text-slate-800">{roleLabel}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Estado</dt>
              <dd className="font-semibold text-emerald-700">{user?.estado || 'activo'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">ID usuario</dt>
              <dd className="font-semibold text-slate-800">#{user?.id_usuario ?? user?.id ?? '-'}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="mb-4">
            <h3 className="text-lg font-bold text-slate-800">Cambiar contrasena</h3>
            <p className="mt-1 text-sm text-slate-500">Por seguridad, confirma tu contrasena actual.</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contrasena actual</span>
              <input
                type="password"
                name="password_actual"
                value={formData.password_actual}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none transition focus:ring-2 focus:ring-slate-800"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nueva contrasena</span>
              <input
                type="password"
                name="password_nuevo"
                value={formData.password_nuevo}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none transition focus:ring-2 focus:ring-slate-800"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {success && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Cambiar contrasena'}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
