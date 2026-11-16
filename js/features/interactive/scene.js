(async function () {
'use strict';
if (!document.getElementById('musuq-parcela')) return;
/* ==========================================================================
   1. Núcleo: utilidades, textos (i18n), modelo de la campaña y estado
   ========================================================================== */
const root = document.getElementById('musuq-parcela');
const visual = root.querySelector('.ma-visual');
const $ = (s, el) => (el || root).querySelector(s);
const $$ = (s, el) => Array.from((el || root).querySelectorAll(s));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2, HALF_PI = Math.PI / 2, DEG = Math.PI / 180;
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* PRNG con semilla: las texturas y el paisaje salen iguales en cada carga */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Resorte amortiguado (integración semi-implícita). o = {x, v} */
const spring = CampoMotion.spring;

const I18N = await CampoI18n.ready;
const context = await CampoInteractive.ready;
if (!context) return;
const DATA = context.data;
const LANGS = I18N._meta.order;

/* ---------- modelo de la campaña ---------- */
const PH = DATA.phases.map(p => ({ id: p.id, days: p.days, start: 0 }));
let _acc = 0;
PH.forEach(p => { p.start = _acc; _acc += p.days; });
const TOTAL = _acc;                       // días de la campaña
const SER = DATA.series;
const SEC_PER_PHASE = (DATA.sim && DATA.sim.secondsPerPhase) || 12;

const cumRain = [];
SER.rain.reduce((s, r, i) => (cumRain[i] = Math.round((s + r) * 10) / 10), 0);
const WEEKS = Math.ceil(TOTAL / 7);
const weekRain = Array.from({ length: WEEKS }, (_, w) =>
  Math.round(SER.rain.slice(w * 7, w * 7 + 7).reduce((s, r) => s + r, 0) * 10) / 10);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const phaseStats = PH.map(p => {
  const sl = k => SER[k].slice(p.start, p.start + p.days);
  return {
    ndvi: mean(sl('ndvi')), rain: sl('rain').reduce((s, v) => s + v, 0),
    tmin: mean(sl('tmin')), tmax: mean(sl('tmax')), sm: mean(sl('sm'))
  };
});

/* ---------- estado ---------- */
const store = {
  get(k) { try { return window.localStorage.getItem('musuq.' + k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem('musuq.' + k, v); } catch (e) { /* sin almacenamiento */ } }
};
const pick = (v, list, d) => (list.indexOf(v) >= 0 ? v : d);
const state = {
  lang: pick(store.get('lang'), LANGS, I18N._meta.default),
  role: 'farmer',
  env: pick(store.get('env'), ['space', 'field'], 'space'),
  stage: Math.max(0, context.parcel.interactive?.stage | 0),          // 0 = tierra virgen; n >= 1 → fase (n-1) % 4 de la campaña ⌊(n-1)/4⌋ + 1
  p: clamp(context.parcel.interactive?.p || 0, 0, .999),              // avance dentro de la fase, 0..1
  playing: false,
  hover: null        // día bajo el cursor en los gráficos
};
const phaseIdx = () => (state.stage === 0 ? -1 : (state.stage - 1) % 4);
const campaignNo = () => (state.stage === 0 ? 1 : Math.floor((state.stage - 1) / 4) + 1);
const phaseId = () => (state.stage === 0 ? 'virgin' : PH[phaseIdx()].id);
const dayFloat = () => { const i = phaseIdx(); return i < 0 ? 0 : PH[i].start + state.p * PH[i].days; };
const dayIdx = () => clamp(Math.floor(dayFloat()), 0, TOTAL - 1);

/* ---------- textos ---------- */
function lookup(obj, path) {
  const parts = path.split('.');
  for (let i = 0; i < parts.length && obj != null; i++) obj = obj[parts[i]];
  return obj;
}
function fill(s, vars) { return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s; }
function tr(path, vars) {
  let v = lookup(I18N[state.lang], path);
  if (v == null) v = lookup(I18N[I18N._meta.default], path);
  if (v == null) return path;
  return typeof v === 'string' ? fill(v, vars) : v;
}
function trCount(path, n) {
  const o = tr(path);
  if (typeof o === 'string') return fill(o, { n });
  return fill(n === 1 && o.one ? o.one : o.other, { n });
}
const _nf = {};
function num(x, d) {
  const loc = tr('lang.locale'), k = loc + d;
  if (!_nf[k]) _nf[k] = new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
  return _nf[k].format(x);
}

/* ==========================================================================
   2. Interfaz: textos, timer por fases, controles y panel del agrónomo
   ========================================================================== */
const ui = {
  bar: $('#ma-bar'), segs: $$('.ma-seg'), fills: $$('.ma-fill'),
  phaseName: $('#ma-phase-name'), until: $('#ma-until'), day: $('#ma-day'), camp: $('#ma-camp'),
  play: $('#ma-play'), tip: $('#ma-tip'), note: $('#ma-note'),
  env: $('#ma-env'), envLab: $('#ma-env-lab'), lang: document.getElementById('ma-lang'), role: $('#ma-role'),
  json: $('#ma-json'), table: $('#ma-table'), soil: $('#ma-soil'), soilFoot: $('#ma-soil-foot'),
  kpi: {}
};
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const GLYPH = {
  good: 'M5 1a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
  warn: 'M5 .8 9.6 9H.4z',
  crit: 'M5 .3 9.7 5 5 9.7.3 5z',
  neutral: 'M1 4h8v2H1z',
  now: 'M5 .6a4.4 4.4 0 1 0 0 8.8a4.4 4.4 0 0 0 0-8.8zm0 2.2a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 0 1 0-4.4z'
};
function makePill(el) {
  el.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path fill-rule="evenodd"/></svg><span></span>';
  return { el, path: el.querySelector('path'), txt: el.querySelector('span') };
}
function setPill(pill, status, text) {
  pill.el.dataset.s = status;
  pill.path.setAttribute('d', GLYPH[status]);
  pill.txt.textContent = text;
}
$$('.ma-kpi').forEach(k => {
  ui.kpi[k.dataset.kpi] = { val: $('.ma-kpi-val', k), pill: makePill($('.ma-pill', k)) };
});
function setVal(el, value, unit) {
  el.textContent = value;
  if (unit) el.appendChild(h('small', null, unit));
}

/* ---------- textos fijos (se vuelven a pintar al cambiar de idioma) ---------- */
function applyStatic() {
  document.documentElement.lang = tr('lang.html');
  $$('[data-i18n]').forEach(el => { el.textContent = tr(el.getAttribute('data-i18n')); });
  $$('[data-i18n-attr]').forEach(el => {
    el.getAttribute('data-i18n-attr').split(';').forEach(pair => {
      const i = pair.indexOf(':');
      el.setAttribute(pair.slice(0, i).trim(), tr(pair.slice(i + 1).trim()));
    });
  });
  $$('[data-days]').forEach(el => {
    el.textContent = tr('timer.days', { n: PH.find(p => p.id === el.getAttribute('data-days')).days });
  });

  ui.lang.textContent = I18N[state.lang].lang.code;
  ui.lang.setAttribute('aria-label', tr('controls.lang.hint') + ': ' + tr('lang.name'));
  ui.role.textContent = tr(state.role === 'farmer' ? 'integrated.showData' : 'integrated.hideData');
  ui.role.setAttribute('aria-expanded', String(state.role === 'agronomist'));
  ui.role.setAttribute('aria-controls', 'ma-agro');
  ui.role.setAttribute('aria-label', tr('controls.role.hint') + ': ' + tr('controls.role.' + state.role));
  ui.envLab.textContent = tr('controls.env.' + state.env);
  ui.env.setAttribute('aria-label', tr('controls.env.hint') + ': ' + tr('controls.env.' + state.env));
  ui.play.setAttribute('aria-label', state.playing && state.stage > 0 ? tr('controls.pause') : tr('controls.play'));

  const P = DATA.parcel;
  $('#ma-place').textContent = P.place;
  $('#ma-alt').textContent = (Number.isFinite(P.altitude_m) ? num(P.altitude_m, 0) : '—') + ' ' + tr('agro.meta.altUnit');
  $('#ma-crop').textContent = CampoI18n.crop(context.crop.id, context.crop.nombre);
  $('#ma-start').textContent = CampoI18n.t('integrated.notStarted');

  buildTable();
  buildSoil();
  charts.build();
  renderDynamic(true);
}

/* ---------- tabla de fases ---------- */
let tableRows = [];
function buildTable() {
  const T = k => tr('agro.table.' + k);
  ui.table.textContent = '';
  const thead = h('thead'), trh = h('tr');
  [['phase'], ['days', 1], ['tasks'], ['ndvi', 1], ['rain', 1], ['tmin', 1], ['tmax', 1], ['sm', 1], ['state']]
    .forEach(c => { const th = h('th', c[1] ? 'num' : null, T(c[0])); th.scope = 'col'; trh.appendChild(th); });
  thead.appendChild(trh);
  const tbody = h('tbody');
  tableRows = PH.map((p, i) => {
    const s = phaseStats[i], row = h('tr');
    row.style.setProperty('--c', 'var(--ph-' + p.id + ')');
    const name = h('td'); name.appendChild(h('span', 'ma-sw')); name.appendChild(document.createTextNode(tr('phases.' + p.id + '.name')));
    row.appendChild(name);
    row.appendChild(h('td', 'num', (p.start + 1) + '–' + (p.start + p.days)));
    row.appendChild(h('td', 'ma-tasks', tr('phases.' + p.id + '.tasks')));
    row.appendChild(h('td', 'num', num(s.ndvi, 2)));
    row.appendChild(h('td', 'num', num(s.rain, 0)));
    row.appendChild(h('td', 'num', num(s.tmin, 1)));
    row.appendChild(h('td', 'num', num(s.tmax, 1)));
    row.appendChild(h('td', 'num', num(s.sm, 1)));
    const st = h('td'); const pill = makePill(h('span', 'ma-pill')); st.appendChild(pill.el); row.appendChild(st);
    tbody.appendChild(row);
    return { row, pill };
  });
  ui.table.appendChild(thead); ui.table.appendChild(tbody);
  updateTableState();
}
function updateTableState() {
  const pi = phaseIdx();
  tableRows.forEach((r, i) => {
    const cur = i === pi, done = pi >= 0 && i < pi;
    r.row.classList.toggle('is-current', cur);
    setPill(r.pill, done ? 'good' : cur ? 'now' : 'neutral', tr('agro.table.' + (done ? 'done' : cur ? 'current' : 'pending')));
  });
}

/* ---------- análisis de suelo ---------- */
function buildSoil() {
  ui.soil.textContent = '';
  DATA.soil.forEach(s => {
    const li = h('li');
    const dec = s.value < 1 ? 2 : s.value < 20 ? 1 : 0;
    li.appendChild(h('span', 'lab', tr('agro.soil.' + s.id)));
    li.appendChild(h('span', 'val', (s.value == null ? '—' : num(s.value, dec)) + (s.unit ? ' ' + s.unit : '')));
    const m = h('span', 'ma-meter'), band = h('i'), mark = h('b');
    const pct = v => clamp((v - s.scale[0]) / (s.scale[1] - s.scale[0]), 0, 1) * 100;
    band.style.left = pct(s.ref[0]) + '%'; band.style.width = (pct(s.ref[1]) - pct(s.ref[0])) + '%';
    mark.style.left = pct(s.value) + '%';
    if (s.value == null) mark.hidden = true;
    m.appendChild(band); m.appendChild(mark);
    m.setAttribute('role', 'img');
    m.setAttribute('aria-label', tr('agro.soil.ref') + ': ' + num(s.ref[0], dec) + '–' + num(s.ref[1], dec) + (s.unit ? ' ' + s.unit : ''));
    li.appendChild(m);
    ui.soil.appendChild(li);
  });
  ui.soilFoot.textContent = '';
  const a = h('span'); a.appendChild(h('i')); a.appendChild(document.createTextNode(tr('agro.soil.ref')));
  ui.soilFoot.appendChild(a);
  ui.soilFoot.appendChild(h('span', null, tr('agro.soil.texture') + ': ' + CampoI18n.t('integrated.unrecorded')));
}

/* ---------- indicadores y registro del día ---------- */
function updateAgro(d) {
  const S = k => tr('agro.status.' + k);
  const ndvi = SER.ndvi[d], sm = SER.sm[d], tmin = SER.tmin[d], tmax = SER.tmax[d], rain = SER.rain[d];
  const pi = phaseIdx();

  setVal(ui.kpi.ndvi.val, num(ndvi, 2));
  let nk = 'bare', ns = 'neutral';
  if (pi === 3 && ndvi >= 0.2) { nk = 'ripening'; ns = 'good'; }
  else if (ndvi >= 0.62) { nk = 'peak'; ns = 'good'; }
  else if (ndvi >= 0.3) { nk = 'growing'; ns = 'good'; }
  else if (ndvi >= 0.2) { nk = 'emerging'; ns = 'good'; }
  setPill(ui.kpi.ndvi.pill, ns, S(nk));

  const opt = DATA.thresholds.sm_optimal;
  setVal(ui.kpi.sm.val, num(sm, 1), '% vol.');
  if (sm < opt[0]) setPill(ui.kpi.sm.pill, 'warn', S('low'));
  else if (sm > opt[1]) setPill(ui.kpi.sm.pill, 'warn', S('high'));
  else setPill(ui.kpi.sm.pill, 'good', S('optimal'));

  const frost = tmin <= DATA.thresholds.frost_c;
  setVal(ui.kpi.temp.val, num(tmin, 1) + ' / ' + num(tmax, 1), '°C');
  setPill(ui.kpi.temp.pill, frost ? 'crit' : 'good', S(frost ? 'frost' : 'noFrost'));

  setVal(ui.kpi.rain.val, num(cumRain[d], 0), 'mm');
  setPill(ui.kpi.rain.pill, 'neutral', tr('agro.kpi.rainToday', { n: num(rain, 1) }));

  const alerts = [];
  if (frost) alerts.push('frost');
  if (sm < opt[0]) alerts.push('low_soil_moisture');
  ui.json.textContent = JSON.stringify({
    parcel_id: DATA.parcel.id,
    crop: DATA.parcel.crop,
    location: context.parcel.ubicacion,
    profile: context.parcel.perfil,
    cycle_source: 'catalogue',
    campaign: campaignNo(),
    phase: phaseId(),
    day: state.stage === 0 ? 0 : d + 1,
    ndvi: ndvi,
    soil_moisture_pct: sm,
    tmin_c: tmin,
    tmax_c: tmax,
    rain_mm: rain,
    rain_to_date_mm: cumRain[d],
    alerts: alerts,
    simulated: true,
    observations: CampoInteractive.weather
  }, null, 2);
}

document.getElementById('ma-download').addEventListener('click', () => { document.getElementById('ma-download').href = 'data:application/json;charset=utf-8,' + encodeURIComponent(ui.json.textContent); });

/* ---------- lo que cambia con el tiempo ---------- */
const last = {};
function renderDynamic(force) {
  $('#ma-prev').disabled = state.stage === 0;
  const pi = phaseIdx(), st = state.stage;
  for (let i = 0; i < 4; i++) {
    const f = pi < 0 ? 0 : i < pi ? 1 : i === pi ? state.p : 0;
    const q = Math.round(f * 1000) / 1000;
    if (force || last['f' + i] !== q) { ui.fills[i].style.setProperty('--f', q); last['f' + i] = q; }
  }
  const shown = st === 0 ? 0 : Math.min(TOTAL, Math.floor(dayFloat()) + 1);
  const key = st + '|' + shown + '|' + state.lang;
  if (force || key !== last.key) {
    last.key = key;
    ui.segs.forEach((s, i) => {
      s.classList.toggle('is-active', i === pi);
      s.classList.toggle('is-done', pi >= 0 && i < pi);
    });
    root.setAttribute('data-stage', phaseId());
    ui.bar.setAttribute('aria-valuemax', TOTAL);
    ui.bar.setAttribute('aria-valuenow', shown);
    ui.bar.setAttribute('aria-valuetext', tr('phases.' + phaseId() + '.name') + ', ' + tr('timer.day', { d: shown, t: TOTAL }));
    ui.day.textContent = tr('timer.day', { d: shown, t: TOTAL });
    ui.camp.textContent = tr('timer.campaign', { n: campaignNo() });
    ui.until.textContent = st === 0
      ? tr('phases.virgin.until')
      : trCount('phases.' + PH[pi].id + '.until', Math.max(1, Math.ceil(PH[pi].days * (1 - state.p))));
    updateAgro(dayIdx());
  }
  const pkey = st + '|' + state.lang;
  if (force || pkey !== last.pkey) {
    last.pkey = pkey;
    ui.phaseName.textContent = tr('phases.' + phaseId() + '.name');
    if (window.CampoExperience) CampoExperience.setPhase(phaseId());
    else ui.tip.textContent = CampoInteractive.tip(phaseId()) || tr('phases.' + phaseId() + '.tip');
    ui.note.textContent = tr('phases.' + phaseId() + '.note');
    updateTableState();
  }
  const playKey = state.playing + '|' + (st > 0) + '|' + state.lang;
  if (force || playKey !== last.playKey) {
    last.playKey = playKey;
    const running = state.playing && st > 0;
    ui.play.setAttribute('aria-pressed', running ? 'false' : 'true');
    ui.play.setAttribute('aria-label', running ? tr('controls.pause') : tr('controls.play'));
    root.setAttribute('data-playing', running ? 'true' : 'false');
  }
  charts.cursor();
}

/* ---------- cambio de fase: un giro a la derecha avanza, uno a la izquierda retrocede ---------- */
let scene = null, mascot = null;
function advance(dir) {
  const next = state.stage + dir;
  if (next < 0) return false;
  state.stage = next;
  state.p = 0;
  const parcel = Almacen.todas().find(p => p.id === context.parcel.id);
  if (parcel) Almacen.guardar({ ...parcel, interactive: { ...parcel.interactive, cultivo: context.crop.id, stage: state.stage, p: state.p } });
  if (scene) scene.kick(dir);
  if (mascot) mascot.cheer();
  renderDynamic(true);
  return true;
}

/* ---------- controles ---------- */
$('#ma-prev').addEventListener('click', () => advance(-1));
$('#ma-next').addEventListener('click', () => advance(1));
window.addEventListener('pagehide', () => {
  const parcel = Almacen.todas().find(p => p.id === context.parcel.id);
  // The crop selector saves before navigating; the old scene must not undo it.
  if (parcel && (!parcel.interactive?.cultivo || parcel.interactive.cultivo === context.crop.id)) {
    Almacen.guardar({ ...parcel, interactive: { ...parcel.interactive, cultivo: context.crop.id, stage: state.stage, p: state.p } });
  }
});
ui.play.addEventListener('click', () => {
  if (state.stage === 0) { state.playing = true; advance(1); }
  else { state.playing = !state.playing; renderDynamic(true); }
});
ui.env.addEventListener('click', () => {
  state.env = state.env === 'space' ? 'field' : 'space';
  store.set('env', state.env);
  root.setAttribute('data-env', state.env);
  ui.envLab.textContent = tr('controls.env.' + state.env);
  ui.env.setAttribute('aria-label', tr('controls.env.hint') + ': ' + tr('controls.env.' + state.env));
  if (scene) scene.setEnv(state.env);
  if (mascot) mascot.setEnv(state.env);
});
document.addEventListener('campo:language', () => { state.lang = CampoI18n.language; applyStatic(); });
ui.role.addEventListener('click', () => {
  state.role = state.role === 'farmer' ? 'agronomist' : 'farmer';
  store.set('role', state.role);
  root.setAttribute('data-role', state.role);
  ui.role.textContent = tr(state.role === 'farmer' ? 'integrated.showData' : 'integrated.hideData');
  ui.role.setAttribute('aria-expanded', String(state.role === 'agronomist'));
  ui.role.setAttribute('aria-controls', 'ma-agro');
  ui.role.setAttribute('aria-label', tr('controls.role.hint') + ': ' + tr('controls.role.' + state.role));
});

/* ==========================================================================
   3. Gráficos del agrónomo (SVG propio, sin librerías)
   Los cuatro comparten el eje X (día de campaña), la franja de fases y un
   cursor que avanza con el timer de la parcela.
   ========================================================================== */
const charts = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const H = 150, PAD_L = 30, PAD_T = 8, PAD_B = 30;
  const sv = (name, attrs, parent, text) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const SPEC = {
    ndvi: { series: [{ key: 'ndvi', cls: '' }], y: [0, 0.8], ticks: [0, 0.2, 0.4, 0.6, 0.8], dec: 2, tdec: 1, area: true },
    sm: { series: [{ key: 'sm', cls: '' }], y: [10, 40], ticks: [10, 20, 30, 40], dec: 1, tdec: 0, band: DATA.thresholds.sm_optimal, unit: ' %' },
    temp: { series: [{ key: 'tmax', cls: '', lab: 'max' }, { key: 'tmin', cls: 'b', lab: 'min' }], y: [-4, 24], ticks: [0, 10, 20], dec: 1, tdec: 0, zero: true, frost: true, unit: ' °C' },
    rain: { bars: true, y: [0, 40], ticks: [0, 20, 40], dec: 0, tdec: 0, unit: ' mm' }
  };
  const figs = {};
  let lastShown = null;

  function build() {
    $$('.ma-chart').forEach(fig => {
      const id = fig.dataset.chart, spec = SPEC[id];
      fig.textContent = '';
      const head = h('div', 'ma-chart-head');
      head.appendChild(h('span', 'ma-chart-title', tr('agro.charts.' + id)));
      const read = h('span', 'ma-chart-read'), rd = h('span'), rv = h('strong');
      read.appendChild(rd); read.appendChild(rv); head.appendChild(read);
      fig.appendChild(head);
      const legend = h('div', 'ma-chart-legend');
      const item = (cls, text) => { const s = h('span'); s.appendChild(h('i', cls)); s.appendChild(document.createTextNode(text)); legend.appendChild(s); };
      if (id === 'temp') { item('', tr('agro.charts.max')); item('b', tr('agro.charts.min')); item('dot', tr('agro.charts.frost')); }
      if (id === 'sm') item('band', tr('agro.charts.optimal') + ' ' + spec.band[0] + '–' + spec.band[1] + ' %');
      fig.appendChild(legend);
      const svg = sv('svg', { class: 'ma-plot', role: 'img', tabindex: '0' });
      fig.appendChild(svg);
      figs[id] = { id, spec, svg, rd, rv, title: tr('agro.charts.' + id), w: 0 };
      svg.addEventListener('pointermove', e => hoverFromEvent(figs[id], e));
      svg.addEventListener('pointerdown', e => hoverFromEvent(figs[id], e));
      svg.addEventListener('pointerleave', () => setHover(null));
      svg.addEventListener('blur', () => setHover(null));
      svg.addEventListener('keydown', e => {
        const step = e.shiftKey ? 7 : 1, cur = state.hover == null ? dayIdx() : state.hover;
        if (e.key === 'ArrowRight') { setHover(clamp(cur + step, 0, TOTAL - 1)); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { setHover(clamp(cur - step, 0, TOTAL - 1)); e.preventDefault(); }
        else if (e.key === 'Escape') setHover(null);
      });
    });
    drawAll(true);
  }

  function hoverFromEvent(f, e) {
    if (!f.g) return;
    const r = f.svg.getBoundingClientRect();
    if (!r.width) return;
    const xx = (e.clientX - r.left) * (f.w / r.width);
    setHover(clamp(Math.floor((xx - PAD_L) / f.g.pw * TOTAL), 0, TOTAL - 1));
  }
  function setHover(d) {
    if (state.hover === d) return;
    state.hover = d;
    lastShown = null;
    cursor();
  }

  function drawAll(force) {
    for (const id in figs) draw(figs[id], force);
    lastShown = null;
    cursor();
  }

  function draw(f, force) {
    const W = Math.round(f.svg.clientWidth);
    if (W < 120) return;
    if (!force && W === f.w) return;
    f.w = W;
    const spec = f.spec, svg = f.svg;
    svg.textContent = '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const padR = spec.series && spec.series.length > 1 ? 34 : 8;
    const pw = W - PAD_L - padR, ph = H - PAD_T - PAD_B;
    const x = d => PAD_L + d / TOTAL * pw;
    const y = v => PAD_T + (1 - (v - spec.y[0]) / (spec.y[1] - spec.y[0])) * ph;
    f.g = { x, y, pw, ph };

    if (spec.band) sv('rect', { class: 'band', x: x(0), y: y(spec.band[1]), width: pw, height: y(spec.band[0]) - y(spec.band[1]) }, svg);
    spec.ticks.forEach(t => {
      sv('line', { class: spec.zero && t === 0 ? 'zero' : 'grid', x1: x(0), x2: x(TOTAL), y1: y(t), y2: y(t) }, svg);
      sv('text', { x: PAD_L - 6, y: y(t) + 4, 'text-anchor': 'end' }, svg, num(t, spec.tdec));
    });

    f.bars = null;
    if (spec.bars) {
      f.bars = weekRain.map((v, w) => {
        const xa = x(w * 7), xb = x(Math.min(TOTAL, w * 7 + 7));
        const bw = Math.max(2, Math.min(24, xb - xa - 2)), x0 = (xa + xb) / 2 - bw / 2, x1 = x0 + bw;
        const y0 = y(0), top = Math.min(y0 - 1, y(v)), r = Math.min(3, (y0 - top) / 2, bw / 2);
        if (v <= 0) return null;
        return sv('path', {
          class: 'bar',
          d: 'M' + x0 + ' ' + y0 + 'V' + (top + r) + 'Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top +
             'H' + (x1 - r) + 'Q' + x1 + ' ' + top + ' ' + x1 + ' ' + (top + r) + 'V' + y0 + 'Z'
        }, svg);
      });
    } else {
      spec.series.forEach(s => {
        const pts = SER[s.key].map((v, i) => x(i + 0.5).toFixed(1) + ' ' + y(v).toFixed(1));
        if (spec.area) sv('path', { class: 'area', d: 'M' + pts.join('L') + 'L' + x(TOTAL - 0.5) + ' ' + y(spec.y[0]) + 'L' + x(0.5) + ' ' + y(spec.y[0]) + 'Z' }, svg);
        sv('path', { class: 'line ' + s.cls, d: 'M' + pts.join('L') }, svg);
        if (s.lab) sv('text', { class: 'end', x: x(TOTAL) + 5, y: y(SER[s.key][TOTAL - 1]) + 4 }, svg, tr('agro.charts.' + s.lab));
      });
      if (spec.frost) SER.tmin.forEach((v, i) => {
        if (v <= DATA.thresholds.frost_c) sv('circle', { class: 'frost', cx: x(i + 0.5), cy: y(v), r: 4.5 }, svg);
      });
    }

    /* franja de fases y eje de días */
    PH.forEach((p, i) => {
      const xa = x(p.start) + (i ? 1 : 0), xb = x(p.start + p.days) - (i < 3 ? 1 : 0);
      sv('rect', { x: xa, y: H - PAD_B + 6, width: Math.max(1, xb - xa), height: 4, rx: 2, fill: 'var(--ph-' + p.id + ')' }, svg);
    });
    [0, 40, 80, 120, 160].forEach(d => {
      sv('text', { x: x(d), y: H - 5, 'text-anchor': d === 0 ? 'start' : 'middle' }, svg, String(d));
    });

    const mk = (cls, dotCls) => {
      const g = sv('g', {}, svg);
      sv('line', { class: cls, x1: 0, x2: 0, y1: PAD_T, y2: PAD_T + ph }, g);
      const dots = spec.bars ? [] : spec.series.map(() => sv('circle', { class: dotCls, r: 4, cx: 0, cy: 0 }, g));
      return { g, dots };
    };
    f.cur = mk('cur', 'dot');
    f.hov = mk('hov', 'hdot');
    f.hov.g.style.display = 'none';
  }

  function place(f, m, dFloat, d) {
    const X = f.g.x(dFloat);
    m.g.setAttribute('transform', 'translate(' + X.toFixed(1) + ' 0)');
    m.dots.forEach((c, i) => c.setAttribute('cy', f.g.y(SER[f.spec.series[i].key][d]).toFixed(1)));
  }

  /* se llama en cada cuadro: mueve el cursor del timer y refresca la lectura */
  function cursor() {
    const d = dayIdx(), df = clamp(dayFloat(), 0, TOTAL), hov = state.hover;
    const shown = (hov == null ? d : hov) + '|' + (hov == null) + '|' + state.stage;
    const refresh = shown !== lastShown;
    lastShown = shown;
    for (const id in figs) {
      const f = figs[id];
      if (!f.g) continue;
      place(f, f.cur, df, d);
      if (!refresh) continue;
      const rd = hov == null ? d : hov;
      f.hov.g.style.display = hov == null ? 'none' : '';
      if (hov != null) place(f, f.hov, hov + 0.5, hov);
      let label, value;
      if (f.spec.bars) {
        const w = Math.min(WEEKS - 1, Math.floor(rd / 7));
        f.bars.forEach((b, i) => { if (b) b.classList.toggle('on', i === w); });
        label = tr('agro.charts.week', { w: w + 1 });
        value = num(weekRain[w], 0) + f.spec.unit;
      } else {
        label = tr('agro.charts.day', { d: rd + 1 });
        value = id === 'temp'
          ? num(SER.tmin[rd], 1) + ' / ' + num(SER.tmax[rd], 1) + f.spec.unit
          : num(SER[f.spec.series[0].key][rd], f.spec.dec) + (f.spec.unit || '');
      }
      f.rd.textContent = label;
      f.rv.textContent = value;
      f.svg.setAttribute('aria-label', f.title + '. ' + label + ': ' + value);
    }
  }

  /* redibuja cuando el panel cambia de ancho */
  let timer = 0, lastRun = 0;
  function onResize() {
    const now = performance.now();
    clearTimeout(timer);
    if (now - lastRun > 140) { lastRun = now; drawAll(false); }
    timer = setTimeout(() => { lastRun = performance.now(); drawAll(false); }, 160);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe($('#ma-charts'));
  else window.addEventListener('resize', onResize);

  return { build, cursor };
})();

/* ==========================================================================
   4. Escena 3D y físicas (Three.js)
   - Parcela 1×1 tipo vóxel, armada como un cubo Rubik de 3 capas.
   - Giro a 90° con resortes de torsión: la capa de arriba sigue al dedo y las
     de abajo la alcanzan con retraso.
   - Espacio: microgravedad, terrones en órbita (gravedad central), satélite
     en órbita kepleriana, estrellas y la Tierra (imagen NASA Blue Marble).
   - Campo: gravedad uniforme, rebotes contra el suelo, polvo al caer.
   ========================================================================== */
function createScene() {
  const T = window.THREE;
  if (!T) return null;
  const canvas = $('.ma-gl'), slotEl = $('.ma-slot');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { return null; }
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);

  const scn = new T.Scene();
  const FOV = 30;
  const camera = new T.PerspectiveCamera(FOV, 1, 0.1, 900);
  const CAM0 = new T.Vector3(0, 3.1, 5.7), LOOK = new T.Vector3(0, 0, 0);
  const CAM_DIST = CAM0.distanceTo(LOOK);
  const fwd = LOOK.clone().sub(CAM0).normalize();
  const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize();
  const up = new T.Vector3().crossVectors(right, fwd).normalize();
  camera.position.copy(CAM0); camera.lookAt(LOOK);

  const SUN = new T.Vector3(0.62, 0.55, 0.56).normalize();
  const hemi = new T.HemisphereLight(0xcfd9ff, 0x3b4474, 0.72);
  const key = new T.DirectionalLight(0xffffff, 0.74);
  key.position.copy(SUN).multiplyScalar(10);
  const bounce = new T.DirectionalLight(0x3fe0c0, 0.3);      // reflejo de la Tierra sobre la cara en sombra
  bounce.position.set(-8, -3, 4);
  scn.add(hemi, key, bounce);
  const BOUNCE_SPACE = new T.Color(0x3fe0c0), BOUNCE_FIELD = new T.Color(0xef8f7f);
  const KEY_SPACE = new T.Color(0xffffff), KEY_FIELD = new T.Color(0xffe2b6);

  const C = hex => new T.Color(hex);
  const rnd = rng(7);

  /* ------------------------------------------------------------------ *
   *  Texturas pixeladas (16 px por cubito, como un bloque de Minecraft)  *
   * ------------------------------------------------------------------ */
  const mkCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  const pixTex = c => {
    const t = new T.CanvasTexture(c);
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    return t;
  };
  const pickc = (r, arr) => arr[(r() * arr.length) | 0];
  const SOIL = {
    humus: ['#3f2a20', '#4a3226', '#55392b', '#372419'],
    sub: ['#6b4731', '#765038', '#80593f', '#61402c'],
    rock: ['#5b4d49', '#665853', '#51443f', '#70625c'],
    stone: ['#8d7f78', '#a39589']
  };
  const BAND = {
    virgin: ['#8fa85a', '#7c9650', '#a9b866', '#c2b05a'],
    plow: ['#EF476F', '#d93b62', '#f4688a'],
    sow: ['#5B8DEF', '#4a7bdc', '#7aa4f5'],
    grow: ['#06D6A0', '#05b98a', '#35e3b6'],
    harvest: ['#FFD166', '#f0bf4d', '#ffdf8f']
  };
  const GLYPHS = {
    plow: ['..........', '.##....##.', '#..#..#..#', '....##....', '..........', '.##....##.', '#..#..#..#', '....##....', '..........', '..........'],
    sow: ['....##....', '...####...', '..######..', '..######..', '...####...', '....##....', '..........', '.########.', '..........', '..........'],
    grow: ['.##....##.', '####..####', '.########.', '..######..', '....##....', '....##....', '....##....', '...####...', '..........', '..........'],
    harvest: ['....##....', '...####...', '.##.##.##.', '..######..', '.##.##.##.', '..######..', '....##....', '....##....', '....##....', '..........']
  };
  function paintSide(cv, kind, seed) {
    const g = cv.getContext('2d'), r = rng(seed);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const yy = y + Math.round(Math.sin(x * 0.5 + seed) * 1.3 + (r() - 0.5) * 1.6);
      g.fillStyle = pickc(r, yy < 15 ? SOIL.humus : yy < 32 ? SOIL.sub : SOIL.rock);
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = pickc(r, SOIL.stone);
      g.fillRect((r() * 46) | 0, 18 + ((r() * 28) | 0), r() < 0.4 ? 2 : 1, 1);
    }
    const band = BAND[kind];
    for (let x = 0; x < 48; x++) {
      const d = 3 + ((r() * 3) | 0);
      for (let y = 0; y < d; y++) { g.fillStyle = pickc(r, band); g.fillRect(x, y, 1, 1); }
    }
    const gl = GLYPHS[kind];
    if (gl) {
      for (let pass = 0; pass < 2; pass++) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
        if (gl[y][x] !== '#') continue;
        g.fillStyle = pass === 0 ? 'rgba(0,0,0,.42)' : band[0];
        g.fillRect(19 + x + (pass === 0 ? 1 : 0), 20 + y + (pass === 0 ? 1 : 0), 1, 1);
      }
    }
  }
  function paintPattern(cv, fn, seed) {
    const g = cv.getContext('2d'), r = rng(seed);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { g.fillStyle = fn(x, y, r); g.fillRect(x, y, 1, 1); }
  }
  const sideCv = { virgin: mkCanvas(48, 48), plow: mkCanvas(48, 48), sow: mkCanvas(48, 48), grow: mkCanvas(48, 48), harvest: mkCanvas(48, 48) };
  Object.keys(sideCv).forEach((k, i) => paintSide(sideCv[k], k, 11 + i * 7));
  const patVirgin = mkCanvas(48, 48), patDry = mkCanvas(48, 48), patTilled = mkCanvas(48, 48), botCv = mkCanvas(48, 48);
  paintPattern(patVirgin, (x, y, r) => {
    const v = r();
    return v < 0.36 ? pickc(r, ['#7f9450', '#8fa85a', '#6f8748']) : v < 0.45 ? pickc(r, ['#b7a055', '#c9b45f']) : pickc(r, ['#6f6238', '#7a6c3e', '#65592f']);
  }, 3);
  paintPattern(patDry, (x, y, r) => pickc(r, ['#8a7152', '#93795a', '#80684b', '#9c8262']), 5);
  paintPattern(patTilled, (x, y, r) => (y % 8 < 4 ? pickc(r, ['#5f3f2c', '#6a4733', '#573826']) : pickc(r, ['#3d281d', '#453024', '#372218'])), 9);
  paintPattern(botCv, (x, y, r) => pickc(r, SOIL.rock), 13);
  const topCv = mkCanvas(48, 48), topCtx = topCv.getContext('2d');
  topCtx.drawImage(patVirgin, 0, 0);
  const topTex = pixTex(topCv);
  const PATS = [patVirgin, patDry, patTilled];

  /* la cara +z muestra "tierra virgen" hasta que arranca la campaña y luego "cosecha" */
  const frontCv = mkCanvas(48, 48), frontCtx = frontCv.getContext('2d');
  frontCtx.drawImage(sideCv.virgin, 0, 0);
  const frontTex = pixTex(frontCv);
  let frontKind = 'virgin';

  /* ------------------------------------------------------------------ *
   *  Cubo: 27 cubitos en 3 capas horizontales                           *
   * ------------------------------------------------------------------ */
  const GAP = 0.012, BASE_YAW = 28 * DEG;
  const lam = map => new T.MeshLambertMaterial({ map: map });
  const cubeMats = [
    lam(pixTex(sideCv.grow)),     // +x  cultivo
    lam(pixTex(sideCv.plow)),     // -x  arar
    lam(topTex),                  // +y  la tierra que se trabaja
    lam(pixTex(botCv)),           // -y
    lam(frontTex),                // +z  virgen → cosecha
    lam(pixTex(sideCv.sow)),      // -z  siembra
    new T.MeshLambertMaterial({ color: 0x1c110b })   // caras internas
  ];
  const FACES = [
    { n: [1, 0, 0], U: [0, 0, -1], V: [0, 1, 0], out: (x, y, z) => x === 2, cell: (x, y, z) => [2 - z, y] },
    { n: [-1, 0, 0], U: [0, 0, 1], V: [0, 1, 0], out: (x, y, z) => x === 0, cell: (x, y, z) => [z, y] },
    { n: [0, 1, 0], U: [1, 0, 0], V: [0, 0, -1], out: (x, y, z) => y === 2, cell: (x, y, z) => [x, 2 - z] },
    { n: [0, -1, 0], U: [1, 0, 0], V: [0, 0, 1], out: (x, y, z) => y === 0, cell: (x, y, z) => [x, z] },
    { n: [0, 0, 1], U: [1, 0, 0], V: [0, 1, 0], out: (x, y, z) => z === 2, cell: (x, y, z) => [x, y] },
    { n: [0, 0, -1], U: [-1, 0, 0], V: [0, 1, 0], out: (x, y, z) => z === 0, cell: (x, y, z) => [2 - x, y] }
  ];
  function buildSlab(iy) {
    const buckets = [[], [], [], [], [], [], []];
    const hc = (1 / 3 - GAP) / 2;
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      const c = [(ix - 1) / 3, (iy - 1) / 3, (iz - 1) / 3];
      FACES.forEach((f, fi) => {
        const outer = f.out(ix, iy, iz), cell = outer ? f.cell(ix, iy, iz) : [0, 0];
        const u0 = outer ? cell[0] / 3 : 0, u1 = outer ? (cell[0] + 1) / 3 : 1;
        const v0 = outer ? cell[1] / 3 : 0, v1 = outer ? (cell[1] + 1) / 3 : 1;
        const q = { p: [], n: f.n, uv: [u0, v0, u1, v0, u1, v1, u0, v1] };
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(s => {
          for (let a = 0; a < 3; a++) q.p.push(c[a] + (f.n[a] + s[0] * f.U[a] + s[1] * f.V[a]) * hc);
        });
        buckets[outer ? fi : 6].push(q);
      });
    }
    const P = [], N = [], UV = [], IDX = [];
    const geo = new T.BufferGeometry();
    let vi = 0, start = 0;
    buckets.forEach((qs, mi) => {
      qs.forEach(q => {
        P.push.apply(P, q.p);
        for (let k = 0; k < 4; k++) N.push(q.n[0], q.n[1], q.n[2]);
        UV.push.apply(UV, q.uv);
        IDX.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        vi += 4;
      });
      if (qs.length) { geo.addGroup(start, qs.length * 6, mi); start += qs.length * 6; }
    });
    geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
    geo.setIndex(IDX);
    return new T.Mesh(geo, cubeMats);
  }
  const rig = new T.Group();
  scn.add(rig);
  const slabs = [2, 1, 0].map(iy => { const g = new T.Group(); g.add(buildSlab(iy)); rig.add(g); return g; });

  /* ------------------------------------------------------------------ *
   *  Cultivo en vóxeles sobre la cara superior                          *
   * ------------------------------------------------------------------ */
  const TOP = 0.5 - GAP / 2, CELL = 1 / 12, RH = 0.05, PLANT_H = 0.3;
  const R0 = 0, D0 = 72, S0 = 116, P0 = 152, NVOX = 152 + 36 * 8;
  const vox = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), NVOX);
  vox.frustumCulled = false;
  slabs[0].add(vox);
  const irrigation = new T.Group();
  const irrigationType = context.parcel.perfil.riego;
  const pipeMaterial = new T.MeshLambertMaterial({ color:irrigationType === 'goteo' ? 0x283d42 : 0x5896be });
  if (irrigationType !== 'lluvia') {
    for (let row=0;row<(irrigationType === 'aspersor' ? 1 : 6);row++) {
      const pipe = new T.Mesh(new T.BoxGeometry(irrigationType === 'aspersor' ? .02 : .96, irrigationType === 'aspersor' ? .18 : .012, .016), pipeMaterial);
      pipe.position.set(0, TOP + RH + (irrigationType === 'aspersor' ? .09 : .01), irrigationType === 'aspersor' ? 0 : -.46 + row/6);
      irrigation.add(pipe);
    }
    slabs[0].add(irrigation);
  }

  const rx = new Float32Array(72), rz = new Float32Array(72), plowOrder = new Uint8Array(72), rtint = new Float32Array(72);
  const ridge = new Float32Array(72), ridgeV = new Float32Array(72), fresh = new Float32Array(72).fill(1);
  const cellState = new Uint8Array(72), cellDrawn = new Int8Array(72).fill(0), plowed = new Uint8Array(72);
  for (let k = 0; k < 72; k++) {
    const r = (k / 12) | 0, c = k % 12;
    rx[k] = -0.5 + (c + 0.5) * CELL; rz[k] = -0.5 + (r * 2 + 0.5) * CELL;
    plowOrder[k] = r * 12 + (r % 2 ? 11 - c : c);          // recorrido en zigzag, como un arado
    rtint[k] = 0.92 + rnd() * 0.16;
  }
  const px = new Float32Array(36), pz = new Float32Array(36), sowOrder = new Uint8Array(36), vary = new Float32Array(36), pink = new Uint8Array(36);
  const grow = new Float32Array(36), growV = new Float32Array(36), seedVis = new Float32Array(36), seedY = new Float32Array(36), seedVy = new Float32Array(36);
  const stub = new Float32Array(36), sown = new Uint8Array(36), harv = new Uint8Array(36);
  for (let i = 0; i < 36; i++) {
    const r = (i / 6) | 0, j = i % 6;
    px[i] = -0.5 + (2 * j + 1) * CELL; pz[i] = -0.5 + (r * 2 + 0.5) * CELL;
    sowOrder[i] = r * 6 + (r % 2 ? 5 - j : j);
    vary[i] = 0.86 + rnd() * 0.26; pink[i] = rnd() < 0.55 ? 1 : 0;
  }
  const decor = [];
  for (let i = 0; i < 44; i++) {
    const x = -0.44 + rnd() * 0.88, z = -0.44 + rnd() * 0.88;
    const kind = i < 28 ? 0 : i < 36 ? 1 : 2;          // 0 mata de pasto, 1 flor silvestre, 2 piedra
    const k = clamp(Math.floor((z + 0.5) / (2 * CELL)), 0, 5) * 12 + clamp(Math.floor((x + 0.5) / CELL), 0, 11);
    decor.push({
      x, z, kind, k, v: 1, vv: 0,
      hgt: kind === 2 ? 0.026 + rnd() * 0.02 : 0.045 + rnd() * 0.06,
      w: kind === 2 ? 0.045 + rnd() * 0.03 : 0.026,
      col: kind === 0 ? C(pickc(rnd, ['#8fae5a', '#b7a055', '#6f8f4a', '#a9b866'])) : kind === 1 ? C(pickc(rnd, ['#EF476F', '#FFD166'])) : C(pickc(rnd, ['#8d7f78', '#a39589', '#70625c']))
    });
  }
  const COL = {
    ridgePale: C('#9a7f5c'), ridgeFresh: C('#7a4f35'),
    stalk: C('#10b784'), straw: C('#cdb467'), leaf: C('#06D6A0'), leafRipe: C('#b6c66c'),
    panGreen: C('#3fe3b4'), panPink: C('#EF476F'), panGold: C('#FFD166'),
    seed: C('#FFD166'), stubble: C('#c9af6e')
  };
  const tmpC = new T.Color(), tmpM = new T.Matrix4(), tmpP = new T.Vector3(), tmpS = new T.Vector3(), tmpQ = new T.Quaternion();
  const IDQ = new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
  function put(mesh, i, x, y, z, sx, sy, sz, q) {
    tmpP.set(x, y, z); tmpS.set(sx, sy, sz);
    tmpM.compose(tmpP, q || IDQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  }
  for (let i = 0; i < NVOX; i++) { put(vox, i, 0, 0, 0, 0, 0, 0); vox.setColorAt(i, COL.leaf); }

  let mature = 0, lastStage = -1, emitBudget = 0;
  const PLOW_RATE = 76.5;      // 72 celdas, con un margen para terminar antes del cambio de fase

  function updateCrop(dt, omega, t) {
    const st = state.stage, ph = phaseIdx(), camp = campaignNo(), p = state.p;
    irrigation.visible = ph >= 0;
    if (st !== lastStage) {
      plowed.fill(ph >= 1 ? 1 : 0);
      harv.fill(0); sown.fill(ph === 1 ? 0 : 1);
      lastStage = st;
      const want = st <= 1 ? 'virgin' : 'harvest';
      if (want !== frontKind) { frontKind = want; frontCtx.drawImage(sideCv[want], 0, 0); frontTex.needsUpdate = true; }
    }
    emitBudget = 10;
    let mT = 0;
    if (ph === 2) mT = 0.22 * smooth(0.85, 1, p);
    else if (ph === 3) mT = 0.22 + 0.78 * smooth(0, 0.28, p);
    mature += (mT - mature) * (1 - Math.exp(-dt * 4));
    const kf = 1 - Math.exp(-dt * 5);

    /* camellones */
    for (let k = 0; k < 72; k++) {
      const r = (k / 12) | 0, c = k % 12, pl = r * 6 + (c >> 1);
      let tR, tF, cs;
      if (ph < 0) { tR = 0; tF = 1; cs = 0; }
      else if (ph === 0) {
        const done = p * PLOW_RATE > plowOrder[k];
        tR = done ? 1 : (camp === 1 ? 0 : 0.5); tF = done || camp === 1 ? 1 : 0; cs = done ? 2 : (camp === 1 ? 0 : 1);
        if (done && !plowed[k]) {
          plowed[k] = 1;
          if (emitBudget > 0) { emitBudget--; burstAt(rx[k], rz[k], 2, 0); }
        }
      }
      else if (ph === 3) { const hv = p > 0.30 + 0.66 * (sowOrder[pl] / 36); tR = hv ? 0.5 : 1; tF = hv ? 0 : 1; cs = hv ? 1 : 2; }
      else { tR = 1; tF = 1; cs = 2; }
      const a = -196 * (ridge[k] - tR) - 16 * ridgeV[k];
      ridgeV[k] += a * dt; ridge[k] += ridgeV[k] * dt;
      if (ridge[k] < 0) { ridge[k] = 0; ridgeV[k] = 0; }
      fresh[k] += (tF - fresh[k]) * kf;
      cellState[k] = cs;
      const hg = RH * ridge[k], vis = hg > 0.0015 ? 1 : 0;
      put(vox, R0 + k, rx[k], TOP + hg / 2, rz[k], CELL * 0.985 * vis, hg, CELL * 0.86 * vis);
      const moisture = CampoInteractive.weather?.moisture;
      const wetness = moisture == null ? 1 : lerp(1.16, .68, clamp(moisture / 65, 0, 1));
      tmpC.copy(COL.ridgePale).lerp(COL.ridgeFresh, fresh[k]).multiplyScalar(rtint[k] * wetness);
      vox.setColorAt(R0 + k, tmpC);
    }

    /* vegetación silvestre de la tierra virgen */
    for (let i = 0; i < 44; i++) {
      const d = decor[i];
      const tv = ph < 0 ? 1 : (ph === 0 && camp === 1 && !(p * PLOW_RATE > plowOrder[d.k])) ? 1 : 0;
      d.vv += (-150 * (d.v - tv) - 15 * d.vv) * dt; d.v += d.vv * dt;
      const s = Math.max(0, d.v);
      put(vox, D0 + i, d.x, TOP + d.hgt * s / 2, d.z, d.w * s, d.hgt * s, d.w * s);
      vox.setColorAt(D0 + i, d.col);
    }

    /* semillas, plantas y rastrojo */
    const bend = clamp(omega * 0.07, -0.55, 0.55);
    const wind = REDUCED ? 0 : clamp((CampoInteractive.weather?.wind ?? 0) / 18, 0, 1.6);
    for (let i = 0; i < 36; i++) {
      const r = (i / 6) | 0, j = i % 6, k0 = r * 12 + j * 2, o = sowOrder[i] / 36;
      let gT = 0, sdT = 0, sbT = 0;
      if (ph === 0) sbT = camp > 1 && !(p * PLOW_RATE > plowOrder[k0]) ? 1 : 0;
      else if (ph === 1) {
        const isSown = p > 0.03 + o * 0.56;
        gT = 0.12 * smooth(0.62 + o * 0.24, 0.74 + o * 0.24, p);
        sdT = isSown && gT < 0.03 ? 1 : 0;
        if (isSown && !sown[i]) { sown[i] = 1; seedY[i] = 0.42; seedVy[i] = 0; }
      }
      else if (ph === 2) gT = (0.12 + 0.88 * smooth(0, 0.92, p)) * vary[i];
      else if (ph === 3) {
        const hv = p > 0.30 + 0.66 * o;
        gT = hv ? 0 : vary[i]; sbT = hv ? 1 : 0;
        if (hv && !harv[i]) { harv[i] = 1; if (emitBudget > 0) { emitBudget -= 2; burstAt(px[i], pz[i], 5, pink[i] ? 1 : 2); } }
      }
      growV[i] += (-64 * (grow[i] - gT) - 16 * growV[i]) * dt; grow[i] += growV[i] * dt;
      if (grow[i] < 0) { grow[i] = 0; growV[i] = 0; }
      seedVis[i] += (sdT - seedVis[i]) * (1 - Math.exp(-dt * 12));
      stub[i] += (sbT - stub[i]) * (1 - Math.exp(-dt * 8));
      if (seedY[i] > 0 || seedVy[i] !== 0) {
        seedVy[i] -= 3.4 * dt; seedY[i] += seedVy[i] * dt;
        if (seedY[i] <= 0) { seedY[i] = 0; seedVy[i] = Math.abs(seedVy[i]) > 0.25 ? -seedVy[i] * 0.34 : 0; }
      }

      const traits = CampoInteractive.traits;
      const base = TOP + RH * ridge[k0], g = grow[i], Hh = PLANT_H * g * traits.height, b = P0 + i * 8;
      const sv2 = seedVis[i] > 0.02 ? 0.03 * seedVis[i] : 0;
      put(vox, S0 + i, px[i], base + 0.015 + seedY[i], pz[i], sv2, sv2, sv2);
      vox.setColorAt(S0 + i, COL.seed);

      const w = wind ? Math.sin(t * 1.7 + px[i] * 6 + pz[i] * 3) * 0.035 * g : 0;
      const dx = (-pz[i] * bend + w) * g, dz = px[i] * bend * g;
      tmpV.set(dx, Math.max(Hh, 1e-4), dz);
      const len = tmpV.length();
      tmpQ.setFromUnitVectors(UPV, tmpV2.copy(tmpV).normalize());
      const on = g > 0.012 ? 1 : 0;
      put(vox, b, px[i] + dx * 0.5, base + Hh * 0.5, pz[i] + dz * 0.5, 0.02 * on, len, 0.02 * on, tmpQ);
      tmpC.copy(COL.stalk).lerp(COL.straw, mature); vox.setColorAt(b, tmpC);
      for (let l = 0; l < 4; l++) {
        const f = 0.28 + l * 0.18, s = smooth(0.16 + l * 0.17, 0.30 + l * 0.17, g), side = l % 2 ? -1 : 1;
        put(vox, b + 1 + l, px[i] + dx * f + side * 0.034 * s * traits.leaf, base + Hh * f, pz[i] + dz * f + (l > 1 ? 0.012 : -0.012) * s, 0.072 * s * traits.leaf, 0.014 * (s > 0 ? 1 : 0), 0.036 * s * traits.leaf, tmpQ);
        tmpC.copy(COL.leaf).lerp(COL.leafRipe, mature * 0.85); vox.setColorAt(b + 1 + l, tmpC);
      }
      const isGrain = ['quinua', 'cebada', 'maiz', 'choclo', 'arroz'].includes(context.crop.id);
      const sp = isGrain ? smooth(0.78, 1.0, g) : 0;
      const maize = traits.form === 'maize';
      put(vox, b + 5, px[i] + dx + (maize ? .04 : 0), base + Hh * (maize ? .68 : 1) + 0.03 * sp, pz[i] + dz, (maize ? .045 : .052) * sp, (maize ? .11 : .07) * sp, .045 * sp, tmpQ);
      put(vox, b + 6, px[i] + dx * 1.1, base + Hh + 0.082 * sp, pz[i] + dz * 1.1, (maize ? .016 : .034) * sp, (maize ? .075 : .042) * sp, .034 * sp, tmpQ);
      if (maize) tmpC.set(traits.grain);
      else tmpC.copy(COL.panGreen).lerp(pink[i] ? COL.panPink : COL.panGold, smooth(0.1, 0.9, mature));
      vox.setColorAt(b + 5, tmpC); vox.setColorAt(b + 6, tmpC);
      const sb = stub[i] > 0.02 ? stub[i] : 0;
      put(vox, b + 7, px[i], base + 0.017 * sb, pz[i], 0.022 * (sb ? 1 : 0), 0.034 * sb, 0.022 * (sb ? 1 : 0));
      vox.setColorAt(b + 7, COL.stubble);
    }
    vox.instanceMatrix.needsUpdate = true;
    vox.instanceColor.needsUpdate = true;

    /* textura de la cara superior, celda por celda */
    let dirty = false;
    for (let k = 0; k < 72; k++) {
      if (cellDrawn[k] === cellState[k]) continue;
      cellDrawn[k] = cellState[k];
      const cx = (k % 12) * 4, cy = ((k / 12) | 0) * 8;
      topCtx.drawImage(PATS[cellState[k]], cx, cy, 4, 8, cx, cy, 4, 8);
      dirty = true;
    }
    if (dirty) topTex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ *
   *  Partículas: terrones, polvo y granos                               *
   * ------------------------------------------------------------------ */
  const PM = 420, AMBIENT = REDUCED ? 60 : 110, GM = 0.85, G_FIELD = 9.8;
  const Y_SPACE = 0.10, Y_FIELD = -0.30, GROUND_Y = Y_FIELD - 0.5;
  const pos = new Float32Array(PM * 3), vel = new Float32Array(PM * 3), axis = new Float32Array(PM * 3);
  const psize = new Float32Array(PM), page = new Float32Array(PM), plife = new Float32Array(PM), pang = new Float32Array(PM), pspin = new Float32Array(PM);
  const pkind = new Uint8Array(PM), prest = new Uint8Array(PM);    // pkind: 0 libre, 1 ambiente, 2 ráfaga
  const pm = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), PM);
  pm.frustumCulled = false;
  scn.add(pm);
  for (let i = 0; i < PM; i++) { put(pm, i, 0, 0, 0, 0, 0, 0); pm.setColorAt(i, COL.seed); }
  const SOILC = ['#7a5236', '#5f3f2c', '#93795a', '#4a3226', '#6b4731'].map(C);
  const GRAINC = [null, [C('#EF476F'), C('#f4688a')], [C('#FFD166'), C('#ffdf8f')]];
  let pcur = 0, ambCount = 0, spawnAcc = 0;

  function spawn(kind, x, y, z, vx, vy, vz, size, color, life) {
    for (let n = 0; n < PM; n++) {
      const i = (pcur + n) % PM;
      if (pkind[i]) continue;
      pcur = i + 1;
      pkind[i] = kind; prest[i] = 0; page[i] = 0; plife[i] = life; psize[i] = size;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      tmpV.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      axis[i * 3] = tmpV.x; axis[i * 3 + 1] = tmpV.y; axis[i * 3 + 2] = tmpV.z;
      pang[i] = rnd() * TAU; pspin[i] = (rnd() - 0.5) * 5;
      pm.setColorAt(i, color);
      if (kind === 1) ambCount++;
      return i;
    }
    return -1;
  }
  function kill(i) {
    if (pkind[i] === 1) ambCount--;
    pkind[i] = 0;
    put(pm, i, 0, 0, 0, 0, 0, 0);
  }
  function spawnOrbit() {
    const r = 0.98 + rnd() * 0.56;
    const n = tmpV.set((rnd() - 0.5) * 0.7, 1, (rnd() - 0.5) * 0.7).normalize().clone();
    const u = tmpV2.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(n).normalize().clone();
    const tdir = new T.Vector3().crossVectors(n, u);
    const sp = Math.sqrt(GM / r) * (0.94 + rnd() * 0.12);
    const col = rnd() < 0.07 ? COL.seed : rnd() < 0.05 ? COL.leaf : SOILC[(rnd() * SOILC.length) | 0];
    spawn(1, rig.position.x + u.x * r, rig.position.y + u.y * r, rig.position.z + u.z * r, tdir.x * sp, tdir.y * sp, tdir.z * sp, 0.022 + rnd() * 0.03, col, 0);
  }
  /* ráfaga desde la cara superior: kind 0 polvo de arado, 1/2 granos rosados o dorados */
  function burstAt(lx, lz, count, kind) {
    tmpV.set(lx, TOP + 0.07, lz);
    slabs[0].localToWorld(tmpV);
    const ox = tmpV.x, oy = tmpV.y, oz = tmpV.z;
    for (let n = 0; n < count; n++) {
      const a = rnd() * TAU, lat = kind ? 0.35 + rnd() * 0.5 : 0.12 + rnd() * 0.3, upv = kind ? 0.75 + rnd() * 0.6 : 0.45 + rnd() * 0.5;
      const col = kind ? GRAINC[kind][(rnd() * 2) | 0] : SOILC[(rnd() * SOILC.length) | 0];
      spawn(2, ox, oy, oz, Math.cos(a) * lat, upv, Math.sin(a) * lat, kind ? 0.024 + rnd() * 0.012 : 0.016 + rnd() * 0.02, col, kind ? 9 + rnd() * 6 : 4 + rnd() * 4);
    }
  }
  function dustRing(strength) {
    const n = Math.round(clamp(strength * 9, 6, 26));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = 0.55 + rnd() * 0.25, sp = 0.5 + rnd() * 1.1 * strength;
      spawn(2, rig.position.x + Math.cos(a) * r, GROUND_Y + 0.03, rig.position.z + Math.sin(a) * r,
        Math.cos(a) * sp, 0.5 + rnd() * 1.2 * strength, Math.sin(a) * sp, 0.018 + rnd() * 0.026, SOILC[(rnd() * SOILC.length) | 0], 2.5 + rnd() * 3);
    }
  }
  function particlesToOrbit() {
    for (let i = 0; i < PM; i++) {
      if (!pkind[i]) continue;
      const dx = pos[i * 3] - rig.position.x, dy = pos[i * 3 + 1] - rig.position.y, dz = pos[i * 3 + 2] - rig.position.z;
      const r = Math.max(0.6, Math.sqrt(dx * dx + dy * dy + dz * dz));
      tmpV.set((rnd() - 0.5) * 0.8, 1, (rnd() - 0.5) * 0.8).normalize();
      tmpV2.set(dx, dy, dz).normalize();
      tmpV.cross(tmpV2).normalize().multiplyScalar(Math.sqrt(GM / r) * (0.9 + rnd() * 0.2));
      vel[i * 3] = tmpV.x; vel[i * 3 + 1] = tmpV.y + 0.25; vel[i * 3 + 2] = tmpV.z;
      prest[i] = 0;
    }
  }
  function updateParticles(dt, yaw) {
    const space = state.env === 'space';
    const cx = rig.position.x, cy = rig.position.y, cz = rig.position.z;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    if (space && fm < 0.4 && ambCount < AMBIENT) {
      spawnAcc += dt * 40;
      while (spawnAcc > 1 && ambCount < AMBIENT) { spawnAcc -= 1; spawnOrbit(); }
    }
    for (let i = 0; i < PM; i++) {
      if (!pkind[i]) continue;
      page[i] += dt;
      if (pkind[i] === 2 && page[i] > plife[i]) { kill(i); continue; }
      const j = i * 3;
      let x = pos[j], y = pos[j + 1], z = pos[j + 2], vx = vel[j], vy = vel[j + 1], vz = vel[j + 2];
      let dx = x - cx, dy = y - cy, dz = z - cz;
      if (space) {
        /* gravedad central hacia la parcela: a = -GM · r / |r|³ */
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz), rs = Math.max(r, 0.4), a = -GM / (rs * rs * rs);
        vx += dx * a * dt; vy += dy * a * dt; vz += dz * a * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        dx = x - cx; dy = y - cy; dz = z - cz;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if ((page[i] > 0.2 && Math.abs(lx) < 0.49 && Math.abs(dy) < 0.49 && Math.abs(lz) < 0.49) || r > 7) { kill(i); continue; }
        pang[i] += pspin[i] * dt;
      } else if (!prest[i]) {
        vy -= G_FIELD * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        const fl = GROUND_Y + psize[i] * 0.5;
        if (y < fl) {
          y = fl;
          if (vy < -0.7) { vy = -vy * 0.36; vx *= 0.7; vz *= 0.7; }
          else { vy = 0; vx *= 0.5; vz *= 0.5; if (vx * vx + vz * vz < 0.003) { vx = vz = 0; prest[i] = 1; } }
        }
        /* choque contra el bloque (caja orientada) */
        dx = x - cx; dy = y - cy; dz = z - cz;
        const hb = 0.5 + psize[i] * 0.5;
        let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (page[i] > 0.15 && Math.abs(lx) < hb && Math.abs(dy) < hb && Math.abs(lz) < hb) {
          let lvx = vx * cs - vz * sn, lvz = vx * sn + vz * cs;
          const ex = hb - Math.abs(lx), ey = hb - Math.abs(dy), ez = hb - Math.abs(lz);
          if (ey <= ex && ey <= ez) { dy = Math.sign(dy || 1) * hb; vy = -vy * 0.3; lvx += lx * 0.9; lvz += lz * 0.9; }
          else if (ex <= ez) { lx = Math.sign(lx || 1) * hb; lvx = -lvx * 0.35; }
          else { lz = Math.sign(lz || 1) * hb; lvz = -lvz * 0.35; }
          x = cx + lx * cs + lz * sn; z = cz - lx * sn + lz * cs; y = cy + dy;
          vx = lvx * cs + lvz * sn; vz = -lvx * sn + lvz * cs;
        }
        pang[i] += pspin[i] * dt;
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
      let s = psize[i] * Math.min(1, page[i] * 4);
      if (pkind[i] === 2) s *= clamp((plife[i] - page[i]) / 1.2, 0, 1);
      tmpQ.setFromAxisAngle(tmpV.set(axis[j], axis[j + 1], axis[j + 2]), pang[i]);
      put(pm, i, x, y, z, s, s, s, tmpQ);
    }
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ *
   *  Teseracto: armazón exterior unido a las esquinas de la parcela      *
   * ------------------------------------------------------------------ */
  const FR = 0.72;
  const fPos = new Float32Array(20 * 2 * 3);
  const fGeo = new T.BufferGeometry();
  fGeo.setAttribute('position', new T.BufferAttribute(fPos, 3));
  const fMat = new T.LineBasicMaterial({ color: 0x06D6A0, transparent: true, opacity: 0.24, depthWrite: false });
  const frameLines = new T.LineSegments(fGeo, fMat);
  frameLines.frustumCulled = false;
  rig.add(frameLines);
  const CORN = [];
  for (let i = 0; i < 8; i++) CORN.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
  const EDGES = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { const d = a ^ b; if (d === 1 || d === 2 || d === 4) EDGES.push([a, b]); }
  function updateFrame(t, thTop, thBot, thFrame) {
    const F = FR * (1 + (REDUCED ? 0 : 0.018 * Math.sin(t * 0.9)));
    const co = Math.cos(thFrame), so = Math.sin(thFrame);
    const outer = CORN.map(c => [c[0] * F * co + c[2] * F * so, c[1] * F, -c[0] * F * so + c[2] * F * co]);
    let n = 0;
    EDGES.forEach(e => { for (let k = 0; k < 2; k++) { const p = outer[e[k]]; fPos[n++] = p[0]; fPos[n++] = p[1]; fPos[n++] = p[2]; } });
    CORN.forEach((c, i) => {
      const th = c[1] > 0 ? thTop : thBot, ci = Math.cos(th), si = Math.sin(th);
      fPos[n++] = outer[i][0]; fPos[n++] = outer[i][1]; fPos[n++] = outer[i][2];
      fPos[n++] = c[0] * 0.5 * ci + c[2] * 0.5 * si; fPos[n++] = c[1] * 0.5; fPos[n++] = -c[0] * 0.5 * si + c[2] * 0.5 * ci;
    });
    fGeo.attributes.position.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ *
   *  Órbita y satélite (leyes de Kepler)                                *
   * ------------------------------------------------------------------ */
  const ORB = { a: 1.42, e: 0.28, period: 15 };
  ORB.b = ORB.a * Math.sqrt(1 - ORB.e * ORB.e);
  const orbit = new T.Group();
  orbit.rotation.set(-0.36, 0.5, 0.33);
  scn.add(orbit);
  const oPts = [];
  for (let i = 0; i <= 180; i++) { const E = i / 180 * TAU; oPts.push(new T.Vector3(ORB.a * (Math.cos(E) - ORB.e), 0, ORB.b * Math.sin(E))); }
  const oMat = new T.LineBasicMaterial({ color: 0xFFD166, transparent: true, opacity: 0.6, depthWrite: false });
  orbit.add(new T.Line(new T.BufferGeometry().setFromPoints(oPts), oMat));
  const sat = new T.Group();
  const satBodyM = new T.MeshLambertMaterial({ color: 0xe9e2cf, transparent: true });
  const satPanelM = new T.MeshLambertMaterial({ color: 0x5B8DEF, transparent: true });
  sat.add(new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.075), satBodyM));
  const pA = new T.Mesh(new T.BoxGeometry(0.105, 0.008, 0.05), satPanelM); pA.position.x = 0.085; sat.add(pA);
  const pB = pA.clone(); pB.position.x = -0.085; sat.add(pB);
  orbit.add(sat);
  function updateOrbit(t) {
    const M = (t / ORB.period * TAU) % TAU;          // anomalía media
    let E = M;
    for (let i = 0; i < 4; i++) E -= (E - ORB.e * Math.sin(E) - M) / (1 - ORB.e * Math.cos(E));   // ecuación de Kepler
    sat.position.set(ORB.a * (Math.cos(E) - ORB.e), 0, ORB.b * Math.sin(E));
    orbit.position.copy(rig.position);
    orbit.updateMatrixWorld(true);
    sat.lookAt(rig.position);
  }

  /* ------------------------------------------------------------------ *
   *  Estrellas y estrella fugaz                                         *
   * ------------------------------------------------------------------ */
  const NSTAR = REDUCED ? 1200 : 2800;
  const sP = new Float32Array(NSTAR * 3), sA = new Float32Array(NSTAR * 3), sT = new Float32Array(NSTAR * 3);
  const band = new T.Vector3(0.3, 0.75, -0.6).normalize();
  for (let i = 0; i < NSTAR; i++) {
    let v;
    do {
      v = new T.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    } while (v.lengthSq() > 1 || v.lengthSq() < 0.05);
    v.normalize();
    if (i % 3 === 0) { v.addScaledVector(band, -v.dot(band) * (0.72 + rnd() * 0.2)).normalize(); }   // franja tipo Vía Láctea
    v.multiplyScalar(300);
    sP[i * 3] = v.x; sP[i * 3 + 1] = v.y; sP[i * 3 + 2] = v.z;
    const big = rnd();
    sA[i * 3] = big > 0.985 ? 3.8 : big > 0.9 ? 2.6 : 1.1 + rnd() * 1.1;      // tamaño
    sA[i * 3 + 1] = rnd() * TAU;                                                 // fase del titileo
    sA[i * 3 + 2] = 0.5 + rnd() * 1.6;                                           // velocidad del titileo
    const tc = rnd(), col = tc < 0.08 ? [1, 0.82, 0.4] : tc < 0.14 ? [0.5, 1, 0.85] : tc < 0.17 ? [1, 0.55, 0.65] : [0.86, 0.9, 1];
    sT[i * 3] = col[0]; sT[i * 3 + 1] = col[1]; sT[i * 3 + 2] = col[2];
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute('position', new T.BufferAttribute(sP, 3));
  starGeo.setAttribute('aInfo', new T.BufferAttribute(sA, 3));
  starGeo.setAttribute('aTint', new T.BufferAttribute(sT, 3));
  const starMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPR: { value: DPR }, uCut: { value: -9999 }, uFade: { value: 60 }, uAlpha: { value: 1 } },
    vertexShader: [
      'attribute vec3 aInfo; attribute vec3 aTint; uniform float uTime; uniform float uPR;',
      'varying vec3 vTint; varying float vTw;',
      'void main(){',
      '  vTint = aTint;',
      '  vTw = 0.62 + 0.38 * sin(uTime * aInfo.z + aInfo.y);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = aInfo.x * uPR * (0.85 + 0.3 * vTw);',
      '}'].join('\n'),
    fragmentShader: [
      'uniform float uCut; uniform float uFade; uniform float uAlpha;',
      'varying vec3 vTint; varying float vTw;',
      'void main(){',
      '  float d = length(gl_PointCoord - 0.5);',
      '  float a = smoothstep(0.5, 0.08, d) * vTw * uAlpha;',
      '  a *= smoothstep(uCut, uCut + uFade, gl_FragCoord.y);',
      '  gl_FragColor = vec4(vTint, a);',
      '}'].join('\n')
  });
  const stars = new T.Points(starGeo, starMat);
  stars.frustumCulled = false; stars.renderOrder = -10;
  scn.add(stars);

  const mGeo = new T.BufferGeometry();
  const mPos = new Float32Array(6);
  mGeo.setAttribute('position', new T.BufferAttribute(mPos, 3));
  const mMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const meteor = new T.Line(mGeo, mMat);
  meteor.frustumCulled = false; meteor.renderOrder = -9;
  scn.add(meteor);
  const met = { on: false, t: 0, life: 0.9, next: 4 + rnd() * 5, p: new T.Vector3(), d: new T.Vector3() };
  function updateMeteor(dt) {
    if (REDUCED) return;
    if (!met.on) {
      met.next -= dt;
      if (met.next > 0 || fm > 0.3) return;
      met.on = true; met.t = 0; met.life = 0.7 + rnd() * 0.5; met.next = 7 + rnd() * 9;
      met.p.copy(CAM0).addScaledVector(fwd, 200).addScaledVector(up, 70 + rnd() * 40).addScaledVector(right, (rnd() - 0.5) * 220);
      met.d.copy(right).multiplyScalar(rnd() < 0.5 ? 1 : -1).addScaledVector(up, -0.35 - rnd() * 0.3).normalize();
    }
    met.t += dt;
    const k = met.t / met.life;
    if (k >= 1) { met.on = false; mMat.opacity = 0; return; }
    const head = tmpV.copy(met.p).addScaledVector(met.d, met.t * 120), tail = tmpV2.copy(head).addScaledVector(met.d, -26 * Math.sin(k * Math.PI));
    mPos[0] = tail.x; mPos[1] = tail.y; mPos[2] = tail.z; mPos[3] = head.x; mPos[4] = head.y; mPos[5] = head.z;
    mGeo.attributes.position.needsUpdate = true;
    mMat.opacity = Math.sin(k * Math.PI) * 0.55 * (1 - fm);
  }

  /* ------------------------------------------------------------------ *
   *  La Tierra: imagen satelital NASA Blue Marble sobre un casquete      *
   * ------------------------------------------------------------------ */
  const earth = new T.Group();
  earth.renderOrder = -4;
  scn.add(earth);
  const EARTH = { R: 60, ang: 42 * DEG, limb: 10 * DEG, lon0: -170, lon1: 5, lat1: 25, lat0: -75, subLat: -49.5, subLon: -66, heading: 2 * DEG };
  const SUN_E = new T.Vector3(0.7, 0.6, -0.3).normalize();      // el sol entra por la derecha: el terminador queda a la izquierda
  EARTH.D = EARTH.R / Math.sin(EARTH.ang);
  const eBeta = EARTH.ang + EARTH.limb;
  const E0 = CAM0.clone().addScaledVector(fwd, EARTH.D * Math.cos(eBeta)).addScaledVector(up, -EARTH.D * Math.sin(eBeta));
  earth.position.copy(E0);
  const upW = CAM0.clone().sub(E0).normalize();
  const fwdW = fwd.clone().addScaledVector(upW, -fwd.dot(upW)).normalize();
  const rightW = new T.Vector3().crossVectors(fwdW, upW);
  const ll = (lat, lon) => new T.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));
  (function orientEarth() {
    const la = EARTH.subLat * DEG, lo = EARTH.subLon * DEG;
    const upL = ll(EARTH.subLat, EARTH.subLon);
    const northL = new T.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo));
    const eastL = new T.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
    const fwdL = northL.multiplyScalar(Math.cos(EARTH.heading)).addScaledVector(eastL, Math.sin(EARTH.heading)).normalize();
    const rightL = new T.Vector3().crossVectors(fwdL, upL);
    const Bw = new T.Matrix4().makeBasis(rightW, upW, fwdW.clone().negate());
    const Bl = new T.Matrix4().makeBasis(rightL, upL, fwdL.clone().negate());
    earth.quaternion.setFromRotationMatrix(Bw.multiply(Bl.transpose()));
  })();
  const ATMO = new T.Color('#3fe0c0');
  const earthU = { uMap: { value: null }, uSun: { value: SUN_E }, uAlpha: { value: 1 }, uAtmo: { value: ATMO } };
  const earthMat = new T.ShaderMaterial({
    transparent: true, uniforms: earthU,
    vertexShader: [
      'varying vec2 vUv; varying vec3 vN; varying vec3 vP;',
      'void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * w; }'].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform vec3 uSun; uniform float uAlpha; uniform vec3 uAtmo;',
      'varying vec2 vUv; varying vec3 vN; varying vec3 vP;',
      'void main(){',
      '  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vP);',
      '  float day = smoothstep(-0.15, 0.55, dot(n, uSun));',
      '  vec3 tex = texture2D(uMap, vUv).rgb;',
      '  float l = dot(tex, vec3(0.299, 0.587, 0.114));',
      '  vec3 graded = mix(vec3(l), tex, 1.05) * 1.5 + vec3(0.0, 0.006, 0.03);',
      '  vec3 night = vec3(0.016, 0.03, 0.075) + tex * 0.07;',
      '  vec3 col = mix(night, graded, day);',
      '  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);',
      '  col = mix(col, uAtmo, fres * (0.16 + 0.5 * day));',
      '  gl_FragColor = vec4(col, uAlpha);',
      '}'].join('\n')
  });
  const earthPatch = new T.Mesh(
    new T.SphereGeometry(EARTH.R, 160, 120,
      (EARTH.lon0 + 180) * DEG, (EARTH.lon1 - EARTH.lon0) * DEG, (90 - EARTH.lat1) * DEG, (EARTH.lat1 - EARTH.lat0) * DEG),
    earthMat);
  earthPatch.visible = false; earthPatch.renderOrder = -4;
  earth.add(earthPatch);
  const SHELL = 0.035;
  const atmoMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending,
    uniforms: { uSun: { value: SUN_E }, uAlpha: { value: 1 }, uAtmo: { value: ATMO }, uEdge: { value: Math.sqrt(1 - 1 / ((1 + SHELL) * (1 + SHELL))) } },
    vertexShader: [
      'varying vec3 vN; varying vec3 vP;',
      'void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * w; }'].join('\n'),
    fragmentShader: [
      'uniform vec3 uSun; uniform float uAlpha; uniform vec3 uAtmo; uniform float uEdge;',
      'varying vec3 vN; varying vec3 vP;',
      'void main(){',
      '  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vP);',
      '  float rim = clamp(abs(dot(n, v)) / uEdge, 0.0, 1.0);',
      '  float sunSide = 0.28 + 0.72 * smoothstep(-0.35, 0.5, dot(n, uSun));',
      '  float a = pow(rim, 2.4) * sunSide * uAlpha;',
      '  gl_FragColor = vec4(uAtmo * a, a);',
      '}'].join('\n')
  });
  const atmo = new T.Mesh(new T.SphereGeometry(EARTH.R * (1 + SHELL), 128, 64), atmoMat);
  atmo.renderOrder = -5;
  earth.add(atmo);

  /* punto que marca dónde queda la parcela en la Tierra */
  const pinCv = mkCanvas(64, 64), pg = pinCv.getContext('2d');
  pg.strokeStyle = '#FFD166'; pg.lineWidth = 3; pg.beginPath(); pg.arc(32, 32, 20, 0, TAU); pg.stroke();
  pg.fillStyle = '#FFD166'; pg.beginPath(); pg.arc(32, 32, 7, 0, TAU); pg.fill();
  const pinMat = new T.SpriteMaterial({ map: new T.CanvasTexture(pinCv), transparent: true, depthWrite: false, opacity: 0.95 });
  const pin = new T.Sprite(pinMat);
  pin.position.copy(ll(DATA.parcel.lat, DATA.parcel.lon)).multiplyScalar(EARTH.R * 1.002);
  pin.renderOrder = -2; pin.visible = false;
  earth.add(pin);

  const earthImg = $('#ma-earth-src');
  function earthReady() {
    const tex = new T.Texture(earthImg);
    tex.minFilter = T.LinearFilter; tex.magFilter = T.LinearFilter; tex.generateMipmaps = false;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    earthU.uMap.value = tex;
    earthPatch.visible = true; pin.visible = true;
  }
  if (earthImg) {
    if (earthImg.complete && earthImg.naturalWidth) earthReady();
    else earthImg.addEventListener('load', earthReady);
  }

  /* ------------------------------------------------------------------ *
   *  Campo: sombra de contacto                                          *
   * ------------------------------------------------------------------ */
  const shCv = mkCanvas(128, 128), sg = shCv.getContext('2d');
  const grd = sg.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, 'rgba(2,4,12,.95)'); grd.addColorStop(0.5, 'rgba(2,4,12,.8)'); grd.addColorStop(0.78, 'rgba(2,4,12,.35)'); grd.addColorStop(1, 'rgba(2,4,12,0)');
  sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
  const shMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(shCv), transparent: true, opacity: 0, depthWrite: false });
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), shMat);
  shadow.rotation.x = -HALF_PI; shadow.position.y = GROUND_Y + 0.002; shadow.renderOrder = -1;
  scn.add(shadow);

  /* ------------------------------------------------------------------ *
   *  Dinámica de la parcela                                             *
   * ------------------------------------------------------------------ */
  const th = [0, 1, 2, 3].map(() => ({ x: BASE_YAW, v: 0 }));      // 3 capas + armazón
  const body = { y: state.env === 'field' ? Y_FIELD : Y_SPACE, vy: 0 };
  const squash = { x: 1, v: 0 }, tilt = { x: 0, v: 0 }, peek = { x: 0, v: 0 };
  let fm = state.env === 'field' ? 1 : 0, shake = 0;
  const drag = { on: false, id: -1, x0: 0, y0: 0, yaw: 0, peek: 0, lx: 0, lt: 0, vx: 0 };
  const view = { cx: 0, cy: 0, s: 0, ready: false, w: 0, h: 0, hy: -1, vx: -1 };
  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };

  function stepRotation(dt) {
    const target = BASE_YAW + state.stage * HALF_PI + (drag.on ? drag.yaw : 0);
    const n = Math.max(1, Math.ceil(dt / 0.006)), hdt = dt / n;
    for (let i = 0; i < n; i++) {
      if (drag.on) spring(th[0], target, 34, 1, hdt); else spring(th[0], target, 9.5, 0.5, hdt);
      spring(th[1], th[0].x, 13, 0.62, hdt);
      spring(th[2], th[1].x, 13, 0.62, hdt);
      spring(th[3], th[2].x, 5.5, 0.42, hdt);
      spring(tilt, 0, 7, 0.32, hdt);
      spring(peek, drag.on ? drag.peek : 0, 12, 0.8, hdt);
      spring(squash, 1, 22, 0.3, hdt);
    }
  }
  function stepBody(dt, t) {
    if (state.env === 'space') {
      const bob = REDUCED ? 0 : 0.035 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 1.7 + 1);
      const a = -9 * (body.y - (Y_SPACE + bob)) - 2.6 * body.vy;     // sin gravedad: solo el ancla elástica
      body.vy += a * dt; body.y += body.vy * dt;
    } else {
      body.vy -= G_FIELD * dt; body.y += body.vy * dt;                // caída libre
      if (body.y <= Y_FIELD) {
        body.y = Y_FIELD;
        if (body.vy < -0.5) {
          const hit = -body.vy;
          squash.v -= hit * 0.9; shake = Math.min(0.06, hit * 0.014);
          dustRing(hit / 3);
          body.vy = hit * 0.34;
        } else body.vy = 0;
      }
    }
  }

  function layout() {
    const w = visual.clientWidth, hh = visual.clientHeight;
    if (!w || !hh) return false;
    if (w !== view.w || hh !== view.h) {
      view.w = w; view.h = hh;
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh;
    }
    const rr = visual.getBoundingClientRect(), sr = slotEl.getBoundingClientRect();
    const cx = sr.left - rr.left + sr.width / 2, cy = sr.top - rr.top + sr.height / 2;
    const s = clamp(Math.min(sr.width * 0.92, sr.height * .88) * 0.46, 44, 330);
    if (!view.ready) { view.cx = cx; view.cy = cy; view.s = s; view.ready = true; }
    else { view.cx += (cx - view.cx) * 0.2; view.cy += (cy - view.cy) * 0.2; view.s += (s - view.s) * 0.2; }
    const unitPx = hh / (2 * CAM_DIST * Math.tan(FOV * DEG / 2));
    camera.zoom = view.s / unitPx;
    camera.setViewOffset(w, hh, w / 2 - view.cx, hh / 2 - view.cy, w, hh);
    const hy = Math.round(view.cy - 0.62 * view.s), vx = Math.round(view.cx);
    if (hy !== view.hy) { view.hy = hy; root.style.setProperty('--hy', hy + 'px'); }
    if (vx !== view.vx) { view.vx = vx; root.style.setProperty('--vx', vx + 'px'); }
    const un = Math.round(view.s);
    if (un !== view.un) { view.un = un; root.style.setProperty('--unit', un + 'px'); }
    return true;
  }

  function frame(dt, t) {
    if (!layout()) return;
    fm += ((state.env === 'field' ? 1 : 0) - fm) * (1 - Math.exp(-dt * 2.4));
    const sm = 1 - fm;

    stepRotation(dt);
    stepBody(dt, t);
    slabs[0].rotation.y = th[0].x; slabs[1].rotation.y = th[1].x; slabs[2].rotation.y = th[2].x;
    rig.position.set(0, body.y, 0);
    const sy = clamp(squash.x, 0.8, 1.15), sxz = 1 + (1 - sy) * 0.5;
    rig.scale.set(sxz, sy, sxz);
    const drift = REDUCED ? 0 : sm;
    rig.rotation.z = tilt.x + drift * 0.03 * Math.sin(t * 0.55);
    rig.rotation.x = peek.x + drift * 0.025 * Math.sin(t * 0.4 + 1.3);
    rig.updateMatrixWorld(true);

    updateCrop(dt, th[0].v, t);
    updateParticles(dt, th[1].x);
    updateFrame(t, th[0].x, th[2].x, th[3].x);
    updateOrbit(t);
    updateMeteor(dt);

    /* mezcla espacio ↔ campo */
    fMat.opacity = 0.24 * sm; frameLines.visible = sm > 0.02;
    oMat.opacity = 0.6 * sm; satBodyM.opacity = satPanelM.opacity = sm; orbit.visible = sm > 0.02;
    const eA = 1 - smooth(0.05, 0.7, fm);
    earth.visible = eA > 0.01;
    earthU.uAlpha.value = eA; atmoMat.uniforms.uAlpha.value = eA; pinMat.opacity = 0.95 * eA;
    earth.position.copy(E0).addScaledVector(upW, fm * 22);          // la Tierra "sube" hacia la cámara al descender
    pin.scale.setScalar(REDUCED ? 1 : 0.95 + 0.22 * Math.sin(t * 2.4));
    key.color.copy(KEY_SPACE).lerp(KEY_FIELD, fm);
    bounce.color.copy(BOUNCE_SPACE).lerp(BOUNCE_FIELD, fm);
    starMat.uniforms.uTime.value = t;
    starMat.uniforms.uAlpha.value = 1 - 0.45 * fm;
    starMat.uniforms.uCut.value = lerp(-9999, (view.h - view.hy + clamp(view.hy * 0.6, 96, 230) * 0.8) * DPR, smooth(0, 0.5, fm));
    starMat.uniforms.uFade.value = view.h * 0.16 * DPR;
    if (!REDUCED) stars.rotation.y = t * 0.004;
    const lift = body.y - Y_FIELD;
    shadow.position.set(rig.position.x - 0.42 - lift * 0.5, GROUND_Y + 0.002, rig.position.z - 0.3 - lift * 0.3);
    shadow.scale.set(3.1 + lift * 1.4, 2.5 + lift * 1.2, 1);
    shMat.opacity = fm * clamp(0.95 - lift * 0.7, 0, 0.95);

    /* cámara: paralaje suave con el puntero y sacudida al aterrizar */
    ptr.sx += (ptr.x - ptr.sx) * (1 - Math.exp(-dt * 3)); ptr.sy += (ptr.y - ptr.sy) * (1 - Math.exp(-dt * 3));
    shake *= Math.exp(-dt * 7);
    const par = REDUCED ? 0 : 1;
    camera.position.copy(CAM0)
      .addScaledVector(right, ptr.sx * 0.3 * par + (shake ? (rnd() - 0.5) * shake : 0))
      .addScaledVector(up, -ptr.sy * 0.16 * par + (shake ? (rnd() - 0.5) * shake : 0));
    camera.lookAt(LOOK);
    renderer.render(scn, camera);
  }

  /* ------------------------------------------------------------------ *
   *  Giro deslizando (o con las flechas)                                *
   * ------------------------------------------------------------------ */
  function dragYaw(dx) {
    let y = dx / Math.max(60, view.s * 1.3) * HALF_PI;
    if (state.stage === 0 && y < 0) y *= 0.22;                       // tope elástico: no hay fase antes de la tierra virgen
    return clamp(y, -1.9, 1.9);
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button > 0) return;
    drag.on = true; drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.yaw = 0; drag.peek = 0;
    drag.lx = e.clientX; drag.lt = performance.now(); drag.vx = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', e => {
    const r = visual.getBoundingClientRect();
    ptr.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); ptr.y = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
    if (!drag.on || e.pointerId !== drag.id) return;
    const now = performance.now(), ddt = Math.max(1, now - drag.lt);
    drag.vx = lerp(drag.vx, (e.clientX - drag.lx) / ddt * 1000, 0.5);
    drag.lx = e.clientX; drag.lt = now;
    drag.yaw = dragYaw(e.clientX - drag.x0);
    drag.peek = clamp((e.clientY - drag.y0) * 0.0035, -0.16, 0.3);
  });
  function endDrag(e) {
    if (!drag.on || (e && e.pointerId !== drag.id)) return;
    drag.on = false;
    canvas.classList.remove('is-dragging');
    const idle = performance.now() - drag.lt > 120;
    const projected = drag.yaw + dragYaw(idle ? 0 : drag.vx * 0.16);
    const dir = projected > 0.6 ? 1 : projected < -0.6 ? -1 : 0;
    if (dir) advance(dir);      // la capa superior conserva el ángulo y la velocidad con que la soltó el dedo
    drag.yaw = 0;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { advance(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { advance(-1); e.preventDefault(); }
  });
  root.addEventListener('pointermove', e => {
    if (e.target === canvas) return;
    const r = visual.getBoundingClientRect();
    ptr.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); ptr.y = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
  });

  return {
    frame,
    get dragging() { return drag.on; },
    get unit() { return view.s; },
    kick(dir) { tilt.v += dir * 1.5; if (state.env === 'space') body.vy += 0.5; },
    setEnv(env) {
      if (env === 'space') { body.vy = 1.6; particlesToOrbit(); }
    }
  };
}

