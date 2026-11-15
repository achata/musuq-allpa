// One-time, guarded extraction of the incumbent embedded module. Run from repo root.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, content) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); };
let html = read('parcela_neugrac_interactiva.html');
const embedded = html.match(/<script type="application\/json" id="ma-i18n">([\s\S]*?)<\/script>/);
if (!embedded) throw new Error('Migration already applied or source changed');
const catalog = JSON.parse(embedded[1]);
const texts = {
  '← Volver': ['← Back', '← Kutiy'], 'Siguiente →': ['Next →', 'Qatiq →'],
  '¿Dónde está tu parcela?': ['Where is your plot?', '¿Maypitaq chakrayki kachkan?'],
  'Elige cómo quieres encontrarla.': ['Choose how to find it.', 'Imayna tarinaykita akllay.'],
  'Elige la forma más fácil para ti': ['Choose the easiest way for you', 'Aswan facil kaqta akllay'],
  'Puedes usar la ubicación de tu celular o buscar tu comunidad, distrito o provincia por nombre.': ['Use your phone location or search for your community, district or province by name.', 'Celularykipa tarikusqanta llamkachiy utaq llaqtaykipa sutinta maskay.'],
  'Usar mi GPS': ['Use my GPS', 'GPSniyta llamkachiy'], '📍 Usar mi GPS': ['📍 Use my GPS', '📍 GPSniyta llamkachiy'],
  'Ubicaremos el punto donde estás. Necesitas permitir el acceso a tu ubicación.': ['We will find where you are. Allow access to your location.', 'Maypi kasqaykita tarisaqku. Tarikusqaykiman yaykuyta saqiy.'],
  'O escribe el nombre de tu ubicación': ['Or enter your location name', 'Utaq maypi kasqaykipa sutinta qillqay'],
  'Escribe al menos 2 letras. Te mostraremos varias localidades mientras escribes; elige una para revisar el punto en el mapa.': ['Enter at least 2 letters. Choose a place from the results to check it on the map.', 'Iskay letrata qillqay. Llaqtata akllay mapapi qawanaykipaq.'],
  '✅ Esta es mi parcela': ['✅ This is my plot', '✅ Kaymi chakray'],
  '← Elegir otra forma de ubicarme': ['← Choose another location method', '← Huk imayna tarinata akllay'],
  '¿Qué sembraste en tu parcela la campaña pasada?': ['What did you grow last season?', '¿Qayna tarpuy mitapi imatataq tarpurqanki?'],
  'Toca lo que sembraste. Puedes elegir más de uno. Así no repetimos el mismo cultivo y la tierra descansa.': ['Select what you grew. You can choose more than one so we can plan crop rotation.', 'Tarpusqaykita akllay. Achkata akllawaqmi, allpa samananpaq.'],
  'No sé o no sembré nada': ['I do not know or did not grow anything', 'Mana yachanichu utaq mana tarpurqanichu'],
  'No sé': ['I do not know', 'Mana yachanichu'], '¿Cómo le das agua a tu cultivo?': ['How do you water your crops?', '¿Imaynataq tarpuykiyta qarpanki?'],
  'Elige la forma que más se parece a lo que haces.': ['Choose the method closest to yours.', 'Rurasqaykiman rikchakuqta akllay.'],
  'Solo lluvia': ['Rain only', 'Para sapallan'], 'No riego. Espero que llueva.': ['I rely on rainfall.', 'Parallata suyayani.'],
  'Manguera o canal': ['Hose or canal', 'Manguera utaq yarqa'], 'Le echo agua con balde, manguera o por canal.': ['I use a bucket, hose or canal.', 'Baldewan, manguerawan utaq yarqawan qarpani.'],
  'Aspersor': ['Sprinkler', 'Chaqchuq'], 'Tengo un aparato que riega como lluvia.': ['I have a sprinkler that waters like rain.', 'Parahina qarpana kanmi.'],
  'Goteo': ['Drip irrigation', 'Sutuywan qarpay'], 'Tengo tubos que dan agua gota a gota, cerca de la raíz.': ['Pipes drip water near the roots.', 'Saphipa qayllanpi tubokuna yakuta sutuchin.'],
  'Guano de corral': ['Animal manure', 'Kancha wanu'], 'Estiércol de animales, como vacas o cuyes.': ['Manure from cows or guinea pigs.', 'Waka utaq quwipa wanun.'],
  'Abono de tienda': ['Commercial fertilizer', 'Rantisqa wanu'], 'Abono comprado en la tienda agraria.': ['Fertilizer from an agricultural store.', 'Chakra tiendapi rantisqa wanu.'],
  'Pesticida': ['Pesticide', 'Kuru wañuchiq'], 'Lo que usas para matar insectos o plagas. Muchos le dicen veneno.': ['Products used to control pests.', 'Kurukunata wañuchinapaq llamkachasqa.'],
  'Ninguno': ['None', 'Manam mayqinninpas'], 'No uso nada de esto.': ['I use none of these.', 'Manam kaykunata llamkachanichu.'],
  '¿Cuándo quieres tener tu cosecha?': ['When would you like to harvest?', '¿Haykapi cosechayta munanki?'],
  'Toca los meses en que te gustaría cosechar. Si todavía no lo sabes, toca "No sé todavía".': ['Choose your harvest months, or select “I do not know yet”.', 'Cosechana killakunata akllay, utaq “Manaraq yachanichu” ñiy.'],
  '✅ Crear mi parcela': ['✅ Create my plot', '✅ Chakrayta kamay'], 'No sé todavía': ['I do not know yet', 'Manaraq yachanichu'],
  'Si no eliges meses, te recomendamos los mejores cultivos sin pensar en la fecha de cosecha.': ['Without harvest months, we recommend crops without a harvest date constraint.', 'Killakunata mana akllaptiyki, allin tarpuykunata akllasaqku.']
};
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const qu = ['Qulla puquy','Hatun puquy','Pawqar waray','Ayriway','Aymuray','Inti raymi','Anta situwa','Qhapaq situwa','Quya raymi','Uma raymi','Aya marqay','Qhapaq raymi'];
months.forEach((m, i) => texts[m] = [en[i], qu[i]]);
for (const code of catalog._meta.order) {
  catalog[code].survey = { back: code === 'en' ? '← Back' : code === 'qu' ? '← Kutiy' : '← Volver', texts: {} };
  for (const [key, values] of Object.entries(texts)) catalog[code].survey.texts[key] = code === 'en' ? values[0] : code === 'qu' ? values[1] : key;
  for (let i = 1; i <= 5; i++) catalog[code].survey.texts[`PASO ${i} DE 5`] = code === 'en' ? `STEP ${i} OF 5` : code === 'qu' ? `${i} PURIY / 5` : `PASO ${i} DE 5`;
}
write('data/i18n.json', JSON.stringify(catalog, null, 2) + '\n');
html = html.replace(embedded[0], '');
const data = html.match(/<script type="application\/json" id="ma-data">([\s\S]*?)<\/script>/);
write('data/interactive.json', JSON.stringify(JSON.parse(data[1]), null, 2) + '\n');
html = html.replace(data[0], '');
const script = html.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/);
let scene = script[0].replace(/^<script>\s*/, '').replace(/<\/script>$/, '').replace('(function () {', '(async function () {');
scene = scene.replace("const I18N = JSON.parse(document.getElementById('ma-i18n').textContent);", 'const I18N = await CampoI18n.ready;');
scene = scene.replace("const DATA = JSON.parse(document.getElementById('ma-data').textContent);", "const DATA = await fetch('/data/interactive.json').then(r => r.json());");
const start = scene.indexOf("ui.lang.addEventListener('click', () => {");
const end = scene.indexOf("ui.role.addEventListener", start);
scene = scene.slice(0, start) + "new LanguageSwitch(ui.lang);\ndocument.addEventListener('campo:language', () => { state.lang = CampoI18n.language; applyStatic(); });\n" + scene.slice(end);
scene = scene.replace("state.lang = code; store.set('lang', code); applyStatic();", "CampoI18n.setLanguage(code);");
scene = scene.replace(/\}\)\(\);\s*$/, "})().catch(error => { console.error('Interactive module failed', error); const message = document.querySelector('.ma-nogl'); if (message) { message.hidden = false; message.textContent = 'No se pudo cargar la vista interactiva. Recarga para reintentar.'; } });");
write('js/features/interactive/scene.js', scene);
html = html.replace(script[0], '<script src="js/features/interactive/scene.js" defer></script>');
write('parcela_neugrac_interactiva.html', html);
for (const name of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
  let page = read(name).replaceAll('js/motor.js', 'shared/domain/motor.js').replaceAll('js/ciclo.js', 'shared/domain/ciclo.js');
  page = page.replace('</head>', '<link rel="stylesheet" href="css/components.css">\n<script src="js/core/i18n.js" defer></script>\n<script src="js/ui/language-switch.js" defer></script>\n<script src="js/ui/shell.js" defer></script>\n</head>');
  page = page.replace('<head>', '<head>\n<script src="js/core/api.js"></script>\n<script src="shared/domain/climate.js"></script>');
  page = page.replaceAll('PASO 1 DE 4', 'PASO 1 DE 5').replaceAll('PASO 3 DE 4', 'PASO 3 DE 5').replaceAll('PASO 4 DE 4', 'PASO 4 DE 5');
  write(name, page);
}
let sw = read('sw.js').replace('campo-v11', 'campo-v12').replaceAll('js/motor.js', 'shared/domain/motor.js').replaceAll('js/ciclo.js', 'shared/domain/ciclo.js');
sw = sw.replace("const ARCHIVOS = [", "const ARCHIVOS = [\n  'js/core/api.js', 'js/core/i18n.js', 'js/ui/language-switch.js', 'js/ui/shell.js',\n  'shared/domain/climate.js', 'css/components.css', 'data/i18n.json', 'data/interactive.json', 'js/features/interactive/scene.js',");
sw = sw.replace("if (req.method !== 'GET'", "if (url.pathname.startsWith('/api/')) return;\n  if (req.method !== 'GET'");
write('sw.js', sw);
write('tests/motor.test.js', read('tests/motor.test.js').replace('../js/motor.js', '../shared/domain/motor.js'));
for (const name of ['js/ubicacion.js', 'js/ubicar.js', 'js/ubicar.chacra.js']) {
  let code = read(name);
  code = code.replaceAll('https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}', '/api/elevation?lat=${lat}&lon=${lon}');
  code = code.replaceAll('https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&limit=20&lang=es', '/api/search?q=${encodeURIComponent(texto)}');
  code = code.replaceAll('https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&limit=8&lang=es', '/api/search?q=${encodeURIComponent(texto)}');
  code = code.replaceAll("https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texto + ', Perú')}&format=json&limit=8&accept-language=es", '/api/search?provider=nominatim&q=${encodeURIComponent(texto)}');
  if (name === 'js/ubicar.js') code = code.replace(/async function clima\(lat, lon\)\{[\s\S]*?\n\}/, "async function clima(lat, lon){ return (await CampoApi.at('climate', lat, lon)).dias; }");
  write(name, code);
}
