const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const catalogue = require('../data/i18n.json');
function leaves(value, path = '') { return Object.entries(value).flatMap(([k,v]) => v && typeof v === 'object' ? leaves(v, path + k + '.') : [path + k]).sort(); }
test('all supported languages have the same interface, crop and error keys', () => {
  for (const lang of ['en','qu']) assert.deepEqual(leaves(catalogue[lang]), leaves(catalogue.es), lang);
});
test('compound recommendations, crop names and Quechua dates never fall back to Spanish', async () => {
  const context = vm.createContext({ window: { addEventListener() {} }, document: { documentElement: {}, dispatchEvent() {} }, localStorage: { getItem: () => 'en', setItem() {} }, CustomEvent:class {}, fetch:async () => ({ ok:true, json:async () => catalogue }) });
  vm.runInContext(fs.readFileSync('js/core/i18n.js','utf8'), context);
  const i18n = context.window.CampoI18n; await i18n.ready;
  assert.equal(i18n.crop('papa'), 'Potato');
  assert.equal(i18n.text('Compatible con los criterios evaluados · 4 de 4 criterios revisados'), 'Meets the assessed criteria · 4 of 4 criteria assessed');
  i18n.setLanguage('qu');
  assert.equal(i18n.month(5), 'Aymuray');
  assert.ok(i18n.date('2026-05-15').includes('Aymuray'));
  assert.equal(i18n.text('Compatible con los criterios evaluados · 4 de 4 criterios revisados'), 'Qhawasqa tupukunata hunt’an · 4 tupumanta 4 qhawasqa');
  assert.equal(i18n.text('Algo salió mal al guardar. Tu ubicación sigue aquí. Intenta de nuevo.'), catalogue.qu.survey.texts['Algo salió mal al guardar. Tu ubicación sigue aquí. Intenta de nuevo.']);
});
