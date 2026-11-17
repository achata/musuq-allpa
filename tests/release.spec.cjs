const { test, expect } = require('@playwright/test');
async function click(page, locator) {
  if (!(await locator.isVisible()) && await page.locator('body.campo-immersive #ma-options').isVisible()) await page.locator('#ma-options').click();
  await locator.evaluate(el => window.CampoScreens?.instances.forEach(s => { s.layout(); s.reveal(el); }));
  await locator.click();
}
async function options(page) { if (await page.locator('body.campo-immersive #ma-options').isVisible()) await page.locator('#ma-options').click(); }
const farm = { plan:{cultivo:'papa'}, id: 'qa-junin', nombre: 'Huamancaca, Junín', ubicacion: { lat: -12.05, lon: -75.2 }, altitud: 3200, suelo: { estado: 'ok', ph: 6.4 },
  perfil: { cultivos: [{ id: 'papa', nombre: 'Papa', variedad: 'Blanca' }], riego: 'lluvia', insumos: ['guano'], cosecha: [5, 6] } };
const second = { ...farm, id: 'qa-costa', nombre: 'Chancay', ubicacion: { lat: -11.56, lon: -77.27 }, altitud: 120,
  perfil: { cultivos: [{ id: 'maiz', nombre: 'Maíz amarillo' }], riego: 'goteo', insumos: ['abono'], cosecha: [9] } };
async function seed(page) {
  await page.goto('/index.html?inicio=1');
  await page.evaluate(({ farm, second }) => {
    localStorage.setItem('parcelas', JSON.stringify([farm, second]));
    localStorage.setItem('parcelaActiva', JSON.stringify(farm.id));
    localStorage.setItem('musuq.lang', 'es');
  }, { farm, second });
}
async function ready(page) { await page.waitForFunction(() => window.CampoI18n?.catalog); }
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }

test('complete location → survey → parcel → recommendation → weather journey', async ({ page }) => {
  test.skip(!!process.env.BASE_URL, 'Deterministic provider journey is run locally.');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ubicar-chacra.html'); await ready(page);
  await page.locator('#buscar').fill('Huamancaca');
  await click(page, page.locator('#sugerencias button').first());
  await expect(page.locator('#mapa')).toBeVisible();
  await click(page, page.locator('#btnConfirmar'));
  await expect(page).toHaveURL(/conocerte/);
  await click(page, page.locator('[data-id="papa"]'));
  await click(page, page.locator('#btnSiguiente'));
  await click(page, page.locator('[data-id="lluvia"]'));
  await click(page, page.locator('#btnSiguiente'));
  await click(page, page.locator('[data-id="guano"]'));
  await click(page, page.locator('#btnSiguiente'));
  await click(page, page.locator('[data-m="5"]'));
  await click(page, page.locator('#btnCrear'));
  await expect(page.locator('.parcela')).toBeVisible();
  await click(page, page.locator('.parcela'));
  await click(page, page.getByRole('link', { name: /Qué siembro/ }));
  await expect(page.locator('#contenido')).toContainText('TE RECOMENDAMOS SEMBRAR');
  const recommended = await page.locator('.campo-cta').getAttribute('href');
  await click(page, page.locator('.campo-cta'));
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#interactive-crop')).toHaveValue(new URLSearchParams(recommended.split('?')[1]).get('crop'));
  await click(page, page.locator('.campo-back'));
  await click(page, page.getByRole('link', { name: /Mi campo hoy/ }));
  await expect(page.locator('#contenido .principal')).toBeVisible();
  await click(page, page.getByText('Ver detalles', { exact: true }));
  await expect(page.locator('#contenido')).toContainText('12 °C');
  await noOverflow(page); expect(errors).toEqual([]);
});

