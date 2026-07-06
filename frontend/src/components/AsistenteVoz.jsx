import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

const ASISTENTE_URL = '/api/reportes/asistente/';
const VENTAS_HOY_URL = '/api/reportes/ventas-hoy/';
const CONSULTA_VOZ_URL = '/api/reportes/consulta-voz/';
const KPIS_URL = '/api/reportes/kpis/';
const TOP_URL = '/api/reportes/productos-top/';
const ALERTAS_URL = '/api/reportes/alertas-predictivas/';
const CLIENTES_URL = '/api/reportes/clientes-frecuentes/';

const COMANDOS_AYUDA = [
  'cuanto vendimos hoy',
  'cuantos usuarios y roles hay',
  'ultimas compras a proveedores',
  'que paso en la bitacora',
  'stock de [producto]',
  'productos mas vendidos',
  'pedidos pendientes',
  'alertas de stock',
  'abrir dashboard',
];

function hablar(texto) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = 'es-BO';
  window.speechSynthesis.speak(utter);
}

function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

async function interpretarComando(texto, onNavigate, historial = []) {
  const t = normalizar(texto);

  try {
    const { data } = await api.post(ASISTENTE_URL, { mensaje: texto, historial });
    if (data?.navegar) {
      onNavigate?.(data.navegar);
    }
    if (data?.respuesta) {
      return data.respuesta;
    }
  } catch (err) {
    const usarFallback = err?.response?.status === 503 || err?.response?.data?.usar_fallback;
    if (!usarFallback) {
      throw err;
    }
  }

  return interpretarComandoReglas(t, onNavigate);
}

async function interpretarComandoReglas(t, onNavigate) {
  if (t.includes('abrir caja') || t.includes('ir a caja')) {
    onNavigate?.('caja');
    return 'Abriendo el modulo de caja.';
  }
  if (t.includes('ventas de hoy') || t.includes('cuanto vendimos hoy') || t.includes('cuanto vendimos')) {
    const { data } = await api.get(VENTAS_HOY_URL);
    return data.mensaje || `Ventas de hoy: ${data.monto_total}`;
  }
  if (t.includes('productos mas vendidos') || t.includes('productos top')) {
    const { data } = await api.get(TOP_URL, { params: { periodo: 'mes', criterio: 'unidades' } });
    const top = (data.items || []).slice(0, 3).map((i) => i.nombre).join(', ');
    onNavigate?.('productos_top');
    return top ? `Los productos mas vendidos del mes son: ${top}.` : 'No hay ventas registradas este mes.';
  }
  if (t.includes('clientes top') || t.includes('clientes frecuentes')) {
    const { data } = await api.get(CLIENTES_URL, { params: { dias: 90 } });
    const tops = (data.items || []).filter((c) => c.es_top || c.categoria === 'TOP').slice(0, 3).map((c) => c.nombre_completo).join(', ');
    onNavigate?.('clientes_frecuentes');
    return tops ? `Clientes TOP: ${tops}.` : 'Aun no hay clientes TOP en el periodo.';
  }
  if (t.includes('alertas') || t.includes('stock bajo')) {
    const { data } = await api.get(ALERTAS_URL, { params: { umbral_dias: 7 } });
    const n = (data.items || []).filter((a) => !a.atendida).length;
    const { data: kpis } = await api.get(KPIS_URL, { params: { periodo: 'hoy' } });
    onNavigate?.('alertas_predictivas');
    return `Hay ${n} alertas predictivas y ${kpis.alertas_stock} productos bajo el minimo.`;
  }

  const matchStock = t.match(/stock de (.+)/) || t.match(/cuanto hay de (.+)/);
  if (matchStock) {
    const producto = matchStock[1].trim();
    const { data } = await api.get(CONSULTA_VOZ_URL, { params: { producto } });
    return data.mensaje || 'No encontre ese producto.';
  }

  return `No entendi el comando. Prueba: ${COMANDOS_AYUDA.slice(0, 4).join(', ')}.`;
}

export default function AsistenteVoz({ onNavigate, allowed = true }) {
  const [abierto, setAbierto] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [error, setError] = useState('');
  const [historial, setHistorial] = useState([]);
  const historialRef = useRef([]);
  const recognitionRef = useRef(null);

  const soportado = typeof window !== 'undefined'
    && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!soportado || !allowed) return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-BO';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const texto = event.results[0][0].transcript;
      setTranscripcion(texto);
      setEscuchando(false);
      try {
        const mensaje = await interpretarComando(texto, onNavigate, historialRef.current);
        setRespuesta(mensaje);
        historialRef.current = [
          ...historialRef.current.slice(-5),
          { role: 'user', text: texto },
          { role: 'assistant', text: mensaje },
        ];
        setHistorial(historialRef.current);
        hablar(mensaje);
      } catch (err) {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        let msg = 'No pude completar la consulta. Intenta de nuevo.';

        if (status === 403 && detail && !String(detail).toLowerCase().includes('token')) {
          msg = detail || 'No tienes permiso para usar el asistente de voz.';
        } else if (status === 403 || status === 401) {
          msg = 'Tu sesion expiro. Cierra sesion e ingresa de nuevo.';
        } else if (!err?.response) {
          msg = 'Sin conexion con el servidor. Verifica que el backend este en marcha.';
        } else if (status === 503) {
          msg = 'Gemini no disponible; probando respuesta local...';
        }

        setError(msg);
        hablar(msg);
      }
    };

    recognition.onerror = () => {
      setEscuchando(false);
      setError('No se pudo capturar el audio. Repite el comando o revisa el microfono.');
    };

    recognition.onend = () => setEscuchando(false);
    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [soportado, allowed, onNavigate]);

  const iniciarEscucha = () => {
    setError('');
    setRespuesta('');
    if (!soportado) {
      setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }
    try {
      setEscuchando(true);
      recognitionRef.current?.start();
    } catch {
      setEscuchando(false);
      setError('El microfono esta ocupado o sin permiso.');
    }
  };

  if (!allowed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-2xl text-white shadow-2xl ring-4 ring-violet-300/40 hover:bg-violet-500"
        title="Asistente de voz (CU24)"
      >
        🎤
      </button>

      {abierto && (
        <div className="fixed bottom-24 right-6 z-50 w-[min(100vw-2rem,360px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Asistente Trendify</h3>
            <button type="button" onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-600">X</button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Gemini AI + voz del navegador (Chrome/Edge).
          </p>

          {!soportado && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Navegador no compatible con reconocimiento de voz.</p>
          )}

          <button
            type="button"
            onClick={iniciarEscucha}
            disabled={escuchando || !soportado}
            className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {escuchando ? 'Escuchando...' : 'Presiona y habla'}
          </button>

          {transcripcion && <p className="mt-3 text-sm"><span className="font-semibold">Tu dijiste:</span> {transcripcion}</p>}
          {respuesta && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{respuesta}</p>}
          {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">Comandos disponibles</summary>
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-600">
              {COMANDOS_AYUDA.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
