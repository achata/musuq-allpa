/*
  PRUEBA DE UBICACIÓN
  - Buscador predictivo con Photon (OpenStreetMap, sin clave).
  - Mapa con Leaflet: se puede tocar, arrastrar el marcador o usar el GPS.
  - Con el punto elegido consulta altitud (Open-Meteo) y clima (NASA POWER).
  - Calcula la recomendación con motor.js y explica la exactitud de cada dato.
*/
const $ = id => document.getElementById(id);
const CULTIVOS_URL = 'data/cultivos.json';
const ZONAS_URL = 'data/zonas.json';

let mapa, marcador = null, punto = null;
let temporizador = null, controlBusqueda = null;

/* ================= MAPA ================= */

function iniciarMapa(){
  mapa = L.map('mapa').setView([-9.2, -75.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(mapa);
  mapa.on('click', e => ponerPunto(e.latlng.lat, e.latlng.lng, false));
}

function ponerPunto(lat, lon, centrar){
  punto = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };

  if (!marcador) {
    marcador = L.marker([punto.lat, punto.lon], { draggable: true }).addTo(mapa);
    marcador.on('dragend', () => {
      const p = marcador.getLatLng();
      ponerPunto(p.lat, p.lng, false);
    });
  } else {
    marcador.setLatLng([punto.lat, punto.lon]);
  }

  if (centrar) mapa.setView([punto.lat, punto.lon], 15);
  $('coords').textContent = `Lat ${punto.lat}, Lon ${punto.lon}`;
  $('btnProbar').disabled = false;
}

/* ================= BUSCADOR (Photon) ================= */

function limpiarSugerencias(mensaje){
  const ul = $('sugerencias');
  ul.innerHTML = '';
  if (mensaje) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = mensaje;
    ul.appendChild(li);
  }
}

function textoLugar(p){
  const partes = [p.name, p.district, p.city, p.state].filter(Boolean);
  return [...new Set(partes)].join(', ');
}

function mostrarSugerencias(lugares){
  if (!lugares.length) {
    limpiarSugerencias('No encontramos ese lugar. Prueba con otro nombre o toca el mapa.');
    return;
  }
  const ul = $('sugerencias');
  ul.innerHTML = '';
  lugares.forEach(l => {
    const li = document.createElement('li');
    li.textContent = l.nombre;
    li.onclick = () => {
      $('buscar').value = l.nombre;
      limpiarSugerencias();
      ponerPunto(l.lat, l.lon, true);
    };
    ul.appendChild(li);
  });
}

async function buscarPhoton(texto){
  const url = `/api/search?q=${encodeURIComponent(texto)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('photon ' + r.status);
  const j = await r.json();
  return j.features
    .filter(f => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === 'PE')
    .map(f => ({
      nombre: textoLugar(f.properties),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0]
    }));
}

async function buscarNominatim(texto){
  const url = `/api/search?provider=nominatim&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const j = await r.json();
  return j.map(l => ({
    nombre: l.display_name.split(',').slice(0, 3).join(','),
    lat: +l.lat,
    lon: +l.lon
  }));
}

async function buscar(texto){
  if (controlBusqueda) controlBusqueda.abort();
  controlBusqueda = new AbortController();
  try {
    const lugares = await buscarPhoton(texto);
    mostrarSugerencias(lugares);
  } catch (e) {
    if (e.name === 'AbortError') return;
    // Photon falló: aviso claro, sin bloquear la búsqueda
    limpiarSugerencias('El buscador de lugares no responde ahora. Toca el mapa o escribe Enter para intentar otra vez.');
  }
}

// Espera 400 ms después de la última tecla para no saturar el servicio
$('buscar').addEventListener('input', () => {
  const texto = $('buscar').value.trim();
  clearTimeout(temporizador);
  if (texto.length < 3) return limpiarSugerencias();
  temporizador = setTimeout(() => buscar(texto), 400);
});

$('buscar').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const texto = $('buscar').value.trim();
  if (texto.length < 3) return;
  clearTimeout(temporizador);
  try {
    const lugares = await buscarNominatim(texto);
    mostrarSugerencias(lugares);
  } catch {
    limpiarSugerencias('No encontramos ese lugar. Prueba con otro nombre o toca el mapa.');
  }
});

/* ================= GPS ================= */

$('btnGps').onclick = async () => {
  const btn = $('btnGps');
  btn.textContent = 'Buscando…';
  try {
    const p = await Ubicacion.obtenerPosicion();
    ponerPunto(p.lat, p.lon, true);
    $('coords').textContent += ` · precisión ±${p.precision} m`;
  } catch (e) {
    $('coords').textContent = 'No pudimos usar tu GPS: ' + e.message;
  }
  btn.textContent = '📍 Usar mi GPS';
};

/* ================= DATOS EXTERNOS ================= */

const v = x => (typeof x === 'number' && x !== -999 ? x : null);
const media = arr => {
  const a = arr.filter(x => x != null);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
};
const aYYYYMMDD = d => d.toISOString().slice(0, 10).replace(/-/g, '');