test('interactive plot uses survey, coordinates, cycle, and keeps state per parcel', async ({ page }) => {
  test.setTimeout(90000);
  await seed(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/parcela_neugrac_interactiva.html?id=qa-junin');
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#interactive-title')).toHaveText(farm.nombre);
  await expect(page.locator('#interactive-profile')).toContainText('Papa');
  await expect(page.locator('#interactive-profile')).toContainText('Lluvia');
  await expect(page.locator('#interactive-profile')).toContainText('Guano');
  await expect(page.locator('#interactive-profile')).toContainText(/mayo, junio/i);
  await expect(page.locator('#interactive-location')).toContainText('-12.05000, -75.20000');
  await expect(page.locator('#interactive-crop')).toHaveValue('papa');
  await page.evaluate(()=>MusuqParcela.goTo(0));
  await expect(page.locator('#ma-prev')).toBeDisabled();
  await click(page, page.locator('#ma-next'));
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-stage', 'plow');
  await click(page, page.locator('#ma-play'));
  await click(page, page.locator('#ma-play'));
  await click(page, page.locator('#ma-role'));
  await expect(page.locator('#ma-place')).toHaveText(farm.nombre);
  const record = JSON.parse(await page.locator('#ma-json').textContent());
  expect(record.parcel_id).toBe(farm.id); expect(record.location).toEqual(farm.ubicacion);
  expect(record.profile).toEqual(farm.perfil); expect(record.simulated).toBe(true);
  await expect(page.locator('#ma-alt')).toContainText(/3[,.\s]?200/);
  await expect(page.locator('#ma-crop')).toHaveText('Papa');
  await click(page, page.locator('#ma-env'));
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-env', 'field');
  await options(page); await page.locator('#interactive-parcel').selectOption(second.id);
  await expect(page.locator('#interactive-title')).toHaveText(second.nombre);
  await page.waitForFunction(() => window.MusuqParcela);
  expect(JSON.parse(await page.locator('#ma-json').textContent()).parcel_id).toBe(second.id);
  await expect(page.locator('#interactive-profile')).toContainText('Goteo');
  await options(page); await page.locator('#interactive-crop').selectOption('quinua');
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#interactive-crop')).toHaveValue('quinua');
  await page.reload(); await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#interactive-crop')).toHaveValue('quinua');
  await options(page); await page.locator('#interactive-parcel').selectOption(farm.id);
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-stage', 'plow');
  expect(await page.evaluate(() => Almacen.activa().perfil)).toEqual(farm.perfil);
  await expect(page.locator('.campo-back')).toHaveAttribute('href', 'parcela.html?id=' + farm.id);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('interactive.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('survey edit restores harvest and back navigation; drafts never leak to another parcel', async ({ page }) => {
  await seed(page); await page.goto('/mi-campo.html');
  await click(page, page.locator('[data-ir="cambiar-datos"]'));
  await expect(page.locator('[data-id="papa"]')).toHaveClass(/sel/);
  await click(page, page.locator('#btnSiguiente'));
  await expect(page.locator('[data-id="lluvia"]')).toHaveClass(/sel/);
  await click(page, page.locator('#btnSiguiente'));
  await expect(page.locator('[data-id="guano"]')).toHaveClass(/sel/);
  await click(page, page.locator('#btnSiguiente'));
  await expect(page.locator('[data-m="5"]')).toHaveClass(/on/);
  await expect(page.locator('[data-m="6"]')).toHaveClass(/on/);
  await click(page, page.locator('.campo-back'));
  await click(page, page.locator('#btnSiguiente'));
  await expect(page.locator('[data-m="6"]')).toHaveClass(/on/);
  await page.evaluate(() => Almacen.activar('qa-costa'));
  await page.goto('/mi-campo.html');
  await click(page, page.locator('[data-ir="cambiar-datos"]'));
  await click(page, page.locator('#btnSiguiente')); await click(page, page.locator('#btnSiguiente')); await click(page, page.locator('#btnSiguiente'));
  await expect(page.locator('[data-m="9"]')).toHaveClass(/on/);
  await expect(page.locator('[data-m="5"]')).not.toHaveClass(/on/);
});

test('languages remain synchronized without resetting dynamic parcel values', async ({ page }) => {
  await seed(page); await page.goto('/parcela_neugrac_interactiva.html');
  await page.waitForFunction(() => window.MusuqParcela);
  await page.evaluate(()=>MusuqParcela.goTo(0));
  await click(page, page.locator('#ma-lang')); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#interactive-title')).toHaveText(farm.nombre);
  await expect(page.locator('#interactive-profile')).toContainText('Rainfed');
  await click(page, page.locator('#ma-next'));
  await expect(page.locator('#ma-phase-name')).toHaveText('Plow');
  await click(page, page.locator('#ma-lang')); await expect(page.locator('html')).toHaveAttribute('lang', 'qu');
  await click(page, page.locator('#ma-lang')); await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await click(page, page.locator('#ma-next')); await expect(page.locator('#ma-phase-name')).toHaveText('Siembra');
  await expect(page.locator('#interactive-title')).toHaveText(farm.nombre);
});

test('empty state and home navigation work without a registered parcel', async ({ page }) => {
  await page.goto('/index.html?inicio=1');
  await expect(page.locator('#btnAgregar')).toBeVisible();
  await expect(page.locator('#lista')).toContainText('Todavía no tienes parcelas');
  await expect(page.locator('#abrirInteractiva')).toHaveCount(0);
  await page.goto('/parcela_neugrac_interactiva.html');
  await expect(page.locator('#interactive-empty')).toBeVisible();
  await expect(page.locator('#musuq-parcela')).toBeHidden();
  await click(page, page.locator('#interactive-empty a'));
  await expect(page.locator('#buscar')).toBeVisible(); await noOverflow(page);
});

test('one branded navbar, mint actions, archived tools, and all core screens fit the viewport', async ({ page }) => {
  await seed(page);
  for (const url of ['/index.html','/parcela.html?id=qa-junin','/menu.html','/mi-campo.html','/recomendacion.html','/clima.html','/aprender.html']) {
    await page.goto(url); await ready(page);
    await expect(page.locator('nav.campo-header')).toHaveCount(1);
    expect(await page.locator('nav.campo-header').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 19, 43)');
    await expect(page.locator('body > header a')).toHaveCount(0);
    await noOverflow(page);
  }
  await page.goto('/index.html');
  await expect(page.locator('.live-option')).toHaveCount(0);
  await expect(page.locator('#splash')).toHaveClass('oculto');
  await page.screenshot({ path: test.info().outputPath('home.png'), fullPage: true, animations: 'disabled' });
});

test('GPS refusal keeps the search alternative usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_, reject) => reject({ code: 1 });
  });
  await page.goto('/ubicar-chacra.html');
  await click(page, page.locator('#btnGpsInicial'));
  await expect(page.locator('#gpsHelp')).toBeVisible();
  await page.locator('#gpsHelpClose').click();
  await expect(page.locator('#buscar')).toBeVisible();
  await expect(page.locator('#btnGpsInicial')).toBeEnabled();
});

