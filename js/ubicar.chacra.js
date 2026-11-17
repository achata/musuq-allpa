/*
  UBICAR PARCELA · pin fijo en el centro del mapa.
  1) El agricultor mueve el mapa.
  2) Confirma la ubicación para guardar la parcela y pasar al cuestionario.
  Si está fuera de nuestra lista, se avisa y se puede continuar igual.
*/
const $ = id => document.getElementById(id);
const DISTANCIA_LISTA_KM = 30;      // dentro de este radio, la zona cuenta como "en la lista"

let mapa = null;
let centro = null;
let zonas = [];
let temporizadorBusqueda = null;
let controlBusqueda = null;
let resultadosBusqueda = [];
let lugarElegido = null;
let ultimoMensaje;
const texto = (key, vars) => CampoI18n.t('location.' + key, vars);

/* ============ utilidades ============ */

function km(a1, o1, a2, o2){
  const R = 6371, r = Math.PI / 180;
  const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function zonaMasCercana(lat, lon){
  let mejor = null, min = Infinity;
  zonas.forEach(z => {
    const d = km(lat, lon, z.lat, z.lon);
    if (d < min) { min = d; mejor = z; }
  });
  return mejor ? { zona: mejor, km: Math.round(min) } : null;
}

function mensaje(contenido, tipo = 'info', key = null, vars = {}){
  const e = $('estado');
  ultimoMensaje = { contenido, tipo, key, vars };
  e.textContent = key ? texto(key, vars) : (window.CampoI18n?.text(contenido) || contenido);
  e.setAttribute('data-localized-text', '');
  e.className = 'estado ' + tipo;
}
document.addEventListener('campo:language', () => { if (ultimoMensaje) { const {contenido,tipo,key,vars} = ultimoMensaje; mensaje(contenido,tipo,key,vars); } });

function limpiarSugerencias(){
  $('sugerencias').replaceChildren();
  resultadosBusqueda = [];
}

function mostrarSugerencias(lugares){
  const lista = $('sugerencias');
  lista.replaceChildren();
  resultadosBusqueda = lugares;

  if (!lugares.length) {
    const li = document.createElement('li');
    li.className = 'sin-resultados';
    li.textContent = 'No encontramos lugares con ese nombre. Prueba con el nombre de tu distrito, provincia o región.';
    lista.appendChild(li);
    return;
  }

  lugares.forEach((lugar, indice) => {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'resultado';
    boton.setAttribute('data-user-value', '');
    boton.textContent = lugar.nombre;
    boton.addEventListener('click', () => elegirLugar(indice));
    li.appendChild(boton);
    lista.appendChild(li);
  });
  if (lugares.some(l => l.resolve)) {
    const attribution = document.createElement('li');
    attribution.className = 'maps-attribution';
    attribution.setAttribute('translate', 'no');
    attribution.setAttribute('data-user-value', '');
    attribution.textContent = 'Google Maps';
    lista.append(attribution);
  }
}

function nombreLugar(propiedades){
  const partes = [
    propiedades.name, propiedades.district, propiedades.city,
    propiedades.county, propiedades.state, propiedades.country
  ].filter(Boolean);
  return [...new Set(partes)].join(', ');
}

async function buscarLugares(texto){
  if (controlBusqueda) controlBusqueda.abort();
  controlBusqueda = new AbortController();
  const ul = $('sugerencias');
  ul.replaceChildren();
  const cargando = document.createElement('li');
  cargando.className = 'sin-resultados';
  cargando.textContent = 'Buscando localidades…';
  ul.appendChild(cargando);

  const controller = controlBusqueda;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
  const normalizar = datos => (datos.features || [])
      .filter(f => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === 'PE')
      .map(f => ({
        nombre: nombreLugar(f.properties) || 'Ubicación encontrada',
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0]
      })).filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lon));
  try {
    if (await CampoMaps.isGoogle()) {
      const lugares = await CampoMaps.search(texto, { signal });
      if (!controller.signal.aborted) mostrarSugerencias(lugares);
      return;
    }
    let lugares = [];
    try {
      lugares = normalizar(await CampoApi.request(`/search?q=${encodeURIComponent(texto)}`, { signal }));
    } catch (error) { if (controller.signal.aborted) return; }
    if (!lugares.length && !controller.signal.aborted) {
      const datos = await CampoApi.request(`/search?provider=nominatim&q=${encodeURIComponent(texto)}`, { signal });
      lugares = Array.isArray(datos) ? datos.map(l => ({ nombre: l.display_name, lat: +l.lat, lon: +l.lon })) : normalizar(datos);
    }
    if (!controller.signal.aborted) mostrarSugerencias(lugares.slice(0, 8));
  } catch (error) {
    if (controller.signal.aborted) return;
    ul.replaceChildren();
    const aviso = document.createElement('li');
    aviso.className = 'sin-resultados';
    aviso.textContent = 'El buscador no responde. Puedes usar el GPS o abrir el mapa para ubicar tu parcela.';
    ul.appendChild(aviso);
  } finally {
    document.dispatchEvent(new Event('campo:layout'));
  }
}

