import { useAuth } from '../context/AuthContext';

export default function SessionExpiredModal() {
  const { sessionExpired, sessionExpiredReason, dismissSessionExpired } = useAuth();

  if (!sessionExpired) return null;

  const porInactividad = sessionExpiredReason === 'inactivity';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
            {porInactividad ? '⏱️' : '🔒'}
          </span>
          <h3 className="text-xl font-bold text-slate-900">
            {porInactividad ? 'Desconectado por inactividad' : 'Tu sesion ha expirado'}
          </h3>
        </div>
        <p className="text-sm text-slate-600">
          {porInactividad
            ? 'Tu sesion se cerro automaticamente tras 5 minutos sin actividad. Inicia sesion de nuevo para continuar.'
            : 'Por seguridad, hemos cerrado tu sesion. Por favor inicia sesion de nuevo para continuar trabajando.'}
        </p>

        <button
          type="button"
          onClick={dismissSessionExpired}
          className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Iniciar sesion
        </button>
      </div>
    </div>
  );
}
