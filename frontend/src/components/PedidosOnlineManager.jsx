import { useEffect, useMemo, useState } from 'react';

import api from '../utils/api';
import { buildReciboUrl } from '../utils/formHelpers';

const VENTAS_URL = '/api/ventas/';

const ESTADOS = [
  { value: 'pendiente_validacion', label: 'Pendientes online' },
  { value: 'pendiente_verificacion', label: 'Pagos QR/transferencia' },
  { value: 'completada', label: 'Completadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: '', label: 'Todas' },
];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function labelEstado(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'pendiente_validacion') return 'Pendiente online';
  if (e === 'pendiente_verificacion') return 'Pendiente verificación';
  if (e === 'completada') return 'Completada';
  if (e === 'rechazada') return 'Rechazada';
  return estado || '-';
}

function esPendienteAccion(estado) {
  const e = (estado || '').toLowerCase();
  return e === 'pendiente_validacion' || e === 'pendiente_verificacion';
}

function badgeEstado(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'completada') return 'bg-emerald-100 text-emerald-700';
  if (e === 'rechazada') return 'bg-red-100 text-red-700';
  if (e === 'pendiente_validacion') return 'bg-amber-100 text-amber-700';
  if (e === 'pendiente_verificacion') return 'bg-orange-100 text-orange-800';
  return 'bg-slate-100 text-slate-700';
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function PedidoDetalleModal({ venta, open, onClose }) {
  if (!open || !venta) return null;

  const detalles = venta.detalles_venta || [];
  const completada = (venta.estado_venta || '').toLowerCase() === 'completada';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Pedido #{venta.id_venta}</h3>
            <p className="text-sm text-slate-500">{venta.cliente_nombre || '-'} · {formatDate(venta.fecha_hora)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            X
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="font-semibold text-slate-600">Metodo pago:</span> {venta.metodo_pago || '-'}</p>
            <p><span className="font-semibold text-slate-600">Estado:</span> {labelEstado(venta.estado_venta)}</p>
            <p><span className="font-semibold text-slate-600">Comprobante:</span> {venta.numero_comprobante || '-'}</p>
            <p><span className="font-semibold text-slate-600">Total:</span> {formatCurrency(venta.monto_total)}</p>
          </div>

          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Productos</h4>
          {detalles.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">Sin detalle de productos.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 font-semibold">Cant.</th>
                    <th className="px-3 py-2 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((det) => (
                    <tr key={det.id_detalle_venta} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{det.producto_nombre || det.id_producto}</td>
                      <td className="px-3 py-2 text-slate-700">{det.cantidad}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{formatCurrency(det.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {completada && (
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={buildReciboUrl(venta.id_venta, 'html')}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Recibo HTML
              </a>
              <a
                href={buildReciboUrl(venta.id_venta, 'pdf')}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"
              >
                Recibo PDF
              </a>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PedidosOnlineManager() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendiente_validacion');
  const [busqueda, setBusqueda] = useState('');
  const [pedidoDetalle, setPedidoDetalle] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);

  // Modal de rechazo: pide motivo.
  const [ventaARechazar, setVentaARechazar] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const cargarVentas = async (estado = filtroEstado) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (estado) params.estado = estado;
      const { data } = await api.get(VENTAS_URL, { params });
      setVentas(normalizeList(data));
    } catch (err) {
      console.error('Error cargando ventas:', err);
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarVentas(filtroEstado);
  }, [filtroEstado]);

  const confirmarVenta = async (venta) => {
    setError('');
    setSuccess('');
    setAccionEnCurso(venta.id_venta);
    try {
      await api.post(`${VENTAS_URL}${venta.id_venta}/confirmar/`);
      setSuccess(`Venta #${venta.id_venta} confirmada correctamente.`);
      await cargarVentas(filtroEstado);
    } catch (err) {
      console.error('Error confirmando venta:', err);
      setError(err?.response?.data?.detail || 'No se pudo confirmar la venta.');
    } finally {
      setAccionEnCurso(null);
    }
  };

  const abrirModalRechazo = (venta) => {
    setError('');
    setSuccess('');
    setMotivoRechazo('');
    setVentaARechazar(venta);
  };

  const cerrarModalRechazo = () => {
    setVentaARechazar(null);
    setMotivoRechazo('');
  };

  const confirmarRechazo = async () => {
    if (!ventaARechazar) return;
    setAccionEnCurso(ventaARechazar.id_venta);
    try {
      await api.post(`${VENTAS_URL}${ventaARechazar.id_venta}/rechazar/`, {
        motivo: motivoRechazo.trim() || 'Sin motivo especificado',
      });
      setSuccess(`Venta #${ventaARechazar.id_venta} rechazada. Stock restaurado.`);
      cerrarModalRechazo();
      await cargarVentas(filtroEstado);
    } catch (err) {
      console.error('Error rechazando venta:', err);
      setError(err?.response?.data?.detail || 'No se pudo rechazar la venta.');
    } finally {
      setAccionEnCurso(null);
    }
  };

  const ventasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ventas;
    return ventas.filter(
      (v) =>
        String(v.id_venta).includes(q) ||
        String(v.cliente_nombre || '').toLowerCase().includes(q) ||
        String(v.numero_comprobante || '').toLowerCase().includes(q) ||
        String(v.metodo_pago || '').toLowerCase().includes(q)
    );
  }, [ventas, busqueda]);

  const conteo = useMemo(() => ventasFiltradas.length, [ventasFiltradas]);

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Pedidos Online</h2>
            <p className="mt-1 text-sm text-slate-500">
              Revisa pedidos online y ventas POS con pago QR o transferencia pendiente de verificación.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e.label}
                onClick={() => setFiltroEstado(e.value)}
                className={[
                  'rounded-full px-4 py-1.5 text-xs font-semibold transition',
                  filtroEstado === e.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
                ].join(' ')}
              >
                {e.label}
              </button>
            ))}
            <button
              onClick={() => cargarVentas(filtroEstado)}
              disabled={loading}
              className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Refrescar'}
            </button>
          </div>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
        )}

        <p className="mb-3 text-xs text-slate-500">
          Mostrando {conteo} pedido(s) {filtroEstado ? `con estado "${filtroEstado}"` : ''}.
        </p>

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por #, cliente, comprobante o metodo de pago..."
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Metodo</th>
                <th className="px-4 py-3 font-semibold">Comprobante</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">Cargando pedidos...</td>
                </tr>
              ) : ventasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    {busqueda ? 'No hay pedidos que coincidan con la busqueda.' : 'No hay pedidos para mostrar.'}
                  </td>
                </tr>
              ) : (
                ventasFiltradas.map((venta) => {
                  const enCurso = accionEnCurso === venta.id_venta;
                  const pendiente = esPendienteAccion(venta.estado_venta);
                  return (
                    <tr key={venta.id_venta} className="border-t border-slate-100 align-top hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-800">#{venta.id_venta}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(venta.fecha_hora)}</td>
                      <td className="px-4 py-3 text-slate-700">{venta.cliente_nombre || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{venta.metodo_pago || '-'}</td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{venta.numero_comprobante || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(venta.monto_total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeEstado(venta.estado_venta)}`}>
                          {labelEstado(venta.estado_venta)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPedidoDetalle(venta)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Detalle
                          </button>
                          {pendiente ? (
                            <>
                            <button
                              onClick={() => confirmarVenta(venta)}
                              disabled={enCurso}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {enCurso ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => abrirModalRechazo(venta)}
                              disabled={enCurso}
                              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                            </>
                          ) : (
                            <span className="self-center text-xs text-slate-400">Sin acciones</span>
                          )}
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

      {ventaARechazar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-800">
              Rechazar venta #{ventaARechazar.id_venta}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              El stock se devolvera al inventario. Indica el motivo para que quede en bitacora.
            </p>

            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder="Ej. Comprobante no coincide con el monto."
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="mt-5 flex gap-2">
              <button
                onClick={cerrarModalRechazo}
                disabled={accionEnCurso === ventaARechazar.id_venta}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRechazo}
                disabled={accionEnCurso === ventaARechazar.id_venta}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {accionEnCurso === ventaARechazar.id_venta ? 'Procesando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PedidoDetalleModal
        venta={pedidoDetalle}
        open={Boolean(pedidoDetalle)}
        onClose={() => setPedidoDetalle(null)}
      />
    </section>
  );
}