async function mostrarMapa(lat, lon, zoom){
  $('selectorUbicacion').hidden = true;
  $('mapaVista').hidden = false;
  $('pieMapa').hidden = false;
  $('ayuda').textContent = 'Mueve el mapa hasta que el pin quede sobre tu parcela.';

  $('btnConfirmar').disabled = true;
  if (!mapa) await iniciarMapa(lat, lon, zoom);
  else mapa.setView(lat, lon, zoom);
  centro = { lat, lon };
  actualizarCoordenadas();
  requestAnimationFrame(() => mapa?.resize());
  $('btnConfirmar').disabled = false;
}

async function elegirLugar(indice){
  const lugar = resultadosBusqueda[indice];
  if (!lugar) return;
  if (controlBusqueda) controlBusqueda.abort();
  try {
    if (lugar.resolve) Object.assign(lugar, await lugar.resolve());
    $('buscar').value = lugar.nombre;
    lugarElegido = lugar.nombre;
    limpiarSugerencias();
    await mostrarMapa(lugar.lat, lugar.lon, 15);
    mensaje('', 'info', 'found', { place: lugar.nombre });
  } catch {
    if ($('mapaVista').hidden) {
      const aviso = document.createElement('li');
      aviso.className = 'sin-resultados';
      aviso.textContent = texto('placeUnavailable');
      $('sugerencias').replaceChildren(aviso);
    } else mostrarErrorMapa();
  }
}

/* ============ datos y mapa ============ */

async function cargarZonas(){
  try {
    zonas = await (await fetch('data/zonas.json')).json();
  } catch {
    zonas = [];
  }
}

async function iniciarMapa(lat, lon, zoom){
  centro = { lat, lon };
  mapa = await CampoMaps.create($('mapa'), lat, lon, zoom, c => {
    centro = c;
    actualizarCoordenadas();
  });
  $('mapaVista').dataset.provider = mapa.provider;
  new ResizeObserver(() => mapa?.resize()).observe($('mapaVista'));
}

function mostrarErrorMapa(){
  $('avisoMapa').hidden = false;
  $('avisoMapa').textContent = texto('mapUnavailable');
  $('btnConfirmar').disabled = true;
}
document.addEventListener('campo:map-error', mostrarErrorMapa);
document.addEventListener('campo:tiles-error', () => { $('avisoMapa').hidden = false; $('avisoMapa').textContent = texto('tilesUnavailable'); });
document.addEventListener('campo:tiles-ready', () => { $('avisoMapa').hidden = true; });
$('mapZoomIn').addEventListener('click', () => mapa?.zoom(1));
$('mapZoomOut').addEventListener('click', () => mapa?.zoom(-1));

function actualizarCoordenadas(){
  if (centro) $('coordenadas').textContent = `${centro.lat.toFixed(5)}, ${centro.lon.toFixed(5)}`;
}

/* ============ GPS (solo cuando el usuario lo elige) ============ */

