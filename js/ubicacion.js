/*
  UBICACIÓN · campo-app
  Obtiene la posición del teléfono y la altitud (una vez).
  No bloquea por precisión: si la ubicación es aproximada, lo indica.
*/
const Ubicacion = (() => {
  const PRECISION_IDEAL_M = 100;
  async function permiso() {
    if (!window.isSecureContext) return 'inseguro';
    if ((document.permissionsPolicy || document.featurePolicy)?.allowsFeature('geolocation') === false) return 'politica';
    try { return (await navigator.permissions.query({ name: 'geolocation' })).state; }
    catch { return 'desconocido'; }
  }

  function solicitar(options) {
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
        options
      );
    });
  }
  async function obtenerPosicion() {
    const state = await permiso();
    if (state === 'inseguro') throw Error('CONTEXTO_INSEGURO');
    if (state === 'politica') throw Error('POLITICA_BLOQUEADA');
    if (state === 'denied') throw Error('PERMISO_NEGADO');
    try { return await solicitar({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }); }
    catch (error) {
      if (!['TIEMPO_AGOTADO', 'NO_DISPONIBLE'].includes(error.message)) throw error;
      return solicitar({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
    }
  }

  async function altitudDe(lat, lon) {
    const j = await CampoApi.request(`/elevation?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(5000) });
    const alt = j.elevation && j.elevation[0];
    if (!Number.isFinite(alt)) throw new Error('ALTITUD_VACIA');
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

  return { obtenerPosicion, altitudDe, activar, permiso };
})();
