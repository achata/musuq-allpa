const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { createHttpClient } = require('./infrastructure/http-client');
const { MemoryCache } = require('./infrastructure/cache');
const { createProviders } = require('./infrastructure/providers');
const { createRecommendFarm } = require('./application/recommend-farm');
const { coordinates, validateFarm } = require('./presentation/validation');
const crops = require('../data/cultivos.json');

function createApp({ providers = createProviders(createHttpClient(), new MemoryCache()) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const origins = (process.env.CORS_ORIGINS || 'https://musuq.cholotec.dev,http://localhost:3000').split(',').map(x => x.trim()).filter(Boolean);
  app.use('/api', cors({ origin: origins, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], maxAge: 86400 }));
  app.use(express.json({ limit: '64kb' }));
  const api = express.Router();
  const recommend = createRecommendFarm({ providers, crops });
  api.get('/health', (req, res) => res.json({ status: 'ok' }));
  for (const [route, method] of [['climate', 'climate'], ['soil', 'soil'], ['slope', 'slope'], ['reverse', 'reverse'], ['elevation', 'elevation']]) {
    api.get('/' + route, async (req, res) => {
      const { lat, lon } = coordinates(req.query);
      res.json(await providers[method](lat, lon));
    });
  }
  api.get('/search', async (req, res) => {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length < 2 || req.query.q.length > 200) return res.status(400).json({ code: 'BUSQUEDA_INVALIDA' });
    res.json(await providers.search(req.query.q.trim(), req.query.provider));
  });
  api.post('/recommendations', async (req, res) => res.json(await recommend(validateFarm(req.body))));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);
  app.use('/api', (req, res) => res.status(404).json({ code: 'RUTA_NO_ENCONTRADA' }));
  const root = path.resolve(__dirname, '..');
  // Explicit public surface: server sources, manifests and deployment config are private.
  for (const dir of ['js', 'css', 'data']) app.use('/' + dir, express.static(path.join(root, dir)));
  app.use('/shared/domain', express.static(path.join(root, 'shared/domain')));
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.get(/^\/[a-zA-Z0-9_-]+\.html$/, (req, res, next) => res.sendFile(path.join(root, req.path), error => error && next(error)));
  app.get('/sw.js', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(root, 'sw.js')); });
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', path: req.path, code: err.code || 'ERROR_INTERNO' }));
    res.status(status).json({ code: err.code || (status === 400 ? 'JSON_INVALIDO' : 'ERROR_INTERNO') });
  });
  return app;
}
module.exports = { createApp };