test('offline weather never shows the cached weather from another parcel', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => localStorage.setItem('clima', JSON.stringify({ lat: 0, lon: 0, dias: [{ fecha: '20260101', tmed: 99 }], actualizado: '2026-01-01' })));
  await page.route('**/api/climate?**', route => route.abort());
  await page.goto('/clima.html');
  await expect(page.locator('#contenido')).toContainText('Todavía no hay datos del clima');
  await expect(page.locator('#contenido')).not.toContainText('99');
});

test('3D unavailable retains survey context and working stage controls', async ({ page }) => {
  await seed(page);
  await page.route('**/js/vendor/three.r128.min.js*', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.goto('/parcela_neugrac_interactiva.html');
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('.ma-nogl')).toBeVisible();
  await page.evaluate(()=>MusuqParcela.goTo(0));
  await click(page, page.locator('#ma-next'));
  await click(page, page.locator('#ma-next'));
  await click(page,page.locator('#ma-tip-next'));
  await click(page,page.locator('#ma-tip-next'));
  await expect(page.locator('#ma-tip')).toContainText(/dependes de la lluvia/i);
  await expect(page.locator('#interactive-title')).toHaveText(farm.nombre);
});

test('registered plot and interactive module reload offline from the service worker', async ({ page, context }) => {
  await seed(page); await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/parcela_neugrac_interactiva.html');
  await page.waitForFunction(() => window.MusuqParcela);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('#interactive-title')).toHaveText(farm.nombre);
  await click(page, page.locator('#ma-next'));
  await expect(page.locator('#ma-phase-name')).toHaveText('Cosecha');
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain('musuq-v1.0.2-20261116');
});