async function altitud(lat, lon){
  const r = await fetch(`/api/elevation?lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error('altitud');
  const j = await r.json();
  return Math.round(j.elevation[0]);
}

async function clima(lat, lon){ return (await CampoApi.at('climate', lat, lon)).dias; }

function resumir(dias){
  const u5 = dias.slice(-5);
  return {
    tmed: media(u5.map(d => d.tmed)),
    lluviaMax: Math.max(0, ...u5.map(d => d.lluvia ?? 0)),
    hr: media(u5.map(d => d.hr)),
    viento: media(u5.map(d => d.viento)),
    suelo: media(u5.map(d => d.suelo))
  };
}

function distanciaKm(a1, o1, a2, o2){
  const R = 6371, r = Math.PI / 180;
  const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Zona de nuestra lista más cercana al punto (si zonas.json existe)
async function zonaCercana(lat, lon){
  try {
    const zonas = await (await fetch(ZONAS_URL)).json();
    let mejor = null, min = Infinity;
    zonas.forEach(z => {
      const d = distanciaKm(lat, lon, z.lat, z.lon);
      if (d < min) { min = d; mejor = z; }
    });
    return mejor ? { nombre: mejor.nombre, km: Math.round(min) } : null;
  } catch {
    return null;
  }
}

/* ================= PRUEBA ================= */

const pct = x => x == null ? '--' : Math.round(x * 100) + '%';
const redondo = n => n == null ? '--' : Math.round(n);

function dato(titulo, valor, nota){
  return `<div class="dato">
    <strong>${titulo}</strong>
    <span class="valor">${valor}</span>
    <small>${nota}</small>
  </div>`;
}

function pintar(alt, cl, cercana, r){
  const filas = r.aptitud.slice(0, 5).map(c => `
    <tr>
      <td>${c.nombre}</td>
      <td><strong>${Math.round(c.score)}%</strong></td>
      <td>${pct(c.factores.fT)}</td>
      <td>${pct(c.factores.fA)}</td>
      <td>${pct(c.factores.fR)}</td>
      <td>${pct(c.factores.fI)}</td>
    </tr>`).join('');

  const textoZona = cercana
    ? `La zona de nuestra lista más cercana es ${cercana.nombre}, a unos ${cercana.km} km. Cuanto más cerca, más parecido es el clima.`
    : 'Todavía no hay zonas base para comparar. Cuando existan, aquí aparecerá la más cercana.';

  $('resultado').innerHTML = `
    <h2>Datos de este punto</h2>
    <div class="datos">
      ${dato('Altitud', redondo(alt) + ' msnm', 'Open-Meteo, modelo de elevación de unos 90 m. En laderas puede cambiar decenas de metros de un lado a otro.')}
      ${dato('Temperatura media', redondo(cl.tmed) + ' °C', 'NASA POWER, celdas de unos 50 km. Describe la zona, no tu parcela exacta.')}
      ${dato('Lluvia máxima (5 días)', redondo(cl.lluviaMax) + ' mm', 'Dato regional, igual que la temperatura.')}
      ${dato('Humedad del aire', redondo(cl.hr) + ' %', 'Dato regional.')}
      ${dato('Viento', redondo(cl.viento) + ' km/h', 'Dato regional.')}
      ${dato('Humedad de la tierra', redondo(cl.suelo) + ' %', 'Modelo de NASA, capa superficial de la zona.')}
    </div>

    <h2>Exactitud</h2>
    <div class="aviso">${textoZona}</div>

    <h2>Recomendación con estos datos</h2>
    <table>
      <thead>
        <tr><th>Cultivo</th><th>Total</th><th>Temp.</th><th>Altura</th><th>Riego</th><th>Insumos</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <p class="nota">Cada columna va de 0 a 100 %. Si una baja mucho, el total baja con ella. Así puedes ver qué factor limita cada cultivo.</p>`;
}

async function probar(){
  const btn = $('btnProbar');
  btn.disabled = true;
  btn.textContent = 'Consultando…';
  $('resultado').innerHTML = '';

  try {
    const [alt, dias, cultivos, cercana] = await Promise.all([
      altitud(punto.lat, punto.lon),
      clima(punto.lat, punto.lon),
      fetch(CULTIVOS_URL).then(r => r.json()),
      zonaCercana(punto.lat, punto.lon)
    ]);

    const cl = resumir(dias);
    const entrada = {
      altitud: alt,
      clima: { tmed: cl.tmed, lluviaMax: cl.lluviaMax },
      respuestas: {
        riego: $('selRiego').value,
        insumos: $('selInsumos').value
      }
    };

    const r = Motor.recomendar(entrada, cultivos);
    pintar(alt, cl, cercana, r);
  } catch (e) {
    $('resultado').innerHTML = `<div class="aviso">No pudimos consultar los datos (${e.message}). Revisa tu conexión y vuelve a intentar.</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Consultar NASA y calcular';
  }
}

$('btnProbar').onclick = probar;
iniciarMapa();
