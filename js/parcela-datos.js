const DatosParcela = (() => {
  const suelo = (lat, lon) => CampoApi.at('soil', lat, lon);
  const pendiente = (lat, lon) => CampoApi.at('slope', lat, lon);
  async function nombreLugar(lat, lon) {
    const a = (await CampoApi.at('reverse', lat, lon)).address || {};
    return [...new Set([a.village || a.town || a.hamlet || a.suburb || a.city_district || a.municipality, a.county, a.state].filter(Boolean))].join(', ') || null;
  }
  async function completar(lat, lon) {
    const [s, p, n] = await Promise.allSettled([suelo(lat, lon), pendiente(lat, lon), nombreLugar(lat, lon)]);
    return { suelo: s.status === 'fulfilled' ? { estado: 'ok', ...s.value } : { estado: s.reason?.code === 'SIN_DATOS' ? 'sin_datos' : 'pendiente' },
      pendientePct: p.status === 'fulfilled' ? p.value : null, lugar: n.status === 'fulfilled' ? n.value : null, consultado: new Date().toISOString() };
  }
  async function reintentarPendientes() {
    if (!navigator.onLine || typeof Almacen === 'undefined') return;
    for (const p of Almacen.todas().filter(p => p.suelo?.estado === 'pendiente' && p.ubicacion)) {
      try { Almacen.guardar({ ...p, suelo: { estado: 'ok', ...await suelo(p.ubicacion.lat, p.ubicacion.lon) } }); }
      catch (e) { if (e.code === 'SIN_DATOS') Almacen.guardar({ ...p, suelo: { estado: 'sin_datos' } }); }
    }
  }
  window.addEventListener('online', reintentarPendientes);
  if (navigator.onLine) reintentarPendientes();
  return { suelo, pendiente, nombreLugar, completar, reintentarPendientes };
})();
