import { useEffect, useMemo, useState } from 'react';

import api from '../utils/api';

const BITACORA_URL = '/api/bitacora/';
const USUARIOS_DISPONIBLES_URL = '/api/bitacora/usuarios-disponibles/';
const EXPORT_URL = '/api/bitacora/export/';

const ACCIONES = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'LOGIN_OK',
  'LOGIN_FAIL',
  'LOGIN_BLOQUEADO',
  'LOGOUT',
  'CAMBIO_PASSWORD',
  'CAMBIO_PASSWORD_FALLIDO',
  'REGISTRO_CLIENTE',
  'CHECKOUT_PUBLICO',
  'CONFIRMAR_PAGO',
  'RECHAZAR_PAGO',
];

const TABLAS = [
  'usuarios',
  'roles',
  'clientes',
  'proveedores',
  'productos',
  'categorias',
  'marcas',
  'inventario',
  'movimientos_inventario',
  'ventas',
  'compras',
];

const ACCION_BADGE_CLASES = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN_OK: 'bg-sky-100 text-sky-700',
  LOGIN_FAIL: 'bg-orange-100 text-orange-700',
  LOGIN_BLOQUEADO: 'bg-red-200 text-red-900',
  LOGOUT: 'bg-slate-200 text-slate-700',
  CAMBIO_PASSWORD: 'bg-violet-100 text-violet-700',
  CAMBIO_PASSWORD_FALLIDO: 'bg-orange-100 text-orange-700',
  REGISTRO_CLIENTE: 'bg-fuchsia-100 text-fuchsia-700',
  CHECKOUT_PUBLICO: 'bg-indigo-100 text-indigo-700',
  CONFIRMAR_PAGO: 'bg-emerald-100 text-emerald-700',
  RECHAZAR_PAGO: 'bg-red-100 text-red-700',
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-BO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function badgeClase(accion) {
  return ACCION_BADGE_CLASES[accion] || 'bg-slate-100 text-slate-700';
}

const FILTROS_INICIALES = {
  fecha_inicio: '',
  fecha_fin: '',
  id_usuario: '',
  accion: '',
  tabla_afectada: '',
  q: '',
};

export default function BitacoraManager() {
  const [logs, setLogs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(25);

  const totalPaginas = useMemo(() => {
    if (!totalCount) return 1;
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  const fetchUsuarios = async () => {
    try {
      const { data } = await api.get(USUARIOS_DISPONIBLES_URL);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('No se pudo cargar la lista de usuarios para filtros.', err);
    }
  };

  const fetchBitacora = async (page = pagina, params = filtrosAplicados) => {
    setLoading(true);
    setError('');

    try {
      const queryParams = { page, page_size: pageSize };
      Object.entries(params).forEach(([key, value]) => {
        if (value) queryParams[key] = value;
      });

      const { data } = await api.get(BITACORA_URL, { params: queryParams });

      if (Array.isArray(data)) {
        setLogs(data);
        setTotalCount(data.length);
      } else {
        setLogs(Array.isArray(data?.results) ? data.results : []);
        setTotalCount(Number(data?.count) || 0);
      }
    } catch (err) {
      console.error('Error al cargar bitacora:', err);
      setError('No se pudo cargar la bitacora. Verifica la API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
    fetchBitacora(1, FILTROS_INICIALES);
  }, []);

  const aplicarFiltros = () => {
    setFiltrosAplicados(filtros);
    setPagina(1);
    fetchBitacora(1, filtros);
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_INICIALES);
    setFiltrosAplicados(FILTROS_INICIALES);
    setPagina(1);
    fetchBitacora(1, FILTROS_INICIALES);
  };

  const cambiarPagina = (nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > totalPaginas) return;
    setPagina(nuevaPagina);
    fetchBitacora(nuevaPagina, filtrosAplicados);
  };

  const exportarCSV = async () => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filtrosAplicados).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });

      const response = await api.get(`${EXPORT_URL}?${queryParams.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bitacora_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exportando CSV:', err);
      setError('No se pudo exportar la bitacora a CSV.');
    }
  };

  const handleFiltroChange = (campo) => (event) => {
    setFiltros((prev) => ({ ...prev, [campo]: event.target.value }));
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Bitacora del Sistema</h2>
            <p className="mt-1 text-sm text-slate-500">
              Historial completo de auditoria: accesos, cambios y operaciones de venta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fetchBitacora(pagina, filtrosAplicados)}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-700 focus:ring-2 focus:ring-slate-400 focus:outline-none disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refrescar
            </button>
            <button
              onClick={exportarCSV}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              Exportar CSV
            </button>
          </div>
        </header>

        <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Desde
            <input
              type="date"
              value={filtros.fecha_inicio}
              onChange={handleFiltroChange('fecha_inicio')}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Hasta
            <input
              type="date"
              value={filtros.fecha_fin}
              onChange={handleFiltroChange('fecha_fin')}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Usuario
            <select
              value={filtros.id_usuario}
              onChange={handleFiltroChange('id_usuario')}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id_usuario} value={u.id_usuario}>
                  {u.nombre_completo} ({u.username})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Accion
            <select
              value={filtros.accion}
              onChange={handleFiltroChange('accion')}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            >
              <option value="">Todas</option>
              {ACCIONES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Tabla
            <select
              value={filtros.tabla_afectada}
              onChange={handleFiltroChange('tabla_afectada')}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            >
              <option value="">Todas</option>
              {TABLAS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Buscar en detalle
            <input
              type="text"
              value={filtros.q}
              onChange={handleFiltroChange('q')}
              placeholder="texto libre"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800"
            />
          </label>

          <div className="col-span-full flex flex-wrap justify-end gap-2 pt-1">
            <button
              onClick={limpiarFiltros}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Limpiar
            </button>
            <button
              onClick={aplicarFiltros}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Aplicar filtros
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Accion</th>
                <th className="px-4 py-3 font-semibold">Tabla</th>
                <th className="px-4 py-3 font-semibold">ID Reg.</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
                <th className="px-4 py-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">Cargando bitacora...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">No hay registros que coincidan con los filtros.</td>
                </tr>
              ) : (
                logs.map((log) => {
                  const id = log.id_bitacora ?? log.id;
                  const detalleLargo = (log.detalle || '').length > 80;
                  return (
                    <tr key={id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(log.fecha_hora)}</td>
                      <td className="px-4 py-3 text-slate-700">{log.usuario_nombre || log.id_usuario || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClase(log.accion)}`}>
                          {log.accion || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.tabla_afectada || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{log.registro_afectado_id ?? '-'}</td>
                      <td className="max-w-md px-4 py-3 text-slate-700">
                        {detalleLargo ? (
                          <details>
                            <summary className="cursor-pointer text-sky-600 hover:underline">
                              Ver detalle ({(log.detalle || '').length} car.)
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{log.detalle}</p>
                          </details>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{log.detalle || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{log.direccion_ip || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Mostrando {logs.length} de {totalCount} registro(s). Pagina {pagina} de {totalPaginas}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => cambiarPagina(pagina - 1)}
              disabled={pagina <= 1 || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => cambiarPagina(pagina + 1)}
              disabled={pagina >= totalPaginas || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
