import { useEffect, useState } from 'react';

const EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp'];

export default function ProductoImagen({
  idProducto,
  nombre,
  imagenSrc,
  className = '',
  placeholderClassName = '',
  imgClassName = '',
  showPlaceholderInitial = true,
}) {
  const [extIndex, setExtIndex] = useState(0);
  const [imagenExternaFallo, setImagenExternaFallo] = useState(false);

  // Si cambia el id de producto o la fuente externa, reiniciar la cascada
  useEffect(() => {
    setExtIndex(0);
    setImagenExternaFallo(false);
  }, [idProducto, imagenSrc]);

  const inicial = (nombre || '?').charAt(0).toUpperCase();
  const tieneImagenExterna = Boolean(imagenSrc) && !imagenExternaFallo;
  const todasFallaron = !tieneImagenExterna && extIndex >= EXTENSIONES.length;

  if (todasFallaron) {
    return (
      <div
        className={[
          'flex items-center justify-center bg-gradient-to-br from-fuchsia-50 to-amber-50',
          className,
          placeholderClassName,
        ].join(' ')}
      >
        {showPlaceholderInitial && (
          <div className="flex h-2/3 w-2/3 max-h-20 max-w-20 items-center justify-center rounded-2xl bg-white/80 text-xl font-black text-slate-700 shadow-sm">
            {inicial}
          </div>
        )}
      </div>
    );
  }

  // Prioridad: 1) imagen subida (data URI o URL), 2) cascada /products/{id}.{ext}
  const src = tieneImagenExterna ? imagenSrc : `/products/${idProducto}.${EXTENSIONES[extIndex]}`;

  const handleError = () => {
    if (tieneImagenExterna) {
      setImagenExternaFallo(true);
    } else {
      setExtIndex((i) => i + 1);
    }
  };

  return (
    <div
      className={[
        'flex items-center justify-center overflow-hidden bg-gradient-to-br from-fuchsia-50 to-amber-50',
        className,
      ].join(' ')}
    >
      <img
        src={src}
        alt={nombre || `Producto ${idProducto}`}
        loading="lazy"
        onError={handleError}
        className={['h-full w-full object-cover', imgClassName].join(' ')}
      />
    </div>
  );
}