const MENSAJES_GPS = {
  PERMISO_NEGADO: 'Sin permiso no podemos centrar el mapa en tu ubicación. Puedes moverlo a mano.',
  TIEMPO_AGOTADO: 'No encontramos tu ubicación. Sal al aire libre y vuelve a intentar, o mueve el mapa a mano.',
  SIN_SOPORTE:    'Tu celular no permite usar la ubicación aquí. Mueve el mapa a mano.',
  NO_DISPONIBLE:  'No pudimos obtener tu ubicación. Revisa que el GPS esté prendido.'
};
let gpsBlockedReason = 'denied';
function renderGpsHelp() {
  const t = key => CampoI18n.t('gps.' + key);
  const platform = /iPad|iPhone/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
  $('gpsHelpMessage').textContent = t(gpsBlockedReason === 'denied' ? 'denied' : gpsBlockedReason);
  $('gpsHelpSteps').replaceChildren(...CampoI18n.t('gps.steps.' + platform).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('gpsHelpStatus').textContent = '';
}
function showGpsHelp(reason = 'denied') {
  gpsBlockedReason = reason;
  renderGpsHelp();
  if (!$('gpsHelp').open) $('gpsHelp').showModal();
}
document.addEventListener('campo:language', () => { if ($('gpsHelp').open) renderGpsHelp(); });
$('gpsHelpClose').addEventListener('click', () => $('gpsHelp').close());
$('gpsManual').addEventListener('click', () => { $('gpsHelp').close(); $('btnManual').click(); });
$('gpsCheck').addEventListener('click', async () => {
  const permission = await Ubicacion.permiso();
  if (permission === 'denied') { $('gpsHelpStatus').textContent = CampoI18n.t('gps.stillBlocked'); return; }
  $('gpsHelp').close();
  usarGps($('mapaVista').hidden ? $('btnGpsInicial') : $('btnGps'));
});
async function acceptGps(position) {
  lugarElegido = null;
  await mostrarMapa(position.lat, position.lon, 17);
  mensaje('', 'info', 'gpsFound', { meters: Math.round(position.precision) });
}
// Where supported, the browser's own control can ask again after a previous denial.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.HTMLGeolocationElement !== 'function') return;
  const native = document.createElement('geolocation');
  native.addEventListener('location', async () => {
    if (!native.position) { $('gpsHelpStatus').textContent = CampoI18n.t('gps.stillBlocked'); return; }
    const c = native.position.coords;
    $('gpsHelp').close();
    try { await acceptGps({ lat: c.latitude, lon: c.longitude, precision: c.accuracy }); }
    catch { mostrarErrorMapa(); }
  });
  $('gpsNative').append(native);
});

async function usarGps(boton){
  boton.disabled = true;
  $('avisoGps').hidden = true;
  boton.textContent = 'Buscando tu ubicación…';
  try {
    const p = await Ubicacion.obtenerPosicion();
    await acceptGps(p);
  } catch (e) {
    if (['PERMISO_NEGADO', 'CONTEXTO_INSEGURO', 'POLITICA_BLOQUEADA'].includes(e.message)) {
      showGpsHelp(e.message === 'PERMISO_NEGADO' ? 'denied' : e.message === 'CONTEXTO_INSEGURO' ? 'insecure' : 'policy');
      return;
    }
    if (!$('mapaVista').hidden) {
      mensaje(MENSAJES_GPS[e.message] || 'No pudimos usar tu GPS. Mueve el mapa a mano.', 'aviso');
    } else {
      const aviso = $('avisoGps');
      aviso.textContent = MENSAJES_GPS[e.message] || 'No pudimos usar tu GPS. Puedes buscar tu localidad escribiendo su nombre.';
      aviso.hidden = false;
    }
  } finally {
    boton.disabled = false;
    boton.textContent = CampoI18n.text('Usar mi GPS');
  }
}

