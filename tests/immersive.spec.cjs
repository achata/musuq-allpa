const { test, expect } = require('@playwright/test');
const farm = { id:'immersion', nombre:'Huamancaca, Junín', ubicacion:{lat:-12.05,lon:-75.2}, altitud:3200, suelo:{estado:'ok',ph:6.4}, perfil:{cultivos:[{id:'papa',nombre:'Papa'}],riego:'goteo',insumos:['guano'],cosecha:[5,6]},plan:{cultivo:'maiz'},interactive:{cultivo:'maiz',stage:3,p:.72} };
async function seed(page, language='es', parcels=[farm]) {
  await page.goto('/index.html?inicio=1');await page.waitForFunction(()=>window.CampoI18n?.catalog);
  await page.evaluate(({parcels,language})=>{localStorage.setItem('parcelas',JSON.stringify(parcels));localStorage.setItem('parcelaActiva',JSON.stringify(parcels[0]?.id));localStorage.setItem('musuq.lang',language);},{parcels,language});
}
async function interactive(page) {
  await page.goto('/parcela_neugrac_interactiva.html');await page.waitForFunction(()=>window.MusuqParcela);await expect(page.locator('#interactive-loading')).toBeHidden();
}

test('GPS denial explains recovery, avoids repeated denial and works after permission changes', async ({page})=>{
  await page.addInitScript(()=>{
    window.permissionState='prompt';window.gpsCalls=0;
    navigator.permissions.query=async()=>({state:window.permissionState});
    navigator.geolocation.getCurrentPosition=(ok,fail)=>{window.gpsCalls++;if(window.permissionState==='granted')ok({coords:{latitude:-12.05,longitude:-75.2,accuracy:30}});else{window.permissionState='denied';fail({code:1});}};
  });
  await page.goto('/ubicar-chacra.html');await page.waitForFunction(()=>window.CampoI18n?.catalog);
  await page.locator('#btnGpsInicial').click();await expect(page.locator('#gpsHelp')).toBeVisible();
  await page.locator('#gpsCheck').click();await expect(page.locator('#gpsHelpStatus')).toContainText('sigue bloqueado');
  expect(await page.evaluate(()=>window.gpsCalls)).toBe(1);
  await page.evaluate(()=>{window.permissionState='granted';});await page.locator('#gpsCheck').click();
  await expect(page.locator('#gpsHelp')).toBeHidden();await expect(page.locator('#mapa')).toBeVisible();
  await expect(page.locator('#estado')).toContainText('30 m');expect(await page.evaluate(()=>window.gpsCalls)).toBe(2);
});

test('GPS can recover with approximate location when precise location is unavailable', async({page})=>{
  await page.addInitScript(()=>{
    navigator.permissions.query=async()=>({state:'granted'});window.gpsAccuracy=[];
    navigator.geolocation.getCurrentPosition=(ok,fail,options)=>{window.gpsAccuracy.push(options.enableHighAccuracy);if(options.enableHighAccuracy)fail({code:2});else ok({coords:{latitude:-12.05,longitude:-75.2,accuracy:600}});};
  });
  await page.goto('/ubicar-chacra.html');await page.waitForFunction(()=>window.CampoI18n?.catalog);await page.locator('#btnGpsInicial').click();
  await expect(page.locator('#estado')).toContainText('600 m');expect(await page.evaluate(()=>window.gpsAccuracy)).toEqual([true,false]);
});

test('home archives tools and TikTok; all pages have the Neugrac tab icon',async({page,request})=>{
  await seed(page);await page.goto('/index.html');await expect(page.locator('#splash')).toHaveClass('oculto');
  await expect(page.locator('.live-option,#abrirInteractiva')).toHaveCount(0);
  await expect(page.getByText('Otras herramientas',{exact:true})).toHaveCount(0);
  for(const url of ['index.html','ubicar-chacra.html','parcela_neugrac_interactiva.html']){
    await page.goto('/'+url);await expect(page.locator('link[rel=icon][type="image/png"]')).toHaveAttribute('href',/favicon-32.png/);
  }
  expect((await request.get('/data/brand/neugrac.webp')).status()).toBe(200);
  expect((await request.get('/archive/otras-herramientas/inicio.html')).status()).toBe(404);
});

