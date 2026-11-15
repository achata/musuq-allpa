const Clima = (() => {
  function leerCache() { try { return JSON.parse(localStorage.getItem('clima')); } catch { return null; } }
  async function obtener(parcela) {
    const { lat, lon } = parcela.ubicacion || parcela;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new TypeError('Coordenadas inválidas');
    const cache = leerCache();
    if (cache?.dia === new Date().toISOString().slice(0, 10) && cache.lat === lat && cache.lon === lon) return cache;
    const data = await CampoApi.at('climate', lat, lon);
    try { localStorage.setItem('clima', JSON.stringify(data)); } catch { /* Storage may be unavailable. */ }
    return data;
  }
  return { obtener, leerCache, resumen: ClimateDomain.summarizeClimate };
})();