$('btnGpsInicial').addEventListener('click', e => usarGps(e.currentTarget));
$('btnGps').addEventListener('click', e => usarGps(e.currentTarget));
$('btnManual').addEventListener('click', async () => {
  lugarElegido = null;
  const p = Almacen.activa()?.ubicacion;
  try { await mostrarMapa(centro?.lat ?? p?.lat ?? -9.2, centro?.lon ?? p?.lon ?? -75, centro ? 15 : 5); }
  catch { mostrarErrorMapa(); return; }
  mensaje('Acerca el mapa y mueve el pin hasta tu terreno. Luego confirma.', 'info');
});
$('formBuscar').addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(temporizadorBusqueda);
  const consulta = $('buscar').value.trim();
  if (consulta.length >= 2) buscarLugares(consulta);
  else { $('buscar').focus(); mostrarSugerencias([]); }
});

$('buscar').addEventListener('input', () => {
  const texto = $('buscar').value.trim();
  clearTimeout(temporizadorBusqueda);
  if (controlBusqueda) controlBusqueda.abort();
  limpiarSugerencias();
  if (texto.length < 2) return;
  temporizadorBusqueda = setTimeout(() => buscarLugares(texto), 350);
});

$('buscar').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (resultadosBusqueda.length) elegirLugar(0);
  else $('formBuscar').requestSubmit();
});

$('btnCambiar').addEventListener('click', () => {
  $('mapaVista').hidden = true;
  $('pieMapa').hidden = true;
  $('selectorUbicacion').hidden = false;
  $('ayuda').textContent = 'Elige cómo quieres encontrarla.';
  mensaje('');
});

/* ============ confirmar ============ */

async function altitudSegura(lat, lon, cercana){
  try {
    return { altitud: await Ubicacion.altitudDe(lat, lon), origen: 'satelite' };
  } catch {
    if (cercana) return { altitud: cercana.zona.altitud, origen: 'zona' };
    return null;
  }
}

async function guardarParcela(){
  const c = { ...centro };
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) throw new Error('UBICACION_INVALIDA');
  mensaje('Estamos guardando los datos de tu parcela. Espera unos segundos…', 'info');
  const cercana = zonaMasCercana(c.lat, c.lon);
  const [alt, extra] = await Promise.all([
    altitudSegura(c.lat, c.lon, cercana),
    DatosParcela.completar(c.lat, c.lon, { signal: AbortSignal.timeout(5000) })
  ]);
  const nombre = extra.lugar || lugarElegido || texto('defaultName', { n: Almacen.todas().length + 1 });
  Almacen.nueva({
    nombre,
    ubicacion: { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5) },
    altitud: alt?.altitud ?? null,
    origenAltitud: alt?.origen ?? 'pendiente',
    zona: cercana && cercana.km <= DISTANCIA_LISTA_KM ? cercana.zona.nombre : null,
    zonaCercana: cercana ? cercana.zona.nombre : null,
    distanciaKm: cercana ? cercana.km : null,
    fueraDeLista: !cercana || cercana.km > DISTANCIA_LISTA_KM,
    lugar: extra.lugar,
    suelo: extra.suelo,
    pendientePct: extra.pendientePct,
    datosFaltantes: [...(!alt ? ['altitud'] : []), ...(extra.suelo.estado !== 'ok' ? ['suelo'] : []), ...(extra.pendientePct == null ? ['pendiente'] : [])],
    consultado: extra.consultado
  });
  Almacen.borrarBorrador();

  location.href = 'conocerte.html';
}

$('btnConfirmar').onclick = async () => {
  const boton = $('btnConfirmar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await guardarParcela();
  } catch (error) {
    console.error('Parcel save failed', error);
    mensaje(error.name === 'QuotaExceededError' || error.name === 'SecurityError'
      ? 'Tu navegador no permite guardar la parcela. Activa el almacenamiento del sitio y vuelve a intentar.'
      : 'Algo salió mal al guardar. Tu ubicación sigue aquí. Intenta de nuevo.', 'aviso');
  } finally {
    boton.disabled = false;
    boton.textContent = CampoI18n.text('Esta es mi parcela');
  }
};

/* ============ inicio ============ */

async function iniciar(){
  await CampoI18n.ready;
  await cargarZonas();
}

document.addEventListener('DOMContentLoaded', iniciar);
