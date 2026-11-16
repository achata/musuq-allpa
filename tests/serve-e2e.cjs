const { createServer } = require('node:http');
const { createApp } = require('../server/app');
// Only provider adapters are replaced; HTTP validation and the recommendation engine run normally.
const app = createApp({ providers: {
  search: async () => ({ features: [{ geometry: { coordinates: [-75.2, -12.05] }, properties: { name: 'Huamancaca', state: 'Junín', countrycode: 'PE' } }] }),
  elevation: async () => ({ elevation: [3200] }),
  slope: async () => 3,
  soil: async () => ({ ph: 6.4, arena: 42, arcilla: 20, carbono: 1.2 }),
  reverse: async () => ({ address: { village: 'Huamancaca', state: 'Junín' } }),
  climate: async (lat, lon) => ({ lat, lon, dia: new Date().toISOString().slice(0, 10), actualizado: new Date().toISOString(), fuente: 'NASA POWER',
    dias: [{ fecha: '20261112', tmed: 12, tmin: 5, tmax: 20, lluvia: 2, viento: 8, suelo: 28, hr: 60 }] })
} });
createServer((req, res) => {
  if (req.url === '/legacy-sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => {
        if (e.request.mode !== 'navigate' && new URL(e.request.url).origin === self.location.origin)
          e.respondWith(caches.match(new URL(e.request.url).searchParams.has('v') ? new URL(e.request.url).pathname : e.request).then(cached => cached || fetch(e.request)));
      });`);
    return;
  }
  app(req, res);
}).listen(3100, '127.0.0.1');