/* ==========================================================================
   5. Neugrac: flota en microgravedad, cae y rebota en el campo, se puede
      arrastrar y lanzar
   ========================================================================== */
function createMascot() {
  const el = $('#ma-ng'), slot = $('.ma-ng');
  const b = { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, turns: 0, ready: false, held: false, w: 0, h: 0, ox: 0, oy: 0, lx: 0, ly: 0, lt: 0 };
  const sq = { x: 1, v: 0 };
  let ax = 0, ay = 0, rw = 0, rh = 0;

  el.addEventListener('pointerdown', e => {
    b.held = true; b.ox = e.clientX - b.x; b.oy = e.clientY - b.y; b.lx = e.clientX; b.ly = e.clientY; b.lt = performance.now();
    b.vx = b.vy = 0;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    el.classList.add('is-held');
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!b.held) return;
    const now = performance.now(), dt = Math.max(1, now - b.lt) / 1000;
    b.vx = lerp(b.vx, (e.clientX - b.lx) / dt, 0.5); b.vy = lerp(b.vy, (e.clientY - b.ly) / dt, 0.5);
    b.lx = e.clientX; b.ly = e.clientY; b.lt = now;
    b.x = clamp(e.clientX - b.ox, -b.w * 0.4, rw - b.w * 0.6);
    b.y = clamp(e.clientY - b.oy, 0, rh - b.h);
  });
  const release = event => {
    if (!b.held) return;
    b.held = false; el.classList.remove('is-held');
    if (performance.now() - b.lt > 120) b.vx = b.vy = 0;
    b.vx = clamp(b.vx, -1800, 1800); b.vy = clamp(b.vy, -1800, 1800);
    b.va += b.vx * 0.004;
    if (event?.type === 'pointerup' && Math.hypot(b.vx,b.vy) > 420) document.dispatchEvent(new CustomEvent('neugrac:throw', { detail:{ speed:Math.hypot(b.vx,b.vy) } }));
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  function frame(dt, t) {
    const sr = slot.getBoundingClientRect();
    if (!sr.width) { b.ready = false; return; }
    const rr = root.getBoundingClientRect();
    rw = rr.width; rh = rr.height;
    if (sr.width !== b.w || sr.height !== b.h) {
      b.w = sr.width; b.h = sr.height;
      el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
    }
    ax = sr.left - rr.left; ay = sr.top - rr.top;
    if (!b.ready) { b.x = ax; b.y = ay; b.vx = b.vy = 0; b.ready = true; }

    if (!b.held) {
      if (state.env === 'space') {
        /* microgravedad: un ancla elástica floja y una deriva lenta */
        const tx = ax + (REDUCED ? 0 : 7 * Math.sin(t * 0.6)), ty = ay - 6 + (REDUCED ? 0 : 8 * Math.sin(t * 0.8 + 1));
        b.vx += (-14 * (b.x - tx) - 2.6 * b.vx) * dt;
        b.vy += (-14 * (b.y - ty) - 2.6 * b.vy) * dt;
        b.va += (-9 * (b.a - (b.turns + (REDUCED ? 0 : 0.09 * Math.sin(t * 0.5)))) - 2.2 * b.va) * dt;
      } else {
        /* campo: gravedad uniforme y rebote contra el piso */
        b.vy += 2600 * dt;
        b.vx += (-20 * (b.x - ax) - 6 * b.vx) * dt;
        b.va += (-70 * (b.a - b.turns) - 11 * b.va) * dt;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (state.env === 'field' && b.y >= ay) {
        b.y = ay;
        if (b.vy > 110) { sq.v -= Math.min(6, b.vy * 0.004); b.vy = -b.vy * 0.42; }
        else b.vy = 0;
      }
      b.x = clamp(b.x, -b.w * 0.4, rw - b.w * 0.6);
      if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.4; }
      if (b.y > rh - b.h) { b.y = rh - b.h; b.vy = -Math.abs(b.vy) * 0.4; }
    }
    spring(sq, 1, 20, 0.34, dt);
    const s = clamp(sq.x, 0.72, 1.2);
    el.style.transform = 'translate3d(' + b.x.toFixed(1) + 'px,' + (b.y + (1 - s) * b.h * 0.42).toFixed(1) + 'px,0) rotate(' + b.a.toFixed(3) + 'rad) scale(' + (2 - s).toFixed(3) + ',' + s.toFixed(3) + ')';
  }

  return {
    frame,
    cheer() {
      if (REDUCED || b.held || !b.ready) return;
      if (state.env === 'space') { b.turns += TAU; b.vy -= 90; }     // una voltereta en microgravedad
      else if (b.y >= ay - 1) b.vy = -620;                           // un salto en el campo
    },
    setEnv(env) { if (env === 'space' && !REDUCED) b.vy = -220; }
  };
}

