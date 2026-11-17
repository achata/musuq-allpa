/* The survey remains the source of truth; visual indicators are educational simulations. */
window.CampoInteractive = (() => {
  let parcel, crop, crops, data, weather = null, weatherState = 'loading';
  new ResizeObserver(() => {
    document.body.style.setProperty('--context-bottom', Math.round(document.querySelector('.campo-context').getBoundingClientRect().bottom) + 'px');
  }).observe(document.querySelector('.campo-context'));
  const text = (key, vars) => CampoI18n.t('integrated.' + key, vars);
  const el = id => document.getElementById(id);
  function render() {
    el('interactive-empty').hidden = !!parcel;
    el('interactive-fields').hidden = !parcel;
    el('musuq-parcela').hidden = !parcel;
    if (!parcel) return;
    el('interactive-title').textContent = parcel.nombre;
    const profile = parcel.perfil || {};
    const months = (profile.cosecha || []).map(CampoI18n.month).join(', ');
    const cropNames = (profile.cultivos || []).map(c => CampoI18n.crop(c.id, c.nombre)).join(', ');
    el('interactive-profile').textContent = [
      text('previousCrops') + ': ' + (cropNames || text('unrecorded')),
      text('irrigation') + ': ' + text('irrigationTypes.' + (profile.riego || 'unknown')),
      text('inputs') + ': ' + ((profile.insumos || []).map(i => text('inputTypes.' + i)).join(', ') || text('none')),
      text('harvest') + ': ' + (months || text('anyMonth'))
    ].join(' · ');
    const selector = el('interactive-parcel'); selector.replaceChildren();
    Almacen.todas().filter(Almacen.registrada).forEach(p => selector.add(new Option(p.nombre, p.id, false, p.id === parcel.id)));
    const cropSelector = el('interactive-crop'); cropSelector.replaceChildren();
    crops.forEach(c => cropSelector.add(new Option(CampoI18n.crop(c.id, c.nombre), c.id, false, c.id === crop.id)));
    selector.title = parcel.nombre;
    cropSelector.title = CampoI18n.crop(crop.id, crop.nombre);
    selector.setAttribute('aria-label', text('parcel'));
    cropSelector.setAttribute('aria-label', text('exploreCrop'));
    el('interactive-edit').href = parcel.perfil ? 'mi-campo.html' : 'conocerte.html';
    el('interactive-edit').textContent = text(parcel.perfil ? 'editSurvey' : 'completeSurvey');
    el('interactive-location').textContent = `${parcel.ubicacion.lat.toFixed(5)}, ${parcel.ubicacion.lon.toFixed(5)} · ${parcel.altitud ?? '—'} m`;
  }
  const ready = (async () => {
    await CampoI18n.ready;
    const id = new URLSearchParams(location.search).get('id');
    const candidate = id ? Almacen.todas().find(p => p.id === id) :
      (Almacen.registrada(Almacen.activa()) ? Almacen.activa() : Almacen.todas().find(Almacen.registrada) || Almacen.activa());
    if (!Almacen.registrada(candidate)) {
      el('interactive-loading').hidden = true;
      if (candidate) Almacen.activar(candidate.id);
      el('interactive-empty').hidden = false;
      el('interactive-fields').hidden = true;
      el('musuq-parcela').hidden = true;
      const link = el('interactive-empty').querySelector('a');
      link.href = candidate ? Ruta.paso() || 'ubicar-chacra.html' : 'ubicar-chacra.html';
      link.dataset.i18n = candidate ? 'integrated.completeSurvey' : 'integrated.create';
      link.textContent = CampoI18n.t(link.dataset.i18n);
      return null;
    }
    parcel = candidate;
    [crops, data] = await Promise.all(['/data/cultivos.json', '/data/interactive.json'].map(url => fetch(url).then(r => {
      if (!r.ok) throw Error('INTERACTIVE_DATA'); return r.json();
    })));
    if (parcel) {
      Almacen.activar(parcel.id);
      const requestedCrop = new URLSearchParams(location.search).get('crop');
      crop = crops.find(c => c.id === requestedCrop) || crops.find(c => c.id === parcel.plan?.cultivo) || crops.find(c => c.id === parcel.interactive?.cultivo) || crops.find(c => c.id === parcel.recomendacion?.cultivo) || crops.find(c => c.id === 'quinua') || crops[0];
      if (parcel.interactive?.cultivo !== crop.id) {
        parcel = Almacen.guardar({ ...parcel, interactive: { cultivo: crop.id, stage: 3, p: .72 } });
      }
      data.parcel = { id: parcel.id, place: parcel.nombre, lat: parcel.ubicacion.lat, lon: parcel.ubicacion.lon, altitude_m: parcel.altitud, crop: crop.id, start: null };
      // Cycle length comes from the same catalogue used by recommendations.
      const days = crop.perenne ? 365 : (Ciclo.duracionMedia(crop) || 6) * 30;
      const previousLength = data.series.ndvi.length;
      const total = days + 14;
      data.phases = [{ id: 'plow', days: 14 }, { id: 'sow', days: 10 }, { id: 'grow', days: days - 25 }, { id: 'harvest', days: 15 }];
      for (const [key, series] of Object.entries(data.series)) {
        data.series[key] = Array.from({ length: total }, (_, i) => series[Math.round(i / (total - 1) * (previousLength - 1))]);
      }
      // No sample laboratory measurements are attached to the user's land.
      data.soil = data.soil.map(s => ({ ...s, value: s.id === 'ph' && Number.isFinite(parcel.suelo?.ph) ? parcel.suelo.ph : null }));
    }
    render();
    el('interactive-loading').hidden = true;
    el('interactive-parcel').addEventListener('change', e => {
      location.href = 'parcela_neugrac_interactiva.html?id=' + encodeURIComponent(e.target.value);
    });
    el('interactive-crop').addEventListener('change', e => {
      Almacen.guardar({ ...Almacen.activa(), plan: { cultivo:e.target.value, actualizado:new Date().toISOString() }, interactive: { ...Almacen.activa().interactive, cultivo: e.target.value, stage: 3, p: .72 } });
      location.href = 'parcela_neugrac_interactiva.html?id=' + encodeURIComponent(parcel.id);
    });
    document.addEventListener('campo:language', render);
    document.dispatchEvent(new Event('campo:layout'));
    document.dispatchEvent(new Event('campo:interactive-ready'));
    refreshWeather();
    return parcel ? { data, parcel, crop } : null;
  })().catch(() => {
    el('interactive-loading').hidden = true;
    el('interactive-empty').hidden = false;
    el('interactive-empty').querySelector('span').textContent = text('loadError');
    const link = el('interactive-empty').querySelector('a');
    link.textContent = text('retry'); link.href = location.href;
    el('interactive-fields').hidden = true;
    el('musuq-parcela').hidden = true;
    return null;
  });
  function tip(phase) {
    const profile = parcel?.perfil;
    if (!profile) return '';
    if (phase === 'sow') return text('sowTip', { crop: CampoI18n.crop(crop.id, crop.nombre) }) + ' ' +
      (profile.riego === 'lluvia' ? text('rainTip') : text('waterTip', { irrigation: text('irrigationTypes.' + (profile.riego || 'unknown')) }));
    if (phase === 'grow') return profile.riego === 'lluvia' ? text('rainTip') : text('waterTip', { irrigation: text('irrigationTypes.' + (profile.riego || 'unknown')) });
    if (phase === 'plow' && profile.insumos?.length) return text('inputTip', { inputs: profile.insumos.map(i => text('inputTypes.' + i)).join(', ') });
    return '';
  }
  async function refreshWeather() {
    const cached = Clima.leerCache();
    weather = CampoFarmContext.observation(cached, parcel.ubicacion);
    if (weather) weatherState = 'cached';
    document.dispatchEvent(new Event('campo:weather'));
    try {
      const raw = await CampoApi.at('climate', parcel.ubicacion.lat, parcel.ubicacion.lon, { signal:AbortSignal.timeout(6500) });
      const latest = CampoFarmContext.observation(raw, parcel.ubicacion);
      if (!latest) throw Error('NASA_NO_DATA');
      weather = latest; weatherState = 'available';
      try { localStorage.setItem('clima', JSON.stringify(raw)); } catch {}
    } catch { weatherState = weather ? 'cached' : 'unavailable'; }
    data.observations = weather;
    document.dispatchEvent(new Event('campo:weather'));
  }
  function advice(phase) {
    if (!parcel || !crop) return [];
    const t = (key, vars) => CampoI18n.t('experience.' + key, vars);
    const list = [t('phaseAdvice.' + phase), t('cropAdvice', { crop:CampoI18n.crop(crop.id,crop.nombre) })];
    list.push(t(parcel.perfil.riego === 'lluvia' ? 'rainfedAdvice' : 'irrigationAdvice', { irrigation:text('irrigationTypes.' + parcel.perfil.riego) }));
    if (weather?.min != null && weather.min < 2) list.unshift(t('frostAdvice', { n:Math.round(weather.min) }));
    else if (weather?.moisture != null && weather.moisture < 18) list.unshift(t('dryAdvice', { n:Math.round(weather.moisture) }));
    else if (weather?.rain != null && weather.rain > 8) list.unshift(t('wetAdvice', { n:Math.round(weather.rain) }));
    if (parcel.perfil.insumos?.some(i => i !== 'ninguno')) list.push(t('inputAdvice', { inputs:parcel.perfil.insumos.filter(i => i !== 'ninguno').map(i => text('inputTypes.' + i)).join(', ') }));
    if (!weather) list.push(t('nasaMissing'));
    return list;
  }
  return { ready, render, tip, advice, get parcel() { return parcel; }, get crop() { return crop; }, get weather() { return weather; }, get weatherState() { return weatherState; }, get traits() { return CampoFarmContext.traits(crop?.id); } };
})();
