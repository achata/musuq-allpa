# campo / Musuq Allpa

Aplicación agrícola mobile-first: registro de parcelas, encuesta en español, quechua e inglés, recomendaciones a partir del perfil del agricultor y NASA POWER, y exploración interactiva de la campaña.

## Ejecución

Recomendado: **Node.js 22 LTS** y npm.

```sh
npm ci
npm start
```

Abre <http://localhost:3000>. Para recarga del servidor: `npm run dev`.
Express sirve las páginas y `/api` en el mismo origen. El servidor sustituye al servidor estático Python/Live Server: las consultas externas necesitan `/api`.

Variables de entorno (ver `.env.example`; se inyectan desde el entorno o con `node --env-file=.env server/index.js`):

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interfaz de escucha |
| `PORT` | `3000` | Puerto HTTP |
| `CORS_ORIGINS` | `https://musuq.cholotec.dev,http://localhost:3000` | Orígenes permitidos, separados por comas |
| `NODE_ENV` | según entorno | Usar `production` en despliegue |

CORS permite `GET`, `POST`, `OPTIONS` y `Content-Type`, sin cookies ni credenciales. Para un frontend separado se puede definir `window.CAMPO_API_BASE` antes de cargar `js/core/api.js`; el despliegue previsto sirve interfaz y API bajo `https://musuq.cholotec.dev`.

## Arquitectura

```text
server/
  index.js                  # Arranque y cierre ordenado
  app.js                    # Composition root: inyección de dependencias y rutas
  application/              # Caso de uso: cruzar NASA y perfil agrícola
  infrastructure/           # Adaptadores de proveedores, cliente HTTP, caché TTL
  presentation/             # Validación de peticiones
shared/
  domain/                   # Motor, calendario y resumen climático puros
  app-config.json           # Contrato de infraestructura para generar Docker/K8s
js/
  core/                     # Cliente API e internacionalización
  ui/                       # Selector de idioma, navegación y movimiento reutilizables
  features/interactive/     # Controlador de escena Three.js y gráficos
  ...                       # Controladores de páginas, GPS y almacenamiento local
data/
  i18n.json                 # Catálogo compartido; incluye textos del módulo interactivo
  interactive.json          # Serie simulada y configuración de la campaña interactiva
  cultivos.json             # Reglas agronómicas y catálogo
css/components.css          # Componentes compartidos, foco y movimiento reducido
tests/                      # Dominio, integración HTTP y flujo móvil
```

El dominio no depende de Express, red ni DOM. El caso de uso recibe los proveedores y el catálogo por inyección. Los adaptadores encapsulan NASA, SoilGrids, Open-Meteo, Photon y Nominatim. La caché acotada evita peticiones simultáneas duplicadas y caduca cada hora. Los proveedores tienen timeout; sus fallos no se guardan en caché.

`POST /api/recommendations` valida la parcela y cruza coordenadas, clima NASA, altitud, suelo, pendiente, cultivos anteriores, riego, insumos y meses de cosecha. Los datos ausentes no se convierten en mediciones ficticias: ni la lluvia desconocida se trata como cero ni se penaliza la altitud ausente. Si NASA falla, el resultado incluye `warnings: ["NASA_NO_DISPONIBLE"]` y criterios incompletos. Las series tienen retraso de aproximadamente dos días y describen la región, no el clima de hoy en la parcela.

El motor puro compartido también permite la evaluación local cuando el navegador está sin conexión. La escena interactiva conserva sus **datos simulados**, identificados como tales; no se presentan como resultados NASA.

## API

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/health` | Estado del proceso |
| GET | `/api/climate?lat=...&lon=...` | Serie NASA normalizada |
| GET | `/api/elevation?lat=...&lon=...` | Elevación |
| GET | `/api/soil?lat=...&lon=...` | Suelo normalizado |
| GET | `/api/slope?lat=...&lon=...` | Pendiente estimada |
| GET | `/api/reverse?lat=...&lon=...` | Dirección |
| GET | `/api/search?q=...` | Resultados Photon |
| GET | `/api/search?q=...&provider=nominatim` | Búsqueda alternativa |
| POST | `/api/recommendations` | `{ resultado, entrada, clima, warnings }` |

Ejemplo de cuerpo:

```json
{
  "ubicacion": { "lat": -12.05, "lon": -75.2 },
  "altitud": 3200,
  "suelo": { "estado": "pendiente" },
  "pendientePct": null,
  "perfil": {
    "cultivos": [{ "id": "papa" }],
    "riego": "lluvia",
    "insumos": ["guano"],
    "cosecha": [5, 6]
  }
}
```

## Idiomas y navegación

`data/i18n.json` es el catálogo central. El selector compartido conserva `musuq.lang` y emite `campo:language`, usado por la encuesta y el modo interactivo. Las claves ausentes vuelven al español. Las respuestas mantienen identificadores estables independientemente del texto mostrado.

La navegación de la encuesta tiene destinos anteriores explícitos y guarda cambios al seleccionar. El idioma no borra las respuestas. Los controles respetan zonas táctiles de 44px, foco visible y preferencia de movimiento reducido.

Las parcelas y borradores siguen en **localStorage del navegador**; no hay una base de datos central ni sincronización entre dispositivos. El backend procesa las parcelas enviadas sin almacenarlas. Los mapas y fuentes se sirven desde proveedores públicos. HTTPS es necesario para geolocalización fuera de localhost.

## Docker y Kubernetes

Entrega para el generador: **[`shared/app-config.json`](shared/app-config.json)**. Incluye imagen Node 22 Alpine, instalación de producción, entrypoint, puerto, CORS, variables, archivos a copiar, probes, recursos, ingress TLS para `musuq.cholotec.dev` y comandos para los manifiestos que genere el consumidor. Debe sustituirse la imagen del registro y configurarse el certificado del clúster. El JSON no aplica un despliegue por sí mismo.

## Verificación

```sh
npm test
npx playwright install chromium
node tests/mobile.e2e.cjs
```

La prueba móvil usa Chromium con viewport de 390 × 844 y entrada táctil emulada; comprueba idiomas, retroceso y restauración de borradores. No sustituye pruebas en teléfonos físicos. Las capturas quedan en `test-results/`.

`sw.js` precarga los nuevos módulos y catálogos; `/api` queda fuera del caché del service worker. Al desplegar cambios futuros hay que incrementar `CACHE_VERSION`.

`tools/migrate-architecture.cjs` conserva la migración inicial de los scripts y JSON incrustados; ya fue aplicada y tiene una guarda contra ejecuciones repetidas.

El catálogo `data/zonas.json` sigue vacío hasta recuperar los datos geográficos originales.
