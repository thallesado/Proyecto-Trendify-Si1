import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Login from './Login';
import ProductoImagen from './ProductoImagen';
import ProductoDetalleModal from './ProductoDetalleModal';
import SelectDepartamento from './SelectDepartamento';
import UserAvatar from './UserAvatar';
import { buildReciboUrl, sanitizeTelefono } from '../utils/formHelpers';

const PUBLIC_PRODUCTOS_URL = '/api/public/productos/';
const PUBLIC_CATEGORIAS_URL = '/api/public/categorias/';
const PUBLIC_MARCAS_URL = '/api/public/marcas/';
const PUBLIC_CHECKOUT_URL = '/api/public/checkout/';
const MIS_PEDIDOS_URL = '/api/mis-pedidos/';
const MI_PERFIL_URL = '/api/mi-perfil-cliente/';
const PEDIDOS_GUARDADOS_URL = '/api/pedidos-guardados/';
const REGISTRO_URL = '/api/auth/registro/';
const CARRITO_STORAGE_KEY = 'trendify.carrito.publico';
const MIS_FAVORITOS_URL = '/api/mis-favoritos/';

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function currency(value) {
  return Number(value || 0).toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  });
}

function formatearFecha(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function stockDisponible(producto) {
  return Math.max(0, Number(producto?.stock_actual ?? 0));
}

function badgeEstadoPedido(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'completada') return 'bg-emerald-100 text-emerald-700';
  if (e === 'rechazada') return 'bg-red-100 text-red-700';
  if (e === 'pendiente_validacion') return 'bg-amber-100 text-amber-800';
  if (e === 'pendiente_verificacion') return 'bg-orange-100 text-orange-800';
  return 'bg-slate-100 text-slate-700';
}

function labelEstadoPedido(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'completada') return 'Completada';
  if (e === 'rechazada') return 'Rechazada';
  if (e === 'pendiente_validacion') return 'Pendiente de validacion';
  if (e === 'pendiente_verificacion') return 'Pago por verificar';
  return estado || 'Desconocido';
}

