/*
  DATOS DE LA PARCELA · se consultan al crear la parcela.
  Suelo guarda uno de tres estados:
  - ok: datos de SoilGrids
  - sin_datos: el mapa no tiene información en ese punto (dato real, no error)
  - pendiente: no hubo señal o el servicio falló; se reintenta sola
*/
const DatosParcela = (() => {
  const SOIL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
  const ELEV = 'https://api.open-meteo.com/v1/elevation';
  const NOM  = 'https://nominatim.openstreetmap.org/reverse';

  function conTiempo(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  function error(code) {
    const e = new Error(code);
    e.code = code;
    return e;
  }

  const redondo = (x, d = 0) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;

  async function suelo(lat, lon) {
    if (!navigator.onLine) throw error('SIN_RED');
    const props = ['sand', 'clay', 'phh2o', 'soc'].map(p => `property=${p}`).join('&');
    let r;
    try {
      r = await fetch(`${SOIL}?lon=${lon}&lat=${lat}&${props}&depth=0-30cm&value=mean`,
        { signal: conTiempo(10000) });
    } catch {
      throw error('SERVICIO');
    }
    if (!r.ok) throw error('SERVICIO');

    const j = await r.json();
    const v = {};
    ((j.properties && j.properties.layers) || []).forEach(l => {
      const m = l.depths && l.depths[0] && l.depths[0].values ? l.depths[0].values.mean : null;
      if (m != null) v[l.name] = m / l.unit_measure.d_factor;
    });

    if (!Object.values(v).some(x => x != null)) throw error('SIN_DATOS');

    return {
      arena:   v.sand != null ? redondo(v.sand / 10, 0) : null,
      arcilla: v.clay != null ? redondo(v.clay / 10, 0) : null,
      ph:      redondo(v.phh2o, 1),
      carbono: v.soc  != null ? redondo(v.soc / 10, 1) : null
    };
  }

  async function pendiente(lat, lon) {
    const d = 0.0005;
    const pts = [[lat, lon], [lat + d, lon], [lat - d, lon], [lat, lon + d], [lat, lon - d]];
    const url = `${ELEV}?latitude=${pts.map(p => p[0]).join(',')}&longitude=${pts.map(p => p[1]).join(',')}`;
    const r = await fetch(url, { signal: conTiempo(8000) });
    if (!r.ok) throw error('ELEV');
    const e = (await r.json()).elevation;
    const dy = 2 * d * 110574;
    const dx = 2 * d * 111320 * Math.cos(lat * Math.PI / 180);
    const gx = (e[3] - e[4]) / dx;
    const gy = (e[1] - e[2]) / dy;
    return Math.round(Math.sqrt(gx * gx + gy * gy) * 100);
  }

  async function nombreLugar(lat, lon) {
    const r = await fetch(`${NOM}?lat=${lat}&lon=${lon}&format=json&zoom=12&accept-language=es`,
      { headers: { 'Accept-Language': 'es' }, signal: conTiempo(8000) });
    if (!r.ok) throw error('NOM');
    const a = (await r.json()).address || {};
    const local = a.village || a.town || a.hamlet || a.suburb || a.city_district
               || a.municipality || a.county || null;
    const partes = [local, a.county, a.state].filter(Boolean);
    const unicas = partes.filter((x, i) => partes.indexOf(x) === i);
    return unicas.length ? unicas.join(', ') : null;
  }

  // Convierte el resultado de SoilGrids en uno de los tres estados
  function estadoSuelo(res) {
    if (res.status === 'fulfilled') return { estado: 'ok', ...res.value };
    const code = res.reason && res.reason.code;
    if (code === 'SIN_DATOS') return { estado: 'sin_datos' };
    return { estado: 'pendiente', motivo: code || 'ERROR' };
  }

  async function completar(lat, lon) {
    const [s, p, n] = await Promise.allSettled([
      suelo(lat, lon), pendiente(lat, lon), nombreLugar(lat, lon)
    ]);
    return {
      suelo: estadoSuelo(s),
      pendientePct: p.status === 'fulfilled' ? p.value : null,
      lugar: n.status === 'fulfilled' ? n.value : null,
      consultado: new Date().toISOString()
    };
  }

  // Reintenta las parcelas con suelo pendiente cuando hay señal
  async function reintentarPendientes() {
    if (!navigator.onLine || typeof Almacen === 'undefined') return;
    const pendientes = Almacen.todas().filter(p => p.suelo && p.suelo.estado === 'pendiente' && p.ubicacion);
    for (const p of pendientes) {
      try {
        const s = await suelo(p.ubicacion.lat, p.ubicacion.lon);
        Almacen.guardar({ ...p, suelo: { estado: 'ok', ...s } });
      } catch (e) {
        if (e.code === 'SIN_DATOS') Almacen.guardar({ ...p, suelo: { estado: 'sin_datos' } });
        // SIN_RED o SERVICIO: queda pendiente para el próximo intento
      }
    }
  }

  window.addEventListener('online', reintentarPendientes);
  if (navigator.onLine) reintentarPendientes();

  return { completar, suelo, pendiente, nombreLugar, reintentarPendientes };
})();