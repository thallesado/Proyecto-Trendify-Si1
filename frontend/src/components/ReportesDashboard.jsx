import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

const KPIS_URL = '/api/reportes/kpis/';

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  });
}

function montoCorto(value) {
  const n = Number(value || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('es-BO', { maximumFractionDigits: 0 });
}

function etiquetaDia(fechaIso) {
  if (!fechaIso) return '—';
  const partes = String(fechaIso).split('-');
  return partes.length >= 3 ? partes[2] : fechaIso.slice(-2);
}

const PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

export default function ReportesDashboard({ onNavigate }) {
  const [periodo, setPeriodo] = useState('mes');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get(KPIS_URL, { params: { periodo } });
      setData(res);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron cargar los KPIs.');
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const variacion = Number(data?.variacion_periodo_pct || 0);
  const variacionPositiva = variacion >= 0;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard Ejecutivo</h2>
          <p className="mt-1 text-sm text-slate-500">KPIs de ventas, pedidos e inventario (CU21).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={[
                'rounded-full px-4 py-1.5 text-xs font-semibold transition',
                periodo === p.value ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
          <button type="button" onClick={cargar} className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
            Actualizar
          </button>
        </div>
      </header>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Cargando indicadores...</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Ventas hoy" value={currency(data.ventas_hoy)} onClick={() => onNavigate?.('caja')} />
            <KpiCard title="Ventas del mes" value={currency(data.ventas_mes)} subtitle={`${data.ventas_count_periodo || 0} ventas en periodo`} />
            <KpiCard
              title="Variacion vs periodo anterior"
              value={`${variacionPositiva ? '+' : ''}${variacion}%`}
              subtitle={variacionPositiva ? 'Tendencia positiva' : 'Tendencia negativa'}
              accent={variacionPositiva ? 'emerald' : 'red'}
              onClick={() => onNavigate?.('tendencias')}
            />
            <KpiCard title="Pedidos pendientes" value={data.pedidos_pendientes} onClick={() => onNavigate?.('pedidos_online')} />
            <KpiCard title="Alertas de stock bajo" value={data.alertas_stock} onClick={() => onNavigate?.('alertas_predictivas')} />
            <KpiCard title="Productos activos" value={data.productos_activos} onClick={() => onNavigate?.('productos')} />
            <KpiCard title="Ventas del periodo" value={currency(data.ventas_periodo)} />
            <KpiCard title="Periodo anterior" value={currency(data.ventas_periodo_anterior)} />
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Evolucion diaria</h3>
            {(data.evolucion_diaria || []).length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Sin ventas registradas en este periodo.</p>
            ) : (
              <div className="mt-4 flex h-36 w-full items-end gap-1 overflow-x-auto pb-1 sm:gap-2">
                {(() => {
                  const puntos = data.evolucion_diaria || [];
                  const max = Math.max(...puntos.map((p) => Number(p.monto || 0)), 1);
                  const chartHeightPx = 112;
                  return puntos.map((punto) => {
                    const monto = Number(punto.monto || 0);
                    const barPx = Math.max(monto > 0 ? 6 : 2, Math.round((monto / max) * chartHeightPx));
                    return (
                      <div
                        key={punto.fecha}
                        className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1 sm:min-w-[28px]"
                        title={`${punto.fecha}: ${currency(monto)}`}
                      >
                        <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px]">
                          {monto > 0 ? montoCorto(monto) : '—'}
                        </span>
                        <div
                          className={`w-full max-w-10 rounded-t-md shadow-sm sm:max-w-12 ${
                            monto > 0
                              ? 'bg-gradient-to-t from-sky-600 to-sky-400'
                              : 'bg-slate-200'
                          }`}
                          style={{ height: `${barPx}px` }}
                        />
                        <span className="text-[9px] font-medium text-slate-500 sm:text-[10px]">
                          {etiquetaDia(punto.fecha)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </article>
        </>
      ) : null}
    </section>
  );
}

function KpiCard({ title, value, subtitle, accent, onClick }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-600' : accent === 'red' ? 'text-red-600' : 'text-slate-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"
    >
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-1 sm:mt-2 text-lg sm:text-2xl font-black leading-tight ${accentClass}`}>{value}</p>
      {subtitle && <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-slate-500">{subtitle}</p>}
    </button>
  );
}
