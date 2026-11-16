const { test, expect } = require('@playwright/test');
const farm = { id: 'review-plot', nombre: 'Huamancaca, Junín', ubicacion: { lat: -12.05, lon: -75.2 }, altitud: 3200, suelo: { estado: 'ok', ph: 6.4 }, perfil: { cultivos: [{ id: 'papa', nombre: 'Papa', variedad: 'Blanca' }], riego: 'lluvia', insumos: ['guano'], cosecha: [5, 6] } };
async function ready(page) { await page.waitForFunction(() => window.CampoI18n?.catalog && document.querySelector('.campo-header')); }
async function seed(page, language = 'es', parcels = [farm]) {
  await page.goto('/index.html?inicio=1'); await ready(page);
  await page.evaluate(({ parcels, language }) => { localStorage.setItem('parcelas', JSON.stringify(parcels)); localStorage.setItem('parcelaActiva', JSON.stringify(parcels[0]?.id)); localStorage.setItem('musuq.lang', language); }, { parcels, language });
}
async function reveal(page, selector) {
  await page.waitForFunction(() => window.CampoScreens?.instances.some(s => s.pages));
  await page.evaluate(selector => { const el = document.querySelector(selector); window.CampoScreens?.instances.forEach(s => { s.layout(); s.reveal(el); }); }, selector);
}

test('manual map, optional data failure, registration and interactive entry', async ({ page }) => {
  test.skip(!!process.env.BASE_URL && !process.env.BASE_URL.includes('127.0.0.1'), 'Provider failures are tested locally');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/elevation?**', r => r.abort());
  for (const service of ['soil','slope','reverse']) await page.route(`**/api/${service}?**`, r => r.abort());
  await page.goto('/ubicar-chacra.html'); await ready(page);
  await page.locator('#btnManual').click();
  await expect(page.locator('#mapa')).toBeVisible();
  expect((await page.locator('#mapa').boundingBox()).height).toBeGreaterThan(100);
  expect(Number((await page.locator('#coordenadas').innerText()).split(',')[0])).toBeCloseTo(-9.2, 1);
  await page.locator('#btnConfirmar').click();
  await expect(page).toHaveURL(/conocerte/);
  expect(await page.evaluate(() => Almacen.activa().altitud)).toBeNull();
  await page.locator('#btnNada').click();
  await page.locator('[data-id="lluvia"]').click(); await page.locator('#btnSiguiente').click();
  await reveal(page, '[data-id="ninguno"]'); await page.locator('[data-id="ninguno"]').click(); await page.locator('#btnSiguiente').click();
  await page.locator('#btnNo').click();
  await expect(page).toHaveURL(/index/);
  await expect(page.locator('.parcela')).toBeVisible();
  await page.locator('.parcela').click();
  await reveal(page, 'a[href*="parcela_neugrac_interactiva"]');
  await page.locator('a[href*="parcela_neugrac_interactiva"]').click();
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#musuq-parcela')).toBeVisible();
  expect(errors).toEqual([]);
});

test('search submit falls back after provider failure and opens selected point', async ({ page }) => {
  let fallback = 0;
  await page.route('**/api/search?**', route => {
    if (route.request().url().includes('provider=nominatim')) { fallback++; return route.fulfill({ json: [{ display_name: 'Puno, Peru', lat: '-15.84', lon: '-70.02' }] }); }
    return route.fulfill({ status: 502, json: { code: 'PROVEEDOR_NO_DISPONIBLE' } });
  });
  await page.goto('/ubicar-chacra.html'); await ready(page);
  await page.locator('#buscar').fill('Puno'); await page.locator('#btnBuscar').click();
  await page.locator('#sugerencias button').first().click();
  expect(Number((await page.locator('#coordenadas').innerText()).split(',')[0])).toBeCloseTo(-15.84, 3);
  expect(fallback).toBeGreaterThan(0);
});