/* ==========================================================================
   6. Paisaje del modo campo: amanecer andino dibujado en SVG
   ========================================================================== */
function buildField() {
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const mtn = $('.ma-mtn'), rows = $('.ma-rows');
  const MW = 4800;      /* lienzo muy ancho: la escala la manda el alto y el paisaje siempre cubre el ancho */

  /* perfil de cordillera por desplazamiento del punto medio */
  function ridge(seed, lo, hi, rough, iters) {
    const r = rng(seed);
    let pts = [r(), r()], sc = 1;
    for (let i = 0; i < iters; i++) {
      const next = [];
      for (let k = 0; k < pts.length - 1; k++) { next.push(pts[k], (pts[k] + pts[k + 1]) / 2 + (r() - 0.5) * sc); }
      next.push(pts[pts.length - 1]);
      pts = next; sc *= rough;
    }
    const mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts);
    let d = 'M0 360';
    pts.forEach((v, i) => { d += 'L' + (i / (pts.length - 1) * MW).toFixed(1) + ' ' + (360 - (lo + (v - mn) / (mx - mn) * (hi - lo))).toFixed(1); });
    return d + 'L' + MW + ' 360Z';
  }
  const defs = sv('defs', {}, mtn);
  const glow = sv('radialGradient', { id: 'ma-sunglow' }, defs);
  sv('stop', { offset: '0', 'stop-color': '#FFD166', 'stop-opacity': '.6' }, glow);
  sv('stop', { offset: '1', 'stop-color': '#FFD166', 'stop-opacity': '0' }, glow);
  const grad = (id, top, bottom) => {
    const g = sv('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    sv('stop', { offset: '0', 'stop-color': top }, g);
    sv('stop', { offset: '1', 'stop-color': bottom }, g);
  };
  grad('ma-g-far', '#3F4C8C', '#7A5F96');      /* la bruma del amanecer tiñe la base de la cordillera */
  grad('ma-g-mid', '#25346C', '#3A3F7C');
  grad('ma-g-near', '#162A52', '#1A3B55');
  const far = ridge(21, 110, 320, 0.56, 9);
  sv('path', { d: far }, sv('clipPath', { id: 'ma-far-clip' }, defs));
  sv('circle', { cx: MW / 2 + 330, cy: 170, r: 170, fill: 'url(#ma-sunglow)' }, mtn);
  sv('circle', { cx: MW / 2 + 330, cy: 170, r: 44, fill: '#FFD166' }, mtn);
  sv('path', { d: far, fill: 'url(#ma-g-far)' }, mtn);
  const r = rng(77);
  let snow = 'M0 0L' + MW + ' 0';
  for (let i = Math.ceil(MW / 26); i >= 0; i--) snow += 'L' + (i * 26) + ' ' + (128 + (i % 2 ? 16 : -8) + (r() - 0.5) * 18).toFixed(1);
  sv('path', { d: snow + 'Z', fill: '#FBE9DD', opacity: '.9', 'clip-path': 'url(#ma-far-clip)' }, mtn);
  sv('path', { d: ridge(33, 34, 150, 0.5, 9), fill: 'url(#ma-g-mid)' }, mtn);
  sv('path', { d: ridge(55, 10, 66, 0.42, 8), fill: 'url(#ma-g-near)' }, mtn);

  /* surcos en perspectiva: todos nacen en el punto de fuga, detrás de la parcela */
  const STYLES = [
    ['rgba(6,214,160,.10)', 'rgba(6,214,160,.46)'],
    ['rgba(255,209,102,.07)', 'rgba(255,209,102,.32)'],
    ['rgba(91,141,239,.08)', 'rgba(150,180,245,.24)']
  ];
  const VP = '1500 -6';
  let i = -66, si = 0;
  while (i < 66) {
    const n = 3 + ((r() * 4) | 0), st = STYLES[si++ % 3];
    const xa = 1500 + i * 46, xb = 1500 + (i + n) * 46;
    sv('path', { d: 'M' + VP + 'L' + xa + ' 600L' + xb + ' 600Z', fill: st[0] }, rows);
    let d = '';
    for (let k = 0; k <= n; k++) d += 'M' + VP + 'L' + (xa + k * 46) + ' 600';
    sv('path', { d: d, fill: 'none', stroke: st[1], 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, rows);
    i += n;
  }
}

/* ==========================================================================
   9. Arranque y bucle principal
   ========================================================================== */
root.setAttribute('data-env', state.env);
root.setAttribute('data-role', state.role);
buildField();
scene = createScene();
if (!scene) $('.ma-nogl').hidden = false;
mascot = createMascot();
applyStatic();

let lastT = performance.now(), clock = 0;
function tick(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now; clock += dt;
  if (state.playing && state.stage > 0 && !(scene && scene.dragging)) {
    state.p += dt / SEC_PER_PHASE;
    if (state.p >= 1) advance(1);        // al llenarse el tramo, la parcela gira sola a la siguiente fase
  }
  if (scene) scene.frame(dt, clock);
  mascot.frame(dt, clock);
  renderDynamic(false);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* API mínima para que la web principal controle el módulo */
window.MusuqParcela = {
  state: state,
  turn: advance,
  goTo(stage, p) { state.stage = Math.max(0, stage | 0); state.p = clamp(p || 0, 0, 0.999); renderDynamic(true); },
  setLang(code) { if (LANGS.indexOf(code) >= 0) { CampoI18n.setLanguage(code); } },
  setRole(role) { if (role !== state.role) ui.role.click(); },
  setEnv(env) { if (env !== state.env) ui.env.click(); },
  play(on) { state.playing = on !== false; renderDynamic(true); }
};

})().catch(error => { console.error('Interactive module failed', error); const message = document.querySelector('.ma-nogl'); if (message) { message.hidden = false; message.textContent = CampoI18n.t('integrated.loadError'); } });