for (const width of [320, 390, 768]) {
  test(`responsive controls stay aligned and separated at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await page.goto('/parcela_neugrac_interactiva.html');
    await page.waitForFunction(() => window.MusuqParcela);
    await options(page);
    await noOverflow(page);
    const box = selector => page.locator(selector).boundingBox();
    const [parcel, crop, toolbar, visual, language, header, env, role, previous, next] = await Promise.all(
      ['#interactive-parcel','#interactive-crop','.ma-top','.ma-visual','#ma-lang','.campo-header','#ma-env','#ma-role','#ma-prev','#ma-next'].map(box)
    );
    expect(Math.abs(parcel.y - crop.y)).toBeLessThan(1);
    expect(parcel.x + parcel.width).toBeLessThanOrEqual(crop.x);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(visual.y + 1);
    expect(language.y).toBeGreaterThanOrEqual(header.y);
    expect(language.y + language.height).toBeLessThanOrEqual(header.y + header.height);
    for (const control of [parcel,crop,language,env,role,previous,next]) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(width + 1);
    }
    expect(env.x + env.width).toBeLessThanOrEqual(role.x);
    expect(previous.x + previous.width).toBeLessThanOrEqual(next.x);
    await expect(page.locator('.campo-survey-details')).not.toHaveAttribute('open');
    await click(page, page.locator('#ma-role'));
    await expect(page.locator('#ma-role')).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('#ma-agro')).toBeVisible();
    const panel = await box('#ma-agro');
    expect(panel.y).toBeGreaterThanOrEqual(visual.y - 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(845);
    expect(await page.locator('#ma-agro').evaluate(el => getComputedStyle(el).overflowY)).toBe('hidden');
    await click(page, page.locator('.campo-survey-details > summary'));
    await expect(page.locator('#interactive-profile')).toBeVisible();
    await noOverflow(page);
    await click(page, page.locator('.campo-survey-details > summary'));
    await click(page, page.locator('#ma-role'));
    await expect(page.locator('#ma-agro')).toBeHidden();
    await page.screenshot({ path: test.info().outputPath(`mobile-layout-${width}.png`), fullPage: true });
  });
}

test('loading screen and health identify version 1.0.2', async ({ page, request }) => {
  await page.goto('/index.html?inicio=1');
  await expect(page.locator('#splash .splash-version')).toHaveText('v.1.0.2');
  await expect(page.locator('.campo-brand small')).toContainText('v.1.0.2');
  const response = await request.get('/api/health');
  expect((await response.json()).version).toBe('1.0.2');
});

test('upgrading from a cache-first legacy worker loads the new design and translations', async ({ page }) => {
  test.skip(!!process.env.BASE_URL, 'Legacy worker fixture is available only on the local test server.');
  await seed(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await navigator.serviceWorker.register('/legacy-sw.js');
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/legacy-sw.js'));
  await page.evaluate(async () => {
    const cache = await caches.open('legacy-v1');
    await cache.put('/css/components.css', new Response('body { background: red; }', { headers: { 'Content-Type': 'text/css' } }));
    await cache.put('/js/ui/shell.js', new Response('throw Error("Stale shell loaded")', { headers: { 'Content-Type': 'application/javascript' } }));
    await cache.put('/data/i18n.json', new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/parcela_neugrac_interactiva.html');
  await page.waitForFunction(() => window.MusuqParcela);
  await expect(page.locator('.campo-brand small')).toContainText('v.1.0.2');
  await expect(page.locator('#ma-role')).toHaveText('Ver datos');
  expect(await page.locator('.campo-header').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 19, 43)');
  await click(page, page.locator('#ma-next'));
  await expect(page.locator('#ma-phase-name')).toHaveText('Cosecha');
  expect(errors).toEqual([]);
});
