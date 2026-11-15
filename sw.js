/*
  SERVICE WORKER
  - Páginas .html: primero la red (así el menú se actualiza), y si no hay señal, el caché.
  - Resto de archivos: primero el caché, para abrir rápido sin señal.
  Al cambiar archivos, sube CACHE_VERSION.
*/
const CACHE_VERSION = 'campo-v12';

const ARCHIVOS = [
  'js/ui/motion.js',
  'js/core/api.js', 'js/core/i18n.js', 'js/ui/language-switch.js', 'js/ui/shell.js',
  'shared/domain/climate.js', 'css/components.css', 'data/i18n.json', 'data/interactive.json', 'js/features/interactive/scene.js',
  './',
  'index.html',
  'bienvenida.html',
  'ubicar-chacra.html',
  'mi-campo.html',
  'parcela.html',
  'parcela_neugrac_interactiva.html',
  'conocerte.html',
  'riego.html',
  'insumos.html',
  'cosecha.html',
  'recomendacion.html',
  'clima.html',
  'aprender.html',
  'css/movil.css',
  'js/aprender.js',
  'js/almacen.js',
  'js/parcela-datos.js',
  'js/ruta.js',
  'shared/domain/ciclo.js',
  'shared/domain/motor.js',
  'js/clima.js',
  'js/resumen.js',
  'js/explica.js',
  'js/ubicacion.js',
  'js/ubicar.chacra.js',
  'data/cultivos.json',
  'data/zonas.json'
];

self.addEventListener('install', e => {
  // Si un archivo no existe, se omite sin romper la instalación
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c =>
      Promise.all(ARCHIVOS.map(a => c.add(a).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const esPagina = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (esPagina) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copia = r.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copia));
          return r;
        })
        .catch(() => caches.match(req))
    );
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
