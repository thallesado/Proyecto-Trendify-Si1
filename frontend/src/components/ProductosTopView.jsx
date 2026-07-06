import { useEffect, useState } from 'react';
import api from '../utils/api';

const TOP_URL = '/api/reportes/productos-top/';
const CATEGORIAS_URL = '/api/categorias/';
const MARCAS_URL = '/api/marcas/';

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 2 });
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data?.results) return data.results;
  return [];
}

export default function ProductosTopView() {
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [criterio, setCriterio] = useState('unidades');
  const [periodo, setPeriodo] = useState('mes');
  const [idCategoria, setIdCategoria] = useState('');
  const [idMarca, setIdMarca] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { criterio, periodo };
      if (idCategoria) params.id_categoria = idCategoria;
      if (idMarca) params.id_marca = idMarca;
      const { data } = await api.get(TOP_URL, { params });
      setItems(data?.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cargar el ranking.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.get(CATEGORIAS_URL), api.get(MARCAS_URL)]).then(([c, m]) => {
      setCategorias(normalizeList(c.data));
      setMarcas(normalizeList(m.data));
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [criterio, periodo, idCategoria, idMarca]);

  const exportarCsv = () => {
    if (!items.length) return;
    const headers = ['id_producto', 'nombre', 'categoria', 'marca', 'unidades', 'ingresos', 'porcentaje'];
    const rows = items.map((it) => [
      it.id_producto,
      `"${(it.nombre || '').replace(/"/g, '""')}"`,
      it.categoria,
      it.marca,
      it.total_unidades,
      it.ingresos_generados,
      it.porcentaje_periodo,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos_top.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Productos mas vendidos</h2>
            <p className="mt-1 text-sm text-slate-500">Ranking por unidades o ingresos (CU22).</p>
          </div>
          <button type="button" onClick={exportarCsv} disabled={!items.length} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Exportar CSV
          </button>
        </header>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="mes">Mes actual</option>
            <option value="semana">Semana</option>
            <option value="hoy">Hoy</option>
          </select>
          <select value={criterio} onChange={(e) => setCriterio(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="unidades">Por unidades</option>
            <option value="ingresos">Por ingresos</option>
          </select>
          <select value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todas las categorias</option>
            {categorias.map((c) => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
          </select>
          <select value={idMarca} onChange={(e) => setIdMarca(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
          </select>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold">Unidades</th>
                <th className="px-4 py-3 font-semibold">Ingresos</th>
                <th className="px-4 py-3 font-semibold">% periodo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Sin ventas en el periodo seleccionado.</td></tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={it.id_producto} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold">{idx + 1}</td>
                    <td className="px-4 py-3">{it.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{it.categoria}</td>
                    <td className="px-4 py-3">{it.total_unidades}</td>
                    <td className="px-4 py-3">{currency(it.ingresos_generados)}</td>
                    <td className="px-4 py-3">{it.porcentaje_periodo}%</td>
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
