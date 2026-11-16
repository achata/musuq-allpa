const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { createProviders } = require('../server/infrastructure/providers');
const { MemoryCache } = require('../server/infrastructure/cache');
const { summarizeClimate } = require('../shared/domain/climate');
const missing = { dia: '20260101', dias: [{ tmed: null, tmin: null, lluvia: null, hr: null }] };

test('missing NASA rain stays unknown rather than zero', () => {
  assert.equal(summarizeClimate(missing).lluviaMax, null);
});
test('NASA normalizes sentinels and units', async () => {
  const providers = createProviders(async () => ({ properties: { parameter: {
    T2M: { '20260101': -999 }, T2M_MIN: { '20260101': 5 }, WS2M: { '20260101': 2 }, GWETTOP: { '20260101': .2 }
  } } }), new MemoryCache());
  const result = await providers.climate(-12, -75);
  assert.equal(result.dias[0].tmed, null);
  assert.equal(result.dias[0].viento, 7.2);
  assert.equal(result.dias[0].suelo, 20);
});
test('cache coalesces concurrent requests and retries failures', async () => {
  const cache = new MemoryCache(); let calls = 0;
  const load = async () => { calls++; return 42; };
  assert.deepEqual(await Promise.all([cache.get('x', load), cache.get('x', load)]), [42, 42]);
  assert.equal(calls, 1);
  await assert.rejects(cache.get('fail', () => { throw Error('no'); }));
  assert.equal(await cache.get('fail', load), 42);
});
test('HTTP: CORS, validation, privacy, real cross-data use case and degraded NASA', async t => {
  let fail = false;
  const app = createApp({ providers: { climate: async () => {
    if (fail) throw Error('offline');
    return { dias: [{ tmed: 11, tmin: 6, lluvia: 3, hr: 50 }] };
  } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  const health = await fetch(url + '/api/health', { headers: { Origin: 'https://musuq.cholotec.dev' } });
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://musuq.cholotec.dev');
  const denied = await fetch(url + '/api/health', { headers: { Origin: 'https://example.com' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(url + '/api/recommendations', { method: 'OPTIONS', headers: { Origin: 'https://musuq.cholotec.dev', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal((await fetch(url + '/api/climate?lat=999&lon=0')).status, 400);
  assert.equal((await fetch(url + '/server/app.js')).status, 404);
  const farm = { ubicacion: { lat: -12, lon: -75 }, altitud: 3200, perfil: { riego: 'lluvia', insumos: [], cultivos: [], cosecha: [] } };
  const post = () => fetch(url + '/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(farm) });
  const result = await (await post()).json();
  assert.equal(result.entrada.respuestas.riego, 'secano');
  assert.ok(result.resultado.recomendaciones.length);
  fail = true;
  const degraded = await (await post()).json();
  assert.equal(degraded.entrada.clima.tmed, null);
  assert.deepEqual(degraded.warnings, ['NASA_NO_DISPONIBLE']);
  farm.perfil.cosecha = [13];
  assert.equal((await post()).status, 400);
});

test('search uses supported English provider settings and confines fallback results to Peru', async () => {
  const urls = [];
  const providers = createProviders(async url => { urls.push(new URL(url)); return {}; }, new MemoryCache());
  await providers.search('Puno');
  await providers.search('Puno', 'nominatim');
  await providers.reverse(-15.84, -70.02);
  assert.equal(urls[0].searchParams.get('lang'), 'en');
  assert.equal(urls[0].searchParams.get('countrycode'), 'PE');
  assert.equal(urls[1].searchParams.get('countrycodes'), 'pe');
  assert.equal(urls[1].searchParams.get('accept-language'), 'en');
  assert.equal(urls[2].searchParams.get('accept-language'), 'en');
});