test('incomplete registration cannot enter the interactive plot and resumes without a loop', async ({ page }) => {
  await seed(page, 'es', [{ ...farm, perfil: null }]);
  await page.goto('/index.html'); await ready(page);
  await expect(page.locator('#splash')).toHaveClass('oculto');
  await expect(page.locator('#abrirInteractiva')).toHaveCount(0);

  await page.goto('/parcela_neugrac_interactiva.html'); await ready(page);
  await expect(page.locator('#interactive-empty')).toBeVisible();
  await expect(page.locator('#musuq-parcela')).toBeHidden();
  await page.locator('#interactive-empty a').click();
  await expect(page).toHaveURL(/conocerte/);
});

test('remove a plot from its list, cancel deletion and delete the final plot', async ({ page }) => {
  await seed(page, 'en'); await page.goto('/index.html'); await ready(page);
  await expect(page.locator('.eliminar-parcela')).toHaveText('Remove');
  page.once('dialog', d => d.dismiss()); await page.locator('.eliminar-parcela').click();
  await expect(page.locator('.parcela')).toHaveCount(1);
  page.once('dialog', async d => { expect(d.message()).toContain('Remove'); await d.accept(); });
  await page.locator('.eliminar-parcela').click();
  await expect(page.locator('.parcela')).toHaveCount(0);
  expect(await page.evaluate(() => Almacen.activa())).toBeNull();
  await expect(page.locator('#abrirInteractiva')).toHaveCount(0);
  await page.reload(); await expect(page.locator('.parcela')).toHaveCount(0);
});

test('reading screens keep the viewport fixed and wheel changes a whole screen', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await seed(page, 'es', Array.from({length:8},(_,i)=>({...farm,id:'qa-'+i}))); await page.goto('/index.html'); await ready(page);
  await expect(page.locator('#splash')).toHaveClass('oculto');
  const stage = page.locator('body > .campo-screen-stage');
  await expect(stage).toHaveAttribute('data-screen', '1');
  await expect(stage.locator('.campo-scroll-cue')).toBeVisible();
  await page.locator('h1').hover(); await page.mouse.wheel(0, 700);
  await expect(stage).toHaveAttribute('data-screen', '2');
  expect(await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, height: innerHeight, scroll: scrollY }))).toEqual({ doc:844, height:844, scroll:0 });
});

