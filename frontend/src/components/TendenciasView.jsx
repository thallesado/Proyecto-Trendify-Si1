import { useEffect, useState } from 'react';
import api from '../utils/api';

const TENDENCIAS_URL = '/api/reportes/tendencias/';

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 2 });
}

function montoCorto(value) {
  const n = Number(value || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('es-BO', { maximumFractionDigits: 0 });
}

export default function TendenciasView() {
  const [series, setSeries] = useState([]);
  const [dimension, setDimension] = useState('categoria');
  const [periodo, setPeriodo] = useState('mes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(TENDENCIAS_URL, { params: { dimension, periodo } });
      setSeries(data?.series || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron cargar las tendencias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [dimension, periodo]);

  const exportarResumen = () => {
    const lineas = ['dimension,periodo,nombre,ultimo_monto,variacion_pct'];
    series.forEach((s) => {
      const ultimo = s.puntos?.[s.puntos.length - 1];
      lineas.push([dimension, periodo, `"${s.nombre}"`, ultimo?.monto || 0, s.variacion_ultimo_pct].join(','));
    });
    const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tendencias_resumen.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Tendencias de venta</h2>
            <p className="mt-1 text-sm text-slate-500">Comparacion por categoria, marca o ciudad (CU26).</p>
          </div>
          <button type="button" onClick={exportarResumen} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Exportar resumen</button>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="categoria">Por categoria</option>
            <option value="marca">Por marca</option>
            <option value="ciudad">Por ciudad</option>
          </select>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="mes">Ultimos 6 meses</option>
            <option value="trimestre">Trimestre</option>
            <option value="anual">Anual</option>
          </select>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? <p className="text-slate-500">Cargando tendencias...</p> : (
          <div className="space-y-4">
            {series.length === 0 ? (
              <p className="text-slate-500">Sin datos suficientes para el periodo.</p>
            ) : (
              series.slice(0, 12).map((s) => {
                const max = Math.max(...(s.puntos || []).map((p) => Number(p.monto || 0)), 1);
                const variacion = Number(s.variacion_ultimo_pct || 0);
                return (
                  <article key={s.nombre} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-800">{s.nombre}</h3>
                      <span className={`text-sm font-semibold ${variacion >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {variacion >= 0 ? '+' : ''}{variacion}% vs mes anterior
                      </span>
                    </div>
                    <div className="mt-4 flex h-36 w-full items-end gap-2 sm:gap-4">
                      {(s.puntos || []).map((p) => {
                        const monto = Number(p.monto || 0);
                        const barPx = Math.max(6, Math.round((monto / max) * 100));
                        return (
                          <div
                            key={`${s.nombre}-${p.periodo}`}
                            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                            title={`${p.periodo}: ${currency(monto)}`}
                          >
                            <span className="text-[10px] font-semibold text-slate-600 sm:text-xs">
                              {monto > 0 ? montoCorto(monto) : '—'}
                            </span>
                            <div
                              className="w-full max-w-14 rounded-t-lg bg-gradient-to-t from-violet-600 to-violet-400 shadow-sm transition-all"
                              style={{ height: `${barPx}px` }}
                            />
                            <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                              {p.periodo?.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </div>
    </section>
  );
}
