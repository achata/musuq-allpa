/*
  UBICACIÓN · campo-app
  Obtiene la posición del teléfono y la altitud (una vez).
  No bloquea por precisión: si la ubicación es aproximada, lo indica.
*/
const Ubicacion = (() => {
  const OPCIONES_GPS = {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0
  };
  const PRECISION_IDEAL_M = 100;

  function obtenerPosicion() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        return reject(new Error('SIN_SOPORTE'));
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: +pos.coords.latitude.toFixed(6),
          lon: +pos.coords.longitude.toFixed(6),
          precision: Math.round(pos.coords.accuracy)
        }),
        err => {
          const motivo = err.code === 1 ? 'PERMISO_NEGADO'
                       : err.code === 3 ? 'TIEMPO_AGOTADO'
                       : 'NO_DISPONIBLE';
          reject(new Error(motivo));
        },
        OPCIONES_GPS
      );
    });
  }

  async function altitudDe(lat, lon) {
    const r = await fetch(
      `/api/elevation?lat=${lat}&lon=${lon}`
    );
    if (!r.ok) throw new Error('ALTITUD_FALLA');
    const j = await r.json();
    const alt = j.elevation && j.elevation[0];
    if (alt == null) throw new Error('ALTITUD_VACIA');
    return Math.round(alt);
  }

  async function activar() {
    const pos = await obtenerPosicion();
    const altitud = await altitudDe(pos.lat, pos.lon);
    return {
      lat: pos.lat,
      lon: pos.lon,
      precision: pos.precision,
      aproximada: pos.precision > PRECISION_IDEAL_M,
      altitud,
      creada: new Date().toISOString()
    };
  }

  return { obtenerPosicion, altitudDe, activar };
})();
