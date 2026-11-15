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

function mensaje(texto, tipo = 'info'){
  const e = $('estado');
  e.textContent = texto;
  e.className = 'estado ' + tipo;
}

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
    boton.textContent = lugar.nombre;
    boton.addEventListener('click', () => elegirLugar(indice));
    li.appendChild(boton);
    lista.appendChild(li);
  });
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

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&limit=20&lang=es`;
    const respuesta = await fetch(url, { signal: controlBusqueda.signal });
    if (!respuesta.ok) throw new Error('Photon ' + respuesta.status);
    const datos = await respuesta.json();
    const lugares = datos.features
      .filter(f => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === 'PE')
      .map(f => ({
        nombre: nombreLugar(f.properties) || 'Ubicación encontrada',
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0]
      }));
    mostrarSugerencias(lugares);
  } catch (error) {
    if (error.name === 'AbortError') return;
    ul.replaceChildren();
    const aviso = document.createElement('li');
    aviso.className = 'sin-resultados';
    aviso.textContent = 'El buscador no responde ahora. Revisa tu conexión o prueba con el GPS.';
    ul.appendChild(aviso);
  }
}

function mostrarMapa(lat, lon, zoom){
  $('selectorUbicacion').hidden = true;
  $('mapaVista').hidden = false;
  $('pieMapa').hidden = false;
  $('ayuda').textContent = 'Mueve el mapa hasta que el pin quede sobre tu parcela.';

  if (!mapa) iniciarMapa(lat, lon, zoom);
  else mapa.setView([lat, lon], zoom);
  setTimeout(() => mapa.invalidateSize(), 100);
}

function elegirLugar(indice){
  const lugar = resultadosBusqueda[indice];
  if (!lugar) return;
  if (controlBusqueda) controlBusqueda.abort();
  $('buscar').value = lugar.nombre;
  limpiarSugerencias();
  mostrarMapa(lugar.lat, lugar.lon, 15);
  mensaje(`Encontramos ${lugar.nombre}. Revisa el pin y muévelo si hace falta.`, 'info');
}

/* ============ datos y mapa ============ */

async function cargarZonas(){
  try {
    zonas = await (await fetch('data/zonas.json')).json();
  } catch {
    zonas = [];
  }
}

function iniciarMapa(lat, lon, zoom){
  mapa = L.map('mapa', { zoomControl: false }).setView([lat, lon], zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(mapa);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(mapa);

  centro = { lat, lon };
  mapa.on('move', () => {
    const c = mapa.getCenter();
    centro = { lat: c.lat, lon: c.lng };
  });

  setTimeout(() => mapa.invalidateSize(), 200);
}

/* ============ GPS (solo cuando el usuario lo elige) ============ */

const MENSAJES_GPS = {
  PERMISO_NEGADO: 'Sin permiso no podemos centrar el mapa en tu ubicación. Puedes moverlo a mano.',
  TIEMPO_AGOTADO: 'No encontramos tu ubicación. Sal al aire libre y vuelve a intentar, o mueve el mapa a mano.',
  SIN_SOPORTE:    'Tu celular no permite usar la ubicación aquí. Mueve el mapa a mano.',
  NO_DISPONIBLE:  'No pudimos obtener tu ubicación. Revisa que el GPS esté prendido.'
};

async function usarGps(boton){
  boton.disabled = true;
  const textoOriginal = boton.innerHTML;
  boton.textContent = 'Buscando tu ubicación…';
  try {
    const p = await Ubicacion.obtenerPosicion();
    mostrarMapa(p.lat, p.lon, 17);
    mensaje(`Ubicación encontrada (precisión aproximada de ${Math.round(p.precision)} m). Revisa el pin y muévelo si hace falta.`, 'info');
  } catch (e) {
    if (!$('mapaVista').hidden) {
      mensaje(MENSAJES_GPS[e.message] || 'No pudimos usar tu GPS. Mueve el mapa a mano.', 'aviso');
    } else {
      const aviso = $('avisoGps');
      aviso.textContent = MENSAJES_GPS[e.message] || 'No pudimos usar tu GPS. Puedes buscar tu localidad escribiendo su nombre.';
      aviso.hidden = false;
    }
  } finally {
    boton.disabled = false;
    boton.innerHTML = textoOriginal;
  }
}

$('btnGpsInicial').addEventListener('click', e => usarGps(e.currentTarget));
$('btnGps').addEventListener('click', e => usarGps(e.currentTarget));

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
  const c = centro;
  mensaje('Estamos guardando los datos de tu parcela. Espera unos segundos…', 'info');
  const cercana = zonaMasCercana(c.lat, c.lon);
  const alt = await altitudSegura(c.lat, c.lon, cercana);
  if (!alt) {
    mensaje('Sin internet no podemos calcular la altura de tu parcela. Intenta cuando tengas señal.', 'aviso');
    return;
  }

  const extra = await DatosParcela.completar(c.lat, c.lon);
  const nombre = extra.lugar || `Parcela ${Almacen.todas().length + 1}`;
  Almacen.nueva({
    nombre,
    ubicacion: { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5) },
    altitud: alt.altitud,
    origenAltitud: alt.origen,
    zona: cercana && cercana.km <= DISTANCIA_LISTA_KM ? cercana.zona.nombre : null,
    zonaCercana: cercana ? cercana.zona.nombre : null,
    distanciaKm: cercana ? cercana.km : null,
    fueraDeLista: !cercana || cercana.km > DISTANCIA_LISTA_KM,
    lugar: extra.lugar,
    suelo: extra.suelo,
    pendientePct: extra.pendientePct,
    datosFaltantes: extra.faltan,
    consultado: extra.consultado
  });

  location.href = 'conocerte.html';
}

$('btnConfirmar').onclick = async () => {
  const boton = $('btnConfirmar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await guardarParcela();
  } catch {
    mensaje('Algo salió mal al guardar. Intenta de nuevo.', 'aviso');
  } finally {
    boton.disabled = false;
    boton.textContent = '✅ Esta es mi parcela';
  }
};

/* ============ inicio ============ */

async function iniciar(){
  await cargarZonas();
}

iniciar();
