const { ServiceError } = require('../infrastructure/http-client');
function coordinates(input) {
  const { lat, lon } = input || {};
  if (lat == null || lon == null || lat === '' || lon === '' || Array.isArray(lat) || Array.isArray(lon)) throw new ServiceError('COORDENADAS_INVALIDAS', 400);
  const a = Number(lat), o = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) throw new ServiceError('COORDENADAS_INVALIDAS', 400);
  return { lat: a, lon: o };
}
function validateFarm(body) {
  if (!body || typeof body !== 'object') throw new ServiceError('PARCELA_INVALIDA', 400);
  const ubicacion = coordinates(body.ubicacion);
  const p = body.perfil;
  if (!p || !['lluvia', 'manguera', 'aspersor', 'goteo'].includes(p.riego)
    || !Array.isArray(p.insumos) || !p.insumos.every(x => typeof x === 'string')
    || !Array.isArray(p.cultivos) || !p.cultivos.every(x => x && typeof x.id === 'string')
    || !Array.isArray(p.cosecha) || !p.cosecha.every(x => Number.isInteger(x) && x >= 1 && x <= 12)
    || (body.altitud != null && (!Number.isFinite(body.altitud) || body.altitud < -500 || body.altitud > 9000))
    || (body.pendientePct != null && (!Number.isFinite(body.pendientePct) || body.pendientePct < 0))) throw new ServiceError('PARCELA_INVALIDA', 400);
  if (body.suelo != null && (typeof body.suelo !== 'object' || !['ok', 'sin_datos', 'pendiente'].includes(body.suelo.estado)
    || ['ph', 'arena', 'arcilla', 'carbono'].some(k => body.suelo[k] != null && !Number.isFinite(body.suelo[k])))) throw new ServiceError('SUELO_INVALIDO', 400);
  return { ...body, ubicacion };
}
module.exports = { coordinates, validateFarm };
