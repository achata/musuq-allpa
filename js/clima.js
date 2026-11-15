/*
  CLIMA · NASA POWER con caché diario.
  Consulta la red como máximo una vez al día por parcela.
  Guarda el resultado en localStorage con la clave 'clima'.
*/
const Clima = (() => {
  const URL_BASE = 'https://power.larc.nasa.gov/api/temporal/daily/point';
  const PARAMETROS = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M,GWETTOP';
  const DIAS_HISTORIAL = 7;
  const RETRASO_DIAS = 2;

  function hoyISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function aYYYYMMDD(fecha) {
    return fecha.toISOString().slice(0, 10).replace(/-/g, '');
  }

  function leerCache() {
    try { return JSON.parse(localStorage.getItem('clima')); }
    catch { return null; }
  }

  async function consultarNasa(lat, lon) {
    const fin = new Date();
    fin.setDate(fin.getDate() - RETRASO_DIAS);
    const inicio = new Date(fin);
    inicio.setDate(inicio.getDate() - (DIAS_HISTORIAL - 1));

    const url = `${URL_BASE}?parameters=${PARAMETROS}&community=AG`
      + `&longitude=${lon}&latitude=${lat}`
      + `&start=${aYYYYMMDD(inicio)}&end=${aYYYYMMDD(fin)}&format=JSON`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('NASA_FALLA');
    const data = await response.json();
    const parameters = data.properties && data.properties.parameter;
    if (!parameters || !parameters.T2M) throw new Error('NASA_SIN_DATOS');

    const limpio = value => typeof value === 'number' && value !== -999 ? value : null;
    const dias = Object.keys(parameters.T2M).sort().map(fecha => ({
      fecha,
      tmed: limpio(parameters.T2M[fecha]),
      tmax: limpio(parameters.T2M_MAX && parameters.T2M_MAX[fecha]),
      tmin: limpio(parameters.T2M_MIN && parameters.T2M_MIN[fecha]),
      lluvia: limpio(parameters.PRECTOTCORR && parameters.PRECTOTCORR[fecha]),
      viento: limpio(parameters.WS2M && parameters.WS2M[fecha]) == null
        ? null
        : parameters.WS2M[fecha] * 3.6,
      hr: limpio(parameters.RH2M && parameters.RH2M[fecha]),
      suelo: limpio(parameters.GWETTOP && parameters.GWETTOP[fecha]) == null
        ? null
        : parameters.GWETTOP[fecha] * 100
    }));
    if (!dias.length) throw new Error('NASA_SIN_DATOS');

    return dias;
  }

  async function obtener(parcela) {
    const ubicacion = parcela && parcela.ubicacion ? parcela.ubicacion : parcela;
    if (!ubicacion || !Number.isFinite(ubicacion.lat) || !Number.isFinite(ubicacion.lon)) {
      throw new TypeError('La parcela no tiene coordenadas válidas.');
    }

    const cache = leerCache();
    if (cache && cache.dia === hoyISO() && cache.lat === ubicacion.lat && cache.lon === ubicacion.lon) {
      return cache;
    }
    const dias = await consultarNasa(ubicacion.lat, ubicacion.lon);
    const nuevo = {
      dia: hoyISO(),
      lat: ubicacion.lat,
      lon: ubicacion.lon,
      dias,
      actualizado: new Date().toISOString()
    };
    localStorage.setItem('clima', JSON.stringify(nuevo));
    return nuevo;
  }

  function resumen(cache) {
    const ultimosCinco = cache.dias.slice(-5);
    const media = valores => {
      const validos = valores.filter(value => value != null);
      return validos.length
        ? validos.reduce((sum, value) => sum + value, 0) / validos.length
        : null;
    };
    return {
      tmed: media(ultimosCinco.map(dia => dia.tmed)),
      lluviaMax: Math.max(0, ...ultimosCinco.map(dia => dia.lluvia ?? 0)),
      hr: media(ultimosCinco.map(dia => dia.hr)),
      viento: media(ultimosCinco.map(dia => dia.viento)),
      suelo: media(ultimosCinco.map(dia => dia.suelo)),
      estimado: false
    };
  }

  return { obtener, resumen, leerCache };
})();
