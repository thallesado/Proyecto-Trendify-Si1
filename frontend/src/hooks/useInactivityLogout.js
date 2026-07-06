import { useEffect } from 'react';

const EVENTOS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

/**
 * Cierra sesion tras inactividad (default 5 min) y avisa al AuthContext.
 */
export default function useInactivityLogout(onInactivity, enabled = true, timeoutMs = 5 * 60 * 1000) {
  useEffect(() => {
    if (!enabled || typeof onInactivity !== 'function') return undefined;

    let timerId = null;

    const reiniciar = () => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        onInactivity();
      }, timeoutMs);
    };

    EVENTOS.forEach((evt) => window.addEventListener(evt, reiniciar, { passive: true }));
    reiniciar();

    return () => {
      if (timerId) clearTimeout(timerId);
      EVENTOS.forEach((evt) => window.removeEventListener(evt, reiniciar));
    };
  }, [enabled, onInactivity, timeoutMs]);
}
