const { ServiceError } = require('./http-client');

function createProviders(get, cache) {
  const cached = (key, url) => cache.get(key, () => get(url));
  return {
    async climate(lat, lon) {
      const end = new Date(); end.setUTCDate(end.getUTCDate() - 2);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
      const date = d => d.toISOString().slice(0, 10).replaceAll('-', '');
      const raw = await cached(`nasa:${lat}:${lon}:${date(end)}`, 'https://power.larc.nasa.gov/api/temporal/daily/point?' + new URLSearchParams({
        parameters: 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M,GWETTOP', community: 'AG',
        latitude: lat, longitude: lon, start: date(start), end: date(end), format: 'JSON'
      }));
      const p = raw.properties?.parameter;
      if (!p?.T2M || !Object.keys(p.T2M).length) throw new ServiceError('NASA_SIN_DATOS');
      const clean = v => Number.isFinite(v) && v !== -999 ? v : null;
      const val = (k, d, factor = 1) => clean(p[k]?.[d]) == null ? null : p[k][d] * factor;
      return { dia: new Date().toISOString().slice(0, 10), lat, lon, actualizado: new Date().toISOString(), fuente: 'NASA POWER',
        dias: Object.keys(p.T2M).sort().map(fecha => ({ fecha, tmed: val('T2M', fecha), tmin: val('T2M_MIN', fecha),
          tmax: val('T2M_MAX', fecha), lluvia: val('PRECTOTCORR', fecha), viento: val('WS2M', fecha, 3.6),
          hr: val('RH2M', fecha), suelo: val('GWETTOP', fecha, 100) })) };
    },
    elevation(lat, lon) {
      return cached(`elevation:${lat}:${lon}`, `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    },
    async slope(lat, lon) {
      const d = 0.0005;
      const points = [[lat, lon], [lat + d, lon], [lat - d, lon], [lat, lon + d], [lat, lon - d]];
      const { elevation: e } = await this.elevation(points.map(p => p[0]).join(','), points.map(p => p[1]).join(','));
      if (!e || e.length !== 5 || !e.every(Number.isFinite)) throw new ServiceError('ELEV_SIN_DATOS');
      const gx = (e[3] - e[4]) / (2 * d * 111320 * Math.cos(lat * Math.PI / 180));
      const gy = (e[1] - e[2]) / (2 * d * 110574);
      return Math.round(Math.hypot(gx, gy) * 100);
    },
    async soil(lat, lon) {
      const data = await cached(`soil:${lat}:${lon}`, `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=${lat}&lon=${lon}&property=sand&property=clay&property=phh2o&property=soc&depth=0-30cm&value=mean`);
      const values = {};
      for (const layer of data.properties?.layers || []) {
        const mean = layer.depths?.[0]?.values?.mean;
        if (Number.isFinite(mean) && layer.unit_measure?.d_factor > 0) values[layer.name] = mean / layer.unit_measure.d_factor;
      }
      if (!Object.keys(values).length) throw new ServiceError('SIN_DATOS', 404);
      const round = (n, factor = 1, digits = 0) => n == null ? null : Number((n / factor).toFixed(digits));
      return { arena: round(values.sand, 10), arcilla: round(values.clay, 10), ph: round(values.phh2o, 1, 1), carbono: round(values.soc, 10, 1) };
    },
    search(q, provider = 'photon') {
      return provider === 'nominatim'
        ? cached(`search:nom:${q}`, `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, countrycodes: 'pe', format: 'json', limit: '8', 'accept-language': 'en' })}`)
        // The public Photon instance rejects lang=es. Its default keeps local place names.
        : cached(`search:photon:${q}`, `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '8', countrycode: 'PE', lang: 'en' })}`);
    },
    reverse(lat, lon) {
      return cached(`reverse:${lat}:${lon}`, `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12&accept-language=en`);
    }
  };
}
module.exports = { createProviders };