test('ghost hand teaches scrolling; swiping a parcel does not open it',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page,'es',Array.from({length:8},(_,i)=>({...farm,id:'parcel-'+i,nombre:'Parcela '+i})));
  await page.goto('/index.html');await expect(page.locator('#splash')).toHaveClass('oculto');
  await expect(page.locator('.campo-scroll-cue')).toBeVisible();await expect(page.locator('.campo-screen-nav')).toHaveCount(0);
  await page.locator('h1').hover();await page.mouse.wheel(0,650);
  await expect(page.locator('body>.campo-screen-stage')).toHaveAttribute('data-screen','2');
  await expect(page.locator('.campo-scroll-cue')).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('default immersive cube dominates the screen and is linked to planned maize and NASA',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page);await interactive(page);
  await expect(page.locator('body')).toHaveClass(/campo-immersive/);
  await expect(page.locator('.campo-header,.campo-context,.ma-top').first()).toBeHidden();
  const root=page.locator('#musuq-parcela');await expect(root).toHaveAttribute('data-crop','maiz');await expect(root).toHaveAttribute('data-crop-form','maize');
  await expect(root).toHaveAttribute('data-weather-source','nasa');await expect(root).toHaveAttribute('data-moisture','28');
  await expect(page.locator('#ma-planned-crop')).toContainText('Maíz');
  const bounds=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return {slot:box('.ma-slot'),timer:box('.ma-timer'),guide:box('.ma-guide'),root:box('#musuq-parcela'),height:innerHeight,width:innerWidth};});
  expect(bounds.root.h).toBe(bounds.height);expect(bounds.root.w).toBe(bounds.width);expect(bounds.slot.h).toBeGreaterThan(bounds.height*.55);
  expect(Math.abs(bounds.timer.y-bounds.guide.y)).toBeLessThan(1);expect(bounds.timer.x+bounds.timer.w).toBeLessThanOrEqual(bounds.guide.x);
  expect(bounds.guide.b).toBeLessThanOrEqual(bounds.height);expect(bounds.timer.b).toBeLessThanOrEqual(bounds.height);
  expect(await page.evaluate(()=>Almacen.activa().perfil)).toEqual(farm.perfil);
  await page.screenshot({path:test.info().outputPath('immersive.png')});expect(errors).toEqual([]);
});

test('crop selection saves the future plan without changing the previous crop',async({page})=>{
  await seed(page);await interactive(page);await page.locator('#ma-options').click();
  await expect(page.locator('.campo-context')).toBeVisible();await page.locator('#interactive-crop').selectOption('papa');
  await page.waitForFunction(()=>window.MusuqParcela);await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-crop','papa');
  expect(await page.evaluate(()=>Almacen.activa().plan.cultivo)).toBe('papa');expect(await page.evaluate(()=>Almacen.activa().perfil)).toEqual(farm.perfil);
  await expect(page.locator('body')).toHaveClass(/campo-immersive/);
});

test('NASA failure never substitutes weather from another plot',async({page})=>{
  await seed(page);await page.evaluate(()=>localStorage.setItem('clima',JSON.stringify({lat:0,lon:0,dias:[{fecha:'20261112',tmed:99,suelo:99}]})));
  await page.route('**/api/climate?**',r=>r.abort());await interactive(page);
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-weather-state','unavailable');
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-weather-source','unavailable');
  await expect(page.locator('#ma-nasa-status')).not.toContainText('99');await expect(page.locator('#ma-planned-crop')).toContainText('Maíz');
});

test('hold Neugrac for 3 seconds to play, throw to change track, hold again to stop',async({page})=>{
  test.setTimeout(45000);await seed(page);await interactive(page);
  const mascot=page.locator('#ma-ng');const box=await mascot.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-radio','on',{timeout:5000});await page.mouse.up();
  const current=await mascot.boundingBox();await page.mouse.move(current.x+current.width/2,current.y+current.height/2);await page.mouse.down();
  await page.mouse.move(current.x+current.width/2-100,current.y+current.height/2-80,{steps:3});await page.mouse.up();
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-radio-track','1');
  await expect.poll(async()=>{const a=await mascot.boundingBox(),b=await page.locator('.ma-ng').boundingBox();return Math.hypot(a.x-b.x,a.y-b.y);}).toBeLessThan(24);
  const last=await mascot.boundingBox();await page.mouse.move(last.x+last.width/2,last.y+last.height/2);await page.mouse.down();
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-radio','off',{timeout:5000});await page.mouse.up();
});

for(const lang of ['en','qu'])test(`immersive and permission recovery use only ${lang} interface strings`,async({page})=>{
  await seed(page,lang);await interactive(page);
  await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('#ma-planned-crop')).toContainText(lang==='en'?'Yellow maize':'Qillu sara');
  await expect(page.locator('#ma-radio-status')).toContainText(lang==='en'?'Hold Neugrac':'Neugracta');
  await page.locator('#ma-options').click();await expect(page.locator('#interactive-crop')).toHaveValue('maiz');
  const original=await page.evaluate(()=>Almacen.activa().perfil);expect(original).toEqual(farm.perfil);
});

test('a real touch hold on Neugrac activates the radio',async({page},info)=>{
  test.skip(info.project.name!=='mobile','Touch gesture is verified in the mobile project.');
  await seed(page);await interactive(page);const box=await page.locator('#ma-ng').boundingBox();
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await expect(page.locator('#musuq-parcela')).toHaveAttribute('data-radio','on',{timeout:5000});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
});
