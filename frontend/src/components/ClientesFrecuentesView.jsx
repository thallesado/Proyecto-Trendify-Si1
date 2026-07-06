import { useEffect, useState } from 'react';
import api from '../utils/api';

const CLIENTES_TOP_URL = '/api/reportes/clientes-frecuentes/';
const CLIENTES_URL = '/api/clientes/';

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 2 });
}

function badgeCategoria(cat) {
  if (cat === 'TOP') return 'bg-fuchsia-100 text-fuchsia-800';
  if (cat === 'Recurrente') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-100 text-slate-700';
}

export default function ClientesFrecuentesView() {
  const [items, setItems] = useState([]);
  const [dias, setDias] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accionId, setAccionId] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(CLIENTES_TOP_URL, { params: { dias } });
      setItems(data?.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [dias]);

  const toggleTop = async (cliente) => {
    setAccionId(cliente.id_cliente);
    setError('');
    setSuccess('');
    try {
      await api.patch(`${CLIENTES_URL}${cliente.id_cliente}/`, { es_top: !cliente.es_top });
      setSuccess(`Cliente ${cliente.nombre_completo} actualizado.`);
      await cargar();
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo actualizar el cliente.');
    } finally {
      setAccionId(null);
    }
  };

  const exportarCsv = () => {
    const headers = ['id', 'nombre', 'telefono', 'compras', 'monto', 'categoria', 'es_top'];
    const rows = items.map((c) => [c.id_cliente, c.nombre_completo, c.telefono, c.num_compras, c.monto_acumulado, c.categoria, c.es_top]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes_frecuentes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Clientes frecuentes</h2>
            <p className="mt-1 text-sm text-slate-500">Clasificacion TOP y fidelizacion (CU23).</p>
          </div>
          <div className="flex gap-2">
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value={30}>Ultimos 30 dias</option>
              <option value={90}>Ultimos 90 dias</option>
              <option value={180}>Ultimos 180 dias</option>
            </select>
            <button type="button" onClick={exportarCsv} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">CSV</button>
          </div>
        </header>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Telefono</th>
                <th className="px-4 py-3 font-semibold">Compras</th>
                <th className="px-4 py-3 font-semibold">Monto</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold">TOP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center">Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Sin clientes con ventas en el periodo.</td></tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id_cliente} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{c.nombre_completo}</td>
                    <td className="px-4 py-3">{c.telefono || <span className="text-amber-600 text-xs">Sin telefono</span>}</td>
                    <td className="px-4 py-3">{c.num_compras}</td>
                    <td className="px-4 py-3 font-semibold">{currency(c.monto_acumulado)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeCategoria(c.categoria)}`}>{c.categoria}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={accionId === c.id_cliente}
                        onClick={() => toggleTop(c)}
                        className={[
                          'rounded-lg px-3 py-1 text-xs font-bold',
                          c.es_top ? 'bg-fuchsia-600 text-white' : 'border border-slate-300 text-slate-700',
                        ].join(' ')}
                      >
                        {accionId === c.id_cliente ? '...' : c.es_top ? 'Quitar TOP' : 'Marcar TOP'}
                      </button>
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