export default function TiendaPublica({ onAccesoPersonal, user, logout, isAuthenticated }) {
  const { establishSession } = useAuth();

  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [favoritoIds, setFavoritoIds] = useState(() => new Set());
  const [cargandoFavoritos, setCargandoFavoritos] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('all');
  const [filtroMarca, setFiltroMarca] = useState('all');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [ordenCatalogo, setOrdenCatalogo] = useState('nombre_asc');
  const favoritosRef = useRef(null);

  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [errorCatalogo, setErrorCatalogo] = useState('');

  const [carrito, setCarrito] = useState([]);
  const [openCheckout, setOpenCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('carrito');
  const [pedidosGuardados, setPedidosGuardados] = useState([]);
  const [cargandoPedidosGuardados, setCargandoPedidosGuardados] = useState(false);
  const [pedidoGuardadoError, setPedidoGuardadoError] = useState('');
  const [mostrarGuardarPedido, setMostrarGuardarPedido] = useState(false);
  const [nombrePedidoGuardado, setNombrePedidoGuardado] = useState('');
  
  const [menuAbierto, setMenuAbierto] = useState(false);

  const isClienteAutenticado = isAuthenticated && user && Number(user?.id_rol?.id_rol || user?.id_rol) === 6;

  const [cliente, setCliente] = useState({
    nombre: '',
    telefono: '',
    ciudad: '',
    direccion: '',
  });
  const [metodoPago, setMetodoPago] = useState('qr');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [imagenComprobanteUrl, setImagenComprobanteUrl] = useState('');
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState('');

  // Modales
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [mostrarMisPedidos, setMostrarMisPedidos] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState(null);
  const [ultimaVentaId, setUltimaVentaId] = useState(null);
  
  const [misPedidos, setMisPedidos] = useState([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  const [registroForm, setRegistroForm] = useState({
      username: '', password: '', password_confirm: '', nombre_completo: '', telefono: '', ciudad: '', direccion: ''
  });
  const [aceptarTerminos, setAceptarTerminos] = useState(false);
  const [registroError, setRegistroError] = useState('');
  const [registroSuccess, setRegistroSuccess] = useState(false);

  // Toast simple para feedback de "agregado al carrito" y similares.
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimerRef = useRef(null);

  const mostrarToast = (mensaje) => {
    setToast({ visible: true, message: mensaje });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeState = params.get('stripe');
    const ventaId = params.get('venta_id');
    if (!stripeState) return;

    if (stripeState === 'success') {
      setUltimaVentaId(ventaId || null);
      setCheckoutSuccess(
        ventaId
          ? `Pago confirmado en Stripe para pedido #${ventaId}.`
          : 'Pago confirmado en Stripe.'
      );
      setCarrito([]);
      setNumeroComprobante('');
      setMetodoPago('qr');
    } else if (stripeState === 'cancel') {
      setCheckoutError(
        ventaId
          ? `Pago cancelado para pedido #${ventaId}. Puedes volver a intentarlo.`
          : 'Pago cancelado. Puedes volver a intentarlo.'
      );
    }

    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const itemsCount = useMemo(
    () => carrito.reduce((acc, item) => acc + item.cantidad, 0),
    [carrito]
  );

  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.precio_venta) * item.cantidad, 0),
    [carrito]
  );

  const productosFavoritos = useMemo(() => {
    return productos.filter((producto) => favoritoIds.has(Number(producto.id_producto ?? producto.id)));
  }, [productos, favoritoIds]);

  const productosFiltrados = useMemo(() => {
    return [...productos].sort((a, b) => {
      const nombreA = String(a.nombre || '');
      const nombreB = String(b.nombre || '');
      const precioA = Number(a.precio_venta || 0);
      const precioB = Number(b.precio_venta || 0);

      if (ordenCatalogo === 'nombre_desc') {
        return nombreB.localeCompare(nombreA, 'es', { sensitivity: 'base' });
      }
      if (ordenCatalogo === 'precio_asc') {
        return precioA - precioB;
      }
      if (ordenCatalogo === 'precio_desc') {
        return precioB - precioA;
      }
      return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    });
  }, [productos, ordenCatalogo]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CARRITO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCarrito(parsed);
    } catch (error) {
      console.warn('No se pudo restaurar el carrito local:', error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CARRITO_STORAGE_KEY, JSON.stringify(carrito));
  }, [carrito]);

  useEffect(() => {
    let active = true;
    async function loadCatalogo() {
      setLoadingCatalogo(true);
      setErrorCatalogo('');
      try {
        const params = { page_size: 200 };
        if (filtroCategoria !== 'all') params.id_categoria = filtroCategoria;
        if (filtroMarca !== 'all') params.id_marca = filtroMarca;
        if (busqueda.trim()) params.q = busqueda.trim();
        if (precioMin !== '') params.precio_min = precioMin;
        if (precioMax !== '') params.precio_max = precioMax;

        const [resCategorias, resMarcas, resProductos] = await Promise.all([
          api.get(PUBLIC_CATEGORIAS_URL),
          api.get(PUBLIC_MARCAS_URL),
          api.get(PUBLIC_PRODUCTOS_URL, { params }),
        ]);
        if (!active) return;
        setCategorias(normalizeList(resCategorias.data));
        setMarcas(normalizeList(resMarcas.data));
        setProductos(normalizeList(resProductos.data));

      } catch (error) {
        if (active) setErrorCatalogo('No se pudo cargar la tienda. Verifica backend.');
      } finally {
        if (active) setLoadingCatalogo(false);
      }
    }
    const timer = setTimeout(loadCatalogo, busqueda.trim() ? 350 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filtroCategoria, filtroMarca, busqueda, precioMin, precioMax]);
  
  useEffect(() => {
    if (!isClienteAutenticado) {
      setFavoritoIds(new Set());
      return;
    }
    cargarFavoritos();
  }, [isClienteAutenticado]);

  useEffect(() => {
    if (!isClienteAutenticado) return;

    let active = true;
    async function cargarPerfil() {
      try {
        const { data } = await api.get(MI_PERFIL_URL);
        if (!active || !data) return;
        setCliente({
          nombre: data.nombre_completo || '',
          telefono: data.telefono || '',
          ciudad: data.ciudad || '',
          direccion: data.direccion || '',
        });
      } catch (error) {
        console.error('Error cargando perfil cliente', error);
      }
    }
    cargarPerfil();
    return () => { active = false; };
  }, [isClienteAutenticado]);

  useEffect(() => {
     if (isClienteAutenticado && mostrarMisPedidos) {
         cargarMisPedidos();
     }
  }, [isClienteAutenticado, mostrarMisPedidos]);

  useEffect(() => {
    if (isClienteAutenticado && openCheckout) {
      cargarPedidosGuardados();
    }
  }, [isClienteAutenticado, openCheckout]);

  const cargarFavoritos = async () => {
    setCargandoFavoritos(true);
    try {
      const res = await api.get(MIS_FAVORITOS_URL);
      const ids = normalizeList(res.data)
        .map((favorito) => Number(favorito.id_producto?.id_producto ?? favorito.id_producto))
        .filter(Number.isFinite);
      setFavoritoIds(new Set(ids));
    } catch (error) {
      console.warn('No se pudieron cargar los favoritos:', error);
      setFavoritoIds(new Set());
    } finally {
      setCargandoFavoritos(false);
    }
  };

  const scrollToFavoritos = () => {
    favoritosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuAbierto(false);
  };

  const toggleFavorito = async (producto) => {
    if (!isClienteAutenticado) {
      mostrarToast('Inicia sesion como cliente para guardar favoritos');
      setMostrarLogin(true);
      return;
    }

    const idProducto = Number(producto.id_producto ?? producto.id);
    if (!Number.isFinite(idProducto)) return;

    const yaEsFavorito = favoritoIds.has(idProducto);
    setFavoritoIds((prev) => {
      const next = new Set(prev);
      if (yaEsFavorito) next.delete(idProducto);
      else next.add(idProducto);
      return next;
    });

    try {
      if (yaEsFavorito) {
        await api.delete(MIS_FAVORITOS_URL, { data: { id_producto: idProducto } });
        mostrarToast('Producto quitado de favoritos');
      } else {
        await api.post(MIS_FAVORITOS_URL, { id_producto: idProducto });
        mostrarToast('Producto agregado a favoritos');
      }
    } catch (error) {
      setFavoritoIds((prev) => {
        const next = new Set(prev);
        if (yaEsFavorito) next.add(idProducto);
        else next.delete(idProducto);
        return next;
      });
      mostrarToast(error?.response?.data?.detail || 'No se pudo actualizar favoritos');
    }
  };

  const cargarMisPedidos = async () => {
      setCargandoPedidos(true);
      try {
          const res = await api.get(MIS_PEDIDOS_URL);
          setMisPedidos(normalizeList(res.data));
      } catch(e) {
          console.error('Error cargando pedidos', e);
      } finally {
          setCargandoPedidos(false);
      }
  };

  const cargarPedidosGuardados = async () => {
      setCargandoPedidosGuardados(true);
      setPedidoGuardadoError('');
      try {
          const res = await api.get(PEDIDOS_GUARDADOS_URL);
          setPedidosGuardados(normalizeList(res.data));
      } catch(e) {
          console.error('Error cargando pedidos guardados', e);
          setPedidoGuardadoError('No se pudieron cargar tus pedidos guardados.');
      } finally {
          setCargandoPedidosGuardados(false);
      }
  };

  const abrirGuardarPedido = () => {
    setPedidoGuardadoError('');
    if (!isClienteAutenticado) {
      setOpenCheckout(false);
      setMostrarLogin(true);
      return;
    }
    if (carrito.length === 0) {
      setPedidoGuardadoError('Agrega productos antes de guardar un pedido.');
      return;
    }
    setNombrePedidoGuardado('');
    setMostrarGuardarPedido(true);
  };

  const guardarPedidoActual = async () => {
    const nombre = nombrePedidoGuardado.trim();
    if (!nombre) {
      setPedidoGuardadoError('Ingresa un nombre para guardar el pedido.');
      return;
    }

    setPedidoGuardadoError('');
    try {
      const payload = {
        nombre,
        carrito: carrito.map((item) => ({
          id_producto: item.id_producto,
          cantidad: item.cantidad,
        })),
      };
      await api.post(PEDIDOS_GUARDADOS_URL, payload);
      setMostrarGuardarPedido(false);
      setNombrePedidoGuardado('');
      mostrarToast(`Pedido "${nombre}" guardado`);
      cargarPedidosGuardados();
    } catch (error) {
      setPedidoGuardadoError(error?.response?.data?.detail || 'No se pudo guardar el pedido.');
    }
  };

  const cargarPedidoGuardadoAlCarrito = (pedido) => {
    const items = (pedido.detalles_pedido_guardado || [])
      .map((detalle) => {
        const producto = detalle.producto;
        if (!producto) return null;
        return {
          ...producto,
          id_producto: Number(producto.id_producto ?? detalle.id_producto),
          cantidad: Number(detalle.cantidad || 1),
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      setPedidoGuardadoError('Este pedido guardado no tiene productos disponibles.');
      return;
    }

    setCarrito(items);
    setCheckoutStep('carrito');
    setPedidoGuardadoError('');
    mostrarToast(`Pedido "${pedido.nombre}" cargado al carrito`);
  };

  const eliminarPedidoGuardado = async (idPedido) => {
    setPedidoGuardadoError('');
    try {
      await api.delete(`${PEDIDOS_GUARDADOS_URL}${idPedido}/`);
      setPedidosGuardados((prev) => prev.filter((pedido) => pedido.id_pedido_guardado !== idPedido));
      mostrarToast('Pedido guardado eliminado');
    } catch (error) {
      setPedidoGuardadoError(error?.response?.data?.detail || 'No se pudo eliminar el pedido guardado.');
    }
  };

  const addToCart = (producto) => {
    setCheckoutError('');
    setCheckoutSuccess('');
    const id = Number(producto.id_producto ?? producto.id);
    const stock = stockDisponible(producto);
    if (stock <= 0) {
      mostrarToast('Producto sin stock disponible');
      return;
    }

    setCarrito((prev) => {
      const exists = prev.find((item) => item.id_producto === id);
      const cantidadActual = exists ? exists.cantidad : 0;
      if (cantidadActual + 1 > stock) {
        mostrarToast(`Solo hay ${stock} unidad(es) disponibles`);
        return prev;
      }
      if (!exists) {
        return [...prev, { ...producto, id_producto: id, cantidad: 1 }];
      }
      return prev.map((item) =>
        item.id_producto === id ? { ...item, cantidad: item.cantidad + 1, stock_actual: stock } : item
      );
    });
    mostrarToast(`✓ ${producto.nombre} anadido al carrito`);
  };

  const removeFromCart = (idProducto) => {
    setCarrito((prev) => prev.filter((item) => item.id_producto !== idProducto));
  };

  const vaciarCarrito = () => {
    setCarrito([]);
    mostrarToast('Carrito vaciado');
  };

  const updateQty = (idProducto, qty) => {
    if (qty <= 0) {
      removeFromCart(idProducto);
      return;
    }
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id_producto !== idProducto) return item;
        const stock = stockDisponible(item);
        const cantidadFinal = Math.min(qty, stock > 0 ? stock : qty);
        if (stock > 0 && qty > stock) {
          mostrarToast(`Maximo disponible: ${stock}`);
        }
        return { ...item, cantidad: cantidadFinal };
      })
    );
  };

  const solicitarLoginParaCheckout = () => {
    setCheckoutError('Debes iniciar sesion como cliente para confirmar tu pedido.');
    setMostrarLogin(true);
  };

  const irAPago = () => {
    if (!isClienteAutenticado) {
      solicitarLoginParaCheckout();
      return;
    }
    setCheckoutStep('checkout');
    setCheckoutError('');
  };

  const openCartDrawer = () => {
    setOpenCheckout(true);
    setCheckoutStep('carrito');
    setCheckoutError('');
  };

  const handleClienteChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'telefono' ? sanitizeTelefono(value) : value;
    setCliente((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleRegistroChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'telefono' ? sanitizeTelefono(value) : value;
    setRegistroForm((prev) => ({ ...prev, [name]: nextValue }));
  };

  const requiereComprobante = metodoPago === 'qr' || metodoPago === 'transferencia';

  const confirmarPago = async () => {
    setCheckoutError('');
    setCheckoutSuccess('');

    if (!isClienteAutenticado) {
      solicitarLoginParaCheckout();
      return;
    }

    if (!cliente.nombre.trim() || !cliente.telefono.trim() || !cliente.ciudad.trim() || !cliente.direccion.trim()) {
      setCheckoutError('Completa todos los datos de envio.');
      return;
    }

    if (carrito.length === 0) {
      setCheckoutError('El carrito esta vacio.');
      return;
    }

    if (requiereComprobante && !numeroComprobante.trim()) {
      setCheckoutError('Ingresa el numero de comprobante de tu pago.');
      return;
    }

    setSubmittingCheckout(true);
    try {
      const idempotencyKey = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `chk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        cliente: {
          nombre: cliente.nombre.trim(),
          telefono: cliente.telefono.trim(),
          ciudad: cliente.ciudad.trim(),
          direccion: cliente.direccion.trim(),
        },
        metodo_pago: metodoPago,
        numero_comprobante: requiereComprobante ? numeroComprobante.trim() : '',
        imagen_qr_url: imagenComprobanteUrl.trim(),
        carrito: carrito.map((item) => ({
          id_producto: item.id_producto,
          cantidad: item.cantidad,
        })),
      };

      const { data } = await api.post(PUBLIC_CHECKOUT_URL, payload, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      setCheckoutSuccess(
        `Pedido #${data.id_venta} registrado. Esta pendiente de validacion por el equipo.`
      );
      setUltimaVentaId(data.id_venta || null);
      setCarrito([]);
      window.localStorage.removeItem(CARRITO_STORAGE_KEY);
      setNumeroComprobante('');
      setImagenComprobanteUrl('');
      setMetodoPago('qr');
      setCheckoutStep('carrito');
      setOpenCheckout(false);
    } catch (error) {
      setCheckoutError(error?.response?.data?.detail || 'No se pudo confirmar el pago.');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleRegistroSubmit = async (e) => {
      e.preventDefault();
      setRegistroError('');
      setRegistroSuccess(false);

      if (registroForm.password !== registroForm.password_confirm) {
        setRegistroError('Las contrasenas no coinciden.');
        return;
      }
      if (!aceptarTerminos) {
        setRegistroError('Debes aceptar los terminos y condiciones.');
        return;
      }
      if (!registroForm.telefono.trim() || !registroForm.ciudad.trim() || !registroForm.direccion.trim()) {
        setRegistroError('Telefono, ciudad y direccion son obligatorios.');
        return;
      }

      try {
          const { data } = await api.post(REGISTRO_URL, registroForm);
          const sessionResult = establishSession(data);
          if (!sessionResult.ok) {
            setRegistroError(sessionResult.message || 'Registro ok, pero no se pudo iniciar sesion.');
            return;
          }
          setRegistroSuccess(true);
          setCliente({
            nombre: registroForm.nombre_completo,
            telefono: registroForm.telefono,
            ciudad: registroForm.ciudad,
            direccion: registroForm.direccion,
          });
          setMostrarRegistro(false);
          mostrarToast('Cuenta creada. Bienvenido a Trendify!');
      } catch(err) {
          const detail = err?.response?.data?.detail;
          const fieldErrors = err?.response?.data;
          if (typeof detail === 'string') {
            setRegistroError(detail);
          } else if (fieldErrors && typeof fieldErrors === 'object') {
            const first = Object.values(fieldErrors).flat()[0];
            setRegistroError(first || 'Ocurrio un error en el registro.');
          } else {
            setRegistroError('Ocurrio un error en el registro.');
          }
      }
  };

  return (
    <div className="min-h-screen relative bg-[radial-gradient(circle_at_10%_5%,rgba(190,242,100,0.2),transparent_30%),radial-gradient(circle_at_85%_12%,rgba(249,168,212,0.2),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#fefce8_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-[1300px] flex-wrap items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-fuchsia-600">Trendify</p>
            <h1 className="text-xl font-black leading-tight text-slate-900 sm:text-2xl">Cosmetics Store</h1>
          </div>
          
          <div className="flex sm:hidden mt-2 ml-auto gap-2">
            <button onClick={scrollToFavoritos} className="relative rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              ★ ({favoritoIds.size})
            </button>
            <button onClick={openCartDrawer} className="relative rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
              Carrito ({itemsCount})
            </button>
            <button onClick={() => setMenuAbierto(!menuAbierto)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">⚡ Menu</button>
          </div>

          <div className={`mt-3 w-full sm:mt-0 sm:flex sm:w-auto items-center gap-2 sm:gap-3 ${menuAbierto ? "block" : "hidden sm:flex"}`}>
            {isClienteAutenticado ? (
                <>
                <span className="hidden lg:inline-flex items-center gap-2 font-semibold text-sm text-fuchsia-700">
                  <UserAvatar username={user?.username} size="sm" />
                  Hola, {user?.username}
                </span>
                <button type="button" onClick={() => { setMostrarMisPedidos(true); setMenuAbierto(false); }} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 w-full sm:w-auto mt-2 sm:mt-0">Mis Pedidos / Recibos</button>
                <button type="button" onClick={() => { logout(); setMenuAbierto(false); }} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 w-full sm:w-auto mt-2 sm:mt-0">Salir</button>
                </>
            ) : isAuthenticated ? (
                <>
                <button type="button" onClick={onAccesoPersonal} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 w-full sm:w-auto mt-2 sm:mt-0">Ir al Panel</button>
                <button type="button" onClick={logout} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 w-full sm:w-auto mt-2 sm:mt-0">Salir</button>
                </>
            ) : (
                <>
                <button type="button" onClick={() => { setMostrarRegistro(true); setMenuAbierto(false); }} className="rounded-full bg-fuchsia-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-fuchsia-500 w-full sm:w-auto mt-2 sm:mt-0">Registrarse</button>
                <button type="button" onClick={() => { setMostrarLogin(true); setMenuAbierto(false); }} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 w-full sm:w-auto mt-2 sm:mt-0">Iniciar Sesion</button>
                <button type="button" onClick={onAccesoPersonal} className="rounded-full hidden lg:inline border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100 w-full sm:w-auto mt-2 sm:mt-0">Staff</button>
                </>
            )}

            <button type="button" onClick={scrollToFavoritos} className="hidden sm:inline-flex relative rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
              Favoritos
              <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900">{favoritoIds.size}</span>
            </button>
            <button type="button" onClick={openCartDrawer} className="hidden sm:inline-flex relative rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Carrito
              <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-xs font-bold text-white">{itemsCount}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1300px] gap-6 px-4 pb-4 pt-6 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-10">
        <article className="rounded-3xl bg-slate-900 p-6 text-white shadow-2xl sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-lime-300">Nueva Coleccion</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black leading-[1.05] sm:text-4xl lg:text-5xl">Maquillaje premium.</h2>
          <p className="mt-4 max-w-lg text-sm text-slate-200 sm:text-base">Registrate para comprar, guardar tu carrito y ver tu historial de pedidos.</p>
          <button type="button" onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })} className="mt-7 rounded-xl bg-lime-300 px-5 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-lime-200 w-full sm:w-auto">
            Ver Catalogo
          </button>
        </article>

        <article className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-100 via-rose-50 to-violet-100 p-6 shadow-sm sm:p-8">
          <h3 className="mt-2 text-2xl font-black text-slate-900">Online y Seguro</h3>
          <p className="mt-3 text-sm text-slate-700">Crea tu cuenta de cliente para confirmar pedidos con pago QR o transferencia.</p>
          <div className="mt-5 grid grid-cols-2 lg:grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-white/75 px-3 py-3 shadow-sm"><p className="text-lg font-black text-slate-900">24h</p><p className="text-xs text-slate-600">Despacho</p></div>
            <div className="rounded-xl bg-white/75 px-3 py-3 shadow-sm"><p className="text-lg font-black text-slate-900">QR</p><p className="text-xs text-slate-600">Pago movil</p></div>
          </div>
        </article>
      </section>

      <main className="mx-auto w-full max-w-[1300px] px-4 pb-16 sm:px-6">
        {isClienteAutenticado && (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-sky-900">Tus compras y facturas</p>
              <p className="mt-1 text-sm text-sky-800">
                Aqui puedes ver tu historial y descargar el recibo cuando tu pedido este confirmado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarMisPedidos(true)}
              className="shrink-0 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
            >
              Ver Mis Pedidos / Recibos
            </button>
          </div>
        )}

        {checkoutSuccess && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <p>{checkoutSuccess}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setMostrarMisPedidos(true)}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                Ir a Mis Pedidos / Recibos
              </button>
              {ultimaVentaId && (
                <>
                  <a
                    href={buildReciboUrl(ultimaVentaId, 'html')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    Ver recibo (HTML)
                  </a>
                  <a
                    href={buildReciboUrl(ultimaVentaId, 'pdf')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                  >
                    Descargar PDF
                  </a>
                </>
              )}
            </div>
            {ultimaVentaId && (
              <p className="mt-2 text-xs text-emerald-800">
                Si el pedido aun esta pendiente de validacion, el recibo se habilitara cuando el equipo lo confirme.
                Siempre quedara guardado en <strong>Mis Pedidos / Recibos</strong>.
              </p>
            )}
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Categorias</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFiltroCategoria('all')} className={['whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition', filtroCategoria === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'].join(' ')}>Todas</button>
              {categorias.map((cat) => (
                <button key={cat.id_categoria} onClick={() => setFiltroCategoria(String(cat.id_categoria))} className={['whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition', String(filtroCategoria) === String(cat.id_categoria) ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'].join(' ')}>{cat.nombre}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Filtros</p>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_minmax(160px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(180px,1fr)]">
            <label className="relative block sm:col-span-2 lg:col-span-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
                  <circle cx="11" cy="11" r="7" />
                </svg>
              </span>
              <input
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por nombre, marca o categoria"
                className="h-10 w-full rounded-full border border-slate-300 bg-white pl-9 pr-4 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
              />
            </label>

            <select
              value={filtroMarca}
              onChange={(event) => setFiltroMarca(event.target.value)}
              className="h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
            >
              <option value="all">Todas las marcas</option>
              {marcas.map((marca) => (
                <option key={marca.id_marca} value={String(marca.id_marca)}>{marca.nombre}</option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              value={precioMin}
              onChange={(event) => setPrecioMin(event.target.value)}
              placeholder="Precio min"
              className="h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
            />

            <input
              type="number"
              min="0"
              value={precioMax}
              onChange={(event) => setPrecioMax(event.target.value)}
              placeholder="Precio max"
              className="h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
            />

            <select
              value={ordenCatalogo}
              onChange={(event) => setOrdenCatalogo(event.target.value)}
              className="h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
            >
              <option value="nombre_asc">Nombre A-Z</option>
              <option value="nombre_desc">Nombre Z-A</option>
              <option value="precio_asc">Precio menor</option>
              <option value="precio_desc">Precio mayor</option>
            </select>
            </div>
          </div>
        </div>

        {loadingCatalogo ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/50" />)}
          </div>
        ) : (
          productosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm font-bold text-slate-700">No se encontraron productos.</p>
            <p className="mt-1 text-sm text-slate-500">Prueba con otro nombre o categoria.</p>
          </div>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {productosFiltrados.map((producto) => (
                <article key={producto.id_producto} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg flex flex-row sm:flex-col items-center sm:items-stretch">
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); toggleFavorito(producto); }}
                    className={`absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center text-amber-400 drop-shadow-[0_2px_6px_rgba(15,23,42,0.35)] transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${favoritoIds.has(Number(producto.id_producto ?? producto.id)) ? 'text-amber-400' : 'text-white hover:text-amber-300'}`}
                    aria-pressed={favoritoIds.has(Number(producto.id_producto ?? producto.id))}
                    aria-label={favoritoIds.has(Number(producto.id_producto ?? producto.id)) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    title={favoritoIds.has(Number(producto.id_producto ?? producto.id)) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  >
                    <Star
                      size={34}
                      strokeWidth={2.4}
                      fill={favoritoIds.has(Number(producto.id_producto ?? producto.id)) ? 'currentColor' : 'rgba(255,255,255,0.72)'}
                      className="text-[34px] transition"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductoDetalle(producto)}
                    className="w-1/3 sm:w-full shrink-0 text-left"
                  >
                    <ProductoImagen
                      idProducto={producto.id_producto}
                      nombre={producto.nombre}
                      imagenSrc={producto.atributos?.imagen_data_uri}
                      className="w-full h-28 sm:h-40"
                    />
                  </button>
                  <div className="w-2/3 sm:w-full p-4 flex flex-col justify-between h-full">
                    <div>
                      <button
                        type="button"
                        onClick={() => setProductoDetalle(producto)}
                        className="text-left"
                      >
                        <h4 className="line-clamp-2 text-sm sm:text-base font-bold text-slate-900 hover:text-fuchsia-700">{producto.nombre}</h4>
                      </button>
                      <p className="mt-1 text-base sm:text-lg font-black text-slate-900">{currency(producto.precio_venta)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Stock: {stockDisponible(producto)}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setProductoDetalle(producto)}
                        className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Ver detalle
                      </button>
                      <button onClick={() => addToCart(producto)} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-slate-800">Comprar</button>
                    </div>
                  </div>
                </article>
            ))}
          </div>
        )
        )}

        <section ref={favoritosRef} className="scroll-mt-28 rounded-3xl border border-amber-200 bg-white/90 p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-600">Seleccion del cliente</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900">Mis Favoritos</h3>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{favoritoIds.size} producto(s)</span>
          </div>

          {!isClienteAutenticado ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Inicia sesion como cliente para guardar tus productos favoritos.</p>
              <button type="button" onClick={() => setMostrarLogin(true)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Iniciar sesion</button>
            </div>
          ) : cargandoFavoritos ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-amber-50" />)}
            </div>
          ) : productosFavoritos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-5 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Todavia no tienes productos favoritos.</p>
              <p className="mt-1 text-sm text-slate-500">Presiona la estrella de un producto para guardarlo aqui.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {productosFavoritos.map((producto) => (
                <article key={producto.id_producto} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <ProductoImagen
                    idProducto={producto.id_producto}
                    nombre={producto.nombre}
                    imagenSrc={producto.atributos?.imagen_data_uri}
                    className="h-20 w-20 shrink-0 rounded-xl border border-slate-200"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 text-sm font-black text-slate-900">{producto.nombre}</h4>
                    <p className="mt-1 text-sm font-bold text-slate-700">{currency(producto.precio_venta)}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => addToCart(producto)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Comprar</button>
                      <button type="button" onClick={() => toggleFavorito(producto)} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50">Quitar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL MIS PEDIDOS */}
      {mostrarMisPedidos && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-3xl bg-white rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex justify-between items-start gap-3">
                      <div>
                        <h3 className="text-2xl font-black">Mis Pedidos y Recibos</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Historial de compras. La factura PDF/HTML aparece cuando el pedido esta confirmado.
                        </p>
                      </div>
                      <button onClick={() => setMostrarMisPedidos(false)} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50">X</button>
                  </div>
                  {cargandoPedidos ? <p className="mt-5">Cargando tus compras...</p> : (
                      <div className="mt-5 space-y-4">
                          {misPedidos.length === 0 ? <p className="text-slate-500">Aun no tienes pedidos registrados.</p> : misPedidos.map(pedido => {
                            const completada = (pedido.estado_venta || '').toLowerCase() === 'completada';
                            return (
                              <div key={pedido.id_venta} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                  <div className="flex flex-wrap justify-between gap-2 font-bold border-b pb-2">
                                      <span>Pedido #{pedido.id_venta}</span>
                                      <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeEstadoPedido(pedido.estado_venta)}`}>
                                          {labelEstadoPedido(pedido.estado_venta)}
                                        </span>
                                        <span className="text-indigo-600">{currency(pedido.monto_total)}</span>
                                      </div>
                                  </div>
                                  <p className="text-xs mt-2 text-slate-600">Fecha: {formatearFecha(pedido.fecha_hora)} | Pago: {pedido.metodo_pago}</p>
                                  <ul className="mt-2 space-y-1">
                                      {pedido.detalles_venta?.map(det => (
                                          <li key={det.id_detalle_venta} className="text-sm flex justify-between">
                                              <span>{det.cantidad}x {det.producto_nombre}</span>
                                              <span>{currency(det.subtotal)}</span>
                                          </li>
                                      ))}
                                  </ul>
                                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Factura / Recibo</p>
                                    {completada ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <a href={buildReciboUrl(pedido.id_venta, 'html')} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Ver recibo HTML</a>
                                        <a href={buildReciboUrl(pedido.id_venta, 'pdf')} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700">Descargar PDF</a>
                                      </div>
                                    ) : (
                                      <p className="mt-2 text-sm text-amber-800">
                                        Tu recibo estara disponible aqui cuando confirmemos el pago del pedido.
                                      </p>
                                    )}
                                  </div>
                              </div>
                            );
                          })}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* MODAL REGISTRO */}
      {mostrarRegistro && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-5">
                      <h3 className="text-2xl font-black">Crea tu Cuenta</h3>
                      <button onClick={() => setMostrarRegistro(false)} className="text-slate-500 font-bold border rounded px-2 hover:bg-slate-100">X Cerrar</button>
                  </div>
                  {registroSuccess ? <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl mb-4 font-bold">Cuenta creada correctamente.</div> : (
                      <form onSubmit={handleRegistroSubmit} className="space-y-4">
                          {registroError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{registroError}</p>}
                          <div><label className="text-xs font-bold uppercase">Correo *</label><input required type="email" value={registroForm.username} onChange={e=>setRegistroForm({...registroForm, username: e.target.value})} className="w-full border p-2 rounded-xl mt-1" placeholder="juan@correo.com" /></div>
                          <div><label className="text-xs font-bold uppercase">Contrasena *</label><input required minLength={6} value={registroForm.password} onChange={e=>setRegistroForm({...registroForm, password: e.target.value})} className="w-full border p-2 rounded-xl mt-1" type="password" placeholder="Minimo 6 caracteres" /></div>
                          <div><label className="text-xs font-bold uppercase">Confirmar contrasena *</label><input required minLength={6} value={registroForm.password_confirm} onChange={e=>setRegistroForm({...registroForm, password_confirm: e.target.value})} className="w-full border p-2 rounded-xl mt-1" type="password" placeholder="Repite tu contrasena" /></div>
                          <div><label className="text-xs font-bold uppercase">Nombre Completo *</label><input required value={registroForm.nombre_completo} onChange={e=>setRegistroForm({...registroForm, nombre_completo: e.target.value})} className="w-full border p-2 rounded-xl mt-1" type="text" placeholder="Juan Perez" /></div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-xs font-bold uppercase">Telefono *</label><input required inputMode="numeric" value={registroForm.telefono} onChange={handleRegistroChange} name="telefono" className="w-full border p-2 rounded-xl mt-1" type="tel" /></div>
                              <div><label className="text-xs font-bold uppercase">Departamento *</label><SelectDepartamento required name="ciudad" value={registroForm.ciudad} onChange={handleRegistroChange} className="w-full border p-2 rounded-xl mt-1" placeholder="Selecciona departamento" /></div>
                          </div>
                          <div><label className="text-xs font-bold uppercase">Direccion de Envio *</label><input required value={registroForm.direccion} onChange={e=>setRegistroForm({...registroForm, direccion: e.target.value})} className="w-full border p-2 rounded-xl mt-1" type="text" /></div>
                          <label className="flex items-start gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={aceptarTerminos} onChange={(e) => setAceptarTerminos(e.target.checked)} className="mt-1" />
                            <span>Acepto los terminos y condiciones del negocio Trendify.</span>
                          </label>
                          <button type="submit" className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800">Registrarme</button>
                      </form>
                  )}
              </div>
          </div>
      )}

      {/* El LOGIN modal */}
      {mostrarLogin && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl relative">
                  <button onClick={() => setMostrarLogin(false)} className="absolute top-4 right-4 text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full z-10 hover:bg-slate-200">X</button>
                  <div className="p-6 pt-10">
                      <Login
                        minimal
                        onSuccess={() => setMostrarLogin(false)}
                        onSwitchToRegister={() => {
                          setMostrarLogin(false);
                          setMostrarRegistro(true);
                        }}
                      />
                  </div>
              </div>
         </div>
      )}

      {/* MODAL GUARDAR PEDIDO */}
      {mostrarGuardarPedido && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-black text-slate-900">Guardar pedido</h3>
              <button onClick={() => setMostrarGuardarPedido(false)} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50">X</button>
            </div>
            <input
              autoFocus
              value={nombrePedidoGuardado}
              onChange={(event) => setNombrePedidoGuardado(event.target.value)}
              placeholder="Ej. Navidad, compra mensual"
              className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
            />
            {pedidoGuardadoError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{pedidoGuardadoError}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setMostrarGuardarPedido(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarPedidoActual} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT DRAWER */}
      {openCheckout && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/60 transition-opacity">
          <div className="h-full w-full sm:w-[500px] overflow-y-auto bg-white p-5 sm:p-7 shadow-2xl animate-in slide-in-from-right">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900">Tu Carrito</h3>
              <button onClick={() => setOpenCheckout(false)} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold hover:bg-slate-100">X Cerrar</button>
            </div>
            {checkoutError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{checkoutError}</p>}

            {checkoutStep === 'carrito' && (
              <div>
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button onClick={abrirGuardarPedido} className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-black text-fuchsia-800 transition hover:bg-fuchsia-100">
                    Guardar pedido
                  </button>
                  {isClienteAutenticado && (
                    <button onClick={cargarPedidosGuardados} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      Actualizar guardados
                    </button>
                  )}
                </div>
                {pedidoGuardadoError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{pedidoGuardadoError}</p>}

                {isClienteAutenticado && (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Pedidos guardados</p>
                      <span className="text-xs font-bold text-slate-400">{pedidosGuardados.length}</span>
                    </div>
                    {cargandoPedidosGuardados ? (
                      <p className="mt-3 text-sm text-slate-500">Cargando...</p>
                    ) : pedidosGuardados.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">Todavia no tienes pedidos guardados.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {pedidosGuardados.map((pedido) => (
                          <div key={pedido.id_pedido_guardado} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900">{pedido.nombre}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{pedido.detalles_pedido_guardado?.length || 0} productos</p>
                              </div>
                              <button onClick={() => eliminarPedidoGuardado(pedido.id_pedido_guardado)} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-600">Eliminar</button>
                            </div>
                            <button onClick={() => cargarPedidoGuardadoAlCarrito(pedido)} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800">
                              Cargar al carrito
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {carrito.length === 0 ? <p className="text-slate-600 text-center py-8">Vacio.</p> : (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <button type="button" onClick={vaciarCarrito} className="text-xs font-bold text-red-500 hover:text-red-600">Vaciar carrito</button>
                    </div>
                    {carrito.map((item) => (
                      <div key={item.id_producto} className="flex border-b border-slate-100 pb-4">
                         <div className="flex-1">
                           <p className="font-bold text-slate-800">{item.nombre}</p>
                           <p className="text-sm text-slate-500">{currency(item.precio_venta)}</p>
                           <p className="text-xs text-slate-400">Disponible: {stockDisponible(item)}</p>
                           <div className="mt-2 flex items-center gap-2">
                            <button onClick={() => updateQty(item.id_producto, item.cantidad-1)} className="h-8 w-8 bg-slate-100 rounded-md font-bold">-</button>
                            <span className="w-8 text-center font-bold">{item.cantidad}</span>
                            <button onClick={() => updateQty(item.id_producto, item.cantidad+1)} className="h-8 w-8 bg-slate-100 rounded-md font-bold">+</button>
                           </div>
                         </div>
                         <div className="flex flex-col items-end justify-between ml-2">
                           <button onClick={() => removeFromCart(item.id_producto)} className="text-xs text-red-500 font-bold">Quitar</button>
                           <p className="font-black text-lg">{currency(item.cantidad * item.precio_venta)}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-6 rounded-2xl bg-slate-900 px-5 py-5 text-white shadow-lg">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Total a Pagar</p>
                  <p className="mt-1 text-3xl sm:text-4xl font-black">{currency(total)}</p>
                  <button onClick={irAPago} disabled={carrito.length === 0} className="mt-5 w-full rounded-xl bg-lime-400 px-4 py-3 text-sm font-black text-slate-900 transition hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed">Proceder al Pago</button>
                </div>
              </div>
            )}

            {checkoutStep === 'checkout' && (
              <div className="animate-in fade-in duration-300">
                <button onClick={() => setCheckoutStep('carrito')} className="mb-4 text-sm font-bold text-slate-500">Volver</button>

                {!isClienteAutenticado ? (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">Necesitas una cuenta de cliente para confirmar el pedido.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMostrarLogin(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Iniciar sesion</button>
                      <button type="button" onClick={() => setMostrarRegistro(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Crear cuenta</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 mb-5">
                    <p className="text-sm font-semibold">Datos de envio</p>
                    <input name="nombre" value={cliente.nombre} onChange={handleClienteChange} placeholder="Nombre completo *" className="w-full border p-3 rounded-xl text-sm" />
                    <input name="telefono" inputMode="numeric" value={cliente.telefono} onChange={handleClienteChange} placeholder="Telefono (solo numeros) *" className="w-full border p-3 rounded-xl text-sm" />
                    <SelectDepartamento name="ciudad" value={cliente.ciudad} onChange={handleClienteChange} className="w-full border p-3 rounded-xl text-sm bg-white" placeholder="Selecciona departamento *" required />
                    <textarea name="direccion" value={cliente.direccion} onChange={handleClienteChange} rows={2} placeholder="Direccion exacta *" className="w-full border p-3 rounded-xl text-sm" />
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Metodo de pago</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'qr', label: 'Pago Movil / QR', desc: 'Escanea el QR y envia el comprobante.' },
                      { id: 'transferencia', label: 'Transferencia bancaria', desc: 'Realiza la transferencia y envia el numero de operacion.' },
                      { id: 'stripe_card', label: 'Tarjeta (Stripe)', desc: 'Seras redirigido a Checkout seguro de Stripe.' },
                      { id: 'efectivo_contra_entrega', label: 'Efectivo contra entrega', desc: 'Pagas al recibir el pedido.' },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={[
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition',
                          metodoPago === opt.id
                            ? 'border-fuchsia-500 bg-fuchsia-50'
                            : 'border-slate-200 bg-white hover:border-slate-300',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name="metodo_pago"
                          value={opt.id}
                          checked={metodoPago === opt.id}
                          onChange={() => setMetodoPago(opt.id)}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{opt.label}</p>
                          <p className="text-xs text-slate-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {metodoPago === 'qr' && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 pt-2">Escanea el QR</p>
                    <div className="mx-auto h-32 w-32 bg-slate-900 grid place-items-center rounded-xl p-2 relative">
                      <div className="absolute top-2 left-2 bg-white w-4 h-4" />
                      <div className="absolute bottom-2 right-2 bg-white w-6 h-6" />
                      <div className="absolute top-2 right-6 bg-white w-2 h-2" />
                      <div className="text-white text-xs font-bold text-center">SCAN</div>
                    </div>
                    <p className="mt-3 text-sm font-semibold mb-1">Total: {currency(total)}</p>
                  </div>
                )}

                {requiereComprobante && (
                  <div className="mt-4">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Numero de comprobante / referencia *
                    </label>
                    <input
                      value={numeroComprobante}
                      onChange={(e) => setNumeroComprobante(e.target.value)}
                      placeholder={metodoPago === 'qr' ? 'Ej. 123456789' : 'N. de operacion bancaria'}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                    />
                    <label className="mt-3 block text-xs font-bold uppercase tracking-widest text-slate-500">
                      URL de imagen del comprobante (opcional)
                    </label>
                    <input
                      value={imagenComprobanteUrl}
                      onChange={(e) => setImagenComprobanteUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Tu pedido quedara pendiente hasta que el equipo verifique el pago.
                    </p>
                  </div>
                )}

                {metodoPago === 'efectivo_contra_entrega' && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Pagaras en efectivo al recibir tu pedido. El equipo confirmara el envio en breve.
                  </p>
                )}

                <button
                  onClick={confirmarPago}
                  disabled={submittingCheckout}
                  className="mt-5 w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-black text-white hover:bg-fuchsia-500 disabled:opacity-50"
                >
                  {submittingCheckout ? 'Procesando...' : 'Confirmar Pago'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast global */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-2xl ring-2 ring-emerald-400/30">
          {toast.message}
        </div>
      )}

      <ProductoDetalleModal
        producto={productoDetalle}
        open={Boolean(productoDetalle)}
        onClose={() => setProductoDetalle(null)}
        onAddToCart={addToCart}
        stockActual={productoDetalle ? stockDisponible(productoDetalle) : 0}
      />
    </div>
  );
}
