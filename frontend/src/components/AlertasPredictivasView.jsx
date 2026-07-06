import { useEffect, useState } from 'react';
import api from '../utils/api';

const ALERTAS_URL = '/api/reportes/alertas-predictivas/';
const ATENDER_URL = '/api/reportes/alertas-atender/';

function badgeNivel(nivel) {
  if (nivel === 'critica') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

export default function AlertasPredictivasView({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [umbralDias, setUmbralDias] = useState(7);
  const [diasHistorial, setDiasHistorial] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accionId, setAccionId] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(ALERTAS_URL, { params: { umbral_dias: umbralDias, dias: diasHistorial } });
      setItems((data?.items || []).filter((a) => !a.atendida));
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron calcular las alertas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [umbralDias, diasHistorial]);

  const atender = async (alerta) => {
    setAccionId(alerta.id_producto);
    setSuccess('');
    try {
      await api.post(ATENDER_URL, { id_producto: alerta.id_producto, nota: 'Revisada desde modulo de alertas.' });
      setSuccess(`Alerta de "${alerta.nombre}" marcada como atendida.`);
      await cargar();
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo atender la alerta.');
    } finally {
      setAccionId(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5">
          <h2 className="text-2xl font-bold text-slate-800">Alertas predictivas de stock</h2>
          <p className="mt-1 text-sm text-slate-500">Estimacion de agotamiento segun velocidad de venta (CU25).</p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            Umbral (dias)
            <input type="number" min={1} max={30} value={umbralDias} onChange={(e) => setUmbralDias(Number(e.target.value))} className="w-16 rounded border border-slate-300 px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Historial (dias)
            <select value={diasHistorial} onChange={(e) => setDiasHistorial(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1">
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </label>
          <button type="button" onClick={cargar} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Recalcular</button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Minimo</th>
                <th className="px-4 py-3 font-semibold">Vel./dia</th>
                <th className="px-4 py-3 font-semibold">Dias est.</th>
                <th className="px-4 py-3 font-semibold">Nivel</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center">Calculando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No hay alertas vigentes con los umbrales actuales.</td></tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id_producto} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{a.nombre}</td>
                    <td className="px-4 py-3">{a.stock_actual}</td>
                    <td className="px-4 py-3">{a.stock_minimo}</td>
                    <td className="px-4 py-3">{a.velocidad_diaria ?? '-'}</td>
                    <td className="px-4 py-3 font-bold">{a.dias_estimados ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeNivel(a.nivel)}`}>{a.nivel}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onNavigate?.('compras')} className="rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white">Ingreso (CU12)</button>
                        <button type="button" disabled={accionId === a.id_producto} onClick={() => atender(a)} className="rounded border border-slate-300 px-2 py-1 text-xs font-bold">Atendida</button>
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
