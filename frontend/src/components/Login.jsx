import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

export default function Login({ onSuccess, minimal, onSwitchToRegister }) {
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!formData.username.trim() || !formData.password) {
      setError('Completa usuario y contrasena.');
      return;
    }

    setLoading(true);
    const result = await login({
      username: formData.username.trim(),
      password: formData.password,
    });

    if (!result.ok) {
      setError(result.message || 'No se pudo iniciar sesion.');
    } else {
      if (onSuccess) onSuccess();
    }

    setLoading(false);
  };

  return (
    <div className={minimal ? "w-full bg-white" : "flex min-h-screen w-full bg-white"}>
      {!minimal && (
      <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 text-white lg:flex lg:w-1/2 lg:items-center">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(34,211,238,0.18),transparent_32%,transparent_68%,rgba(59,130,246,0.16))]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.28),transparent_38%),radial-gradient(circle_at_85%_80%,rgba(148,163,184,0.2),transparent_42%)]" />
        <div className="pointer-events-none absolute left-14 top-14 h-20 w-20 rounded-2xl border border-white/20" />
        <div className="pointer-events-none absolute bottom-16 right-20 h-28 w-28 rounded-full border border-cyan-200/25" />

        <div className="relative z-10 mx-auto w-full max-w-xl px-16">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-cyan-300">Trendify Cosmetics Suite</p>
          <h1 className="mt-7 text-5xl font-bold leading-[1.03]">Hazlo simple. Hazlo premium.</h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-200">
            Gestiona inventario, catalogos y usuarios desde una experiencia administrativa moderna y eficiente.
          </p>
          <div className="mt-10 inline-flex rounded-full border border-cyan-200/35 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
            Acceso Seguro JWT
          </div>
        </div>
      </section>
      )}

      <section className={minimal ? "flex w-full items-center justify-center p-4" : "flex min-h-screen w-full items-center justify-center bg-slate-100 p-6 sm:p-10 lg:w-1/2 lg:p-20"}>
        <div className={minimal ? "w-full" : "w-full max-w-md rounded-3xl border border-slate-300/80 bg-white p-9 shadow-[0_35px_90px_-40px_rgba(2,6,23,0.7)] ring-1 ring-slate-200/70"}>
          <div className="mb-9 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 lg:hidden">Trendify Cosmetics Suite</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-slate-950">Iniciar Sesion</h2>
            <p className="mt-2 text-sm text-slate-500">Ingresa tus credenciales para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">Usuario</span>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                autoComplete="username"
                className="mt-2 w-full rounded-xl border border-slate-400 bg-white px-4 py-3.5 text-sm font-medium text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="ej. dalvarez"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">Contrasena</span>
              <div className="relative mt-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-400 bg-white px-4 py-3.5 pr-16 text-sm font-medium text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Ingresa tu contrasena"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200"
                  tabIndex={-1}
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_14px_28px_-12px_rgba(2,6,23,0.75)] transition hover:from-slate-800 hover:to-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Validando credenciales...' : minimal ? 'Iniciar sesion' : 'Entrar al panel'}
            </button>

            {onSwitchToRegister && (
              <p className="text-center text-sm text-slate-600">
                No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="font-bold text-fuchsia-700 hover:text-fuchsia-800 hover:underline"
                >
                  Registrate aqui
                </button>
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