for (const language of ['en','qu']) test(`audit all core screens and dynamic content in ${language}`, async ({ page }) => {
  test.setTimeout(120000);
  await seed(page, language);
  const audit = [];
  for (const url of ['index.html','parcela.html','menu.html','mi-campo.html','conocerte.html','riego.html','insumos.html','cosecha.html','ubicar-chacra.html','recomendacion.html','clima.html','aprender.html','aprender-2.html','parcela_neugrac_interactiva.html']) {
    if (['riego.html','insumos.html','cosecha.html'].includes(url)) await page.evaluate(farm => Almacen.guardarBorrador({ cultivos: farm.perfil.cultivos, riego:'lluvia', insumos:['guano'] }), farm);
    await page.goto('/' + url + (url === 'parcela.html' ? '?id=review-plot' : '')); await ready(page);
    if (url === 'index.html') await expect(page.locator('#splash')).toHaveClass('oculto');
    if (url === 'recomendacion.html') await expect(page.locator('#contenido .tarjeta, #contenido .aviso').first()).toBeAttached();
    if (url === 'clima.html') await expect(page.locator('#contenido .principal, #contenido .aviso').first()).toBeAttached();
    if (url === 'parcela_neugrac_interactiva.html') await page.waitForFunction(() => window.MusuqParcela);
    await page.evaluate(() => window.CampoScreens?.instances.forEach(s => s.layout()));
    const text = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = []; let n;
      while(n = walker.nextNode()) if (!n.parentElement.closest('script,style,[data-user-value],#ma-json,#interactive-parcel')) { const s = n.textContent.trim(); if (s && /[A-Za-zÁ-ÿ]/.test(s)) out.push(s); }
      return [...new Set(out)];
    });
    audit.push({ url, text });
    const untranslated = await page.evaluate(text => {
      const dictionary = CampoI18n.catalog[CampoI18n.language].survey.texts;
      return text.filter(s => dictionary[s] && dictionary[s] !== s);
    }, text);
    expect(untranslated, url + ': untranslated interface strings').toEqual([]);
    expect(text.filter(s => /\b(?:parcela|cultivos|siembra|cosecha|riego|insumos|guardando|buscando|recomendamos|ninguno|temperatura)\b/iu.test(s)), url + ': Spanish interface text').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), url).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${language}-${url}.png`), fullPage: true });
  }
  require('node:fs').writeFileSync(test.info().outputPath('locale-audit.json'), JSON.stringify(audit, null, 2));
});

test('Google Maps and Places use the configured browser key, English data and Peru results', async ({ page }) => {
  await page.route('**/api/maps-config', r => r.fulfill({ json: { provider:'google', key:'test-browser-key' } }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('key')).toBe('test-browser-key');
    expect(url.searchParams.get('language')).toBe('en');
    return route.fulfill({ contentType:'application/javascript', body: `
      window.google = { maps: { event: { trigger() {} }, async importLibrary(name) {
        if (name === 'maps') return { Map: class {
          constructor(el, options) { window.testMapOptions = options; this.center=options.center; this.z=options.zoom; el.innerHTML='<div data-google-map>Google Maps</div>'; }
          addListener(name, callback) { this.change=callback; }
          getCenter() { const c=this.center; return {lat:()=>c.lat,lng:()=>c.lng}; }
          setCenter(c) { this.center={ lat:typeof c.lat === 'function' ? c.lat() : c.lat, lng:typeof c.lng === 'function' ? c.lng() : c.lng }; this.change?.(); }
          setZoom(z) { this.z=z; } getZoom() { return this.z; }
        } };
        return { AutocompleteSessionToken:class {}, AutocompleteSuggestion: { async fetchAutocompleteSuggestions(request) {
          window.testAutocompleteRequest=request;
          return {suggestions:[{placePrediction:{text:{toString:()=> 'Puno, Peru'},toPlace:()=> ({location:{lat:()=>-15.84,lng:()=>-70.02},async fetchFields(request) { window.testPlaceFields=request.fields; }})}}]};
        }}};
      } } };
      window.${url.searchParams.get('callback')}();
    ` });
  });
  await page.goto('/ubicar-chacra.html'); await ready(page);
  await page.locator('#buscar').fill('Puno'); await page.locator('#btnBuscar').click();
  await page.locator('#sugerencias button').first().click();
  await expect(page.locator('#mapaVista')).toHaveAttribute('data-provider','google');
  await expect(page.locator('[data-google-map]')).toBeVisible();
  await expect(page.locator('#coordenadas')).toHaveText('-15.84000, -70.02000');
  expect(await page.evaluate(() => ({ language:testAutocompleteRequest.language, regions:testAutocompleteRequest.includedRegionCodes, fields:testPlaceFields, type:testMapOptions.mapTypeId }))).toEqual({ language:'en',regions:['pe'],fields:['location'],type:'hybrid' });
  await page.locator('#btnConfirmar').click(); await expect(page).toHaveURL(/conocerte/);
});

for (const viewport of [{width:320,height:568},{width:390,height:844}]) test(`reading controls and complete content fit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport); await seed(page, 'qu');
  for (const url of ['index.html','conocerte.html','cosecha.html','aprender.html','recomendacion.html']) {
    await page.evaluate(farm => localStorage.setItem('borrador', JSON.stringify({parcelaId:farm.id,cultivos:farm.perfil.cultivos,riego:'lluvia',insumos:['guano']})), farm);
    await page.goto('/'+url); await ready(page);
    if (url==='index.html') await expect(page.locator('#splash')).toHaveClass('oculto');
    if (url==='recomendacion.html') await expect(page.locator('#contenido .tarjeta, #contenido .aviso').first()).toBeAttached();
    const clipped = await page.evaluate(() => {
      const result=[];
      for (const screens of CampoScreens.instances) {
        screens.layout();
        const viewport=screens.viewport.getBoundingClientRect();
        for(let i=0;i<screens.pages.length;i++) {
          screens.go(i,false);
          for (const unit of screens.pages[i].units) { const box=unit.getBoundingClientRect(); if(box.bottom>viewport.bottom+2 || box.top<viewport.top-2) result.push(unit.textContent.slice(0,70)); }
        }
        screens.go(0,false);
      }
      return result;
    });
    expect(clipped,url).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
});
