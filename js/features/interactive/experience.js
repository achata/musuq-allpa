/* The initial view is immersive without requiring browser fullscreen permission. */
window.CampoExperience = (() => {
  const root = document.getElementById('musuq-parcela');
  const stage = root.querySelector('.ma-stage');
  const bottom = document.createElement('div'); bottom.className = 'ma-bottom';
  bottom.append(root.querySelector('.ma-timer'), root.querySelector('.ma-guide')); stage.append(bottom);
  const guide = root.querySelector('.ma-guide');
  const tipControls = document.createElement('div'); tipControls.className = 'ma-tip-controls';
  tipControls.innerHTML = '<button id="ma-tip-prev" type="button">‹</button><span id="ma-tip-count"></span><button id="ma-tip-next" type="button">›</button>';
  root.querySelector('.ma-bubble').append(tipControls);
  const caption = document.createElement('div'); caption.className = 'ma-crop-caption';
  caption.innerHTML = '<span id="ma-planned-crop"></span><small id="ma-nasa-status"></small>';
  root.querySelector('.ma-slot').append(caption);
  const controls = document.createElement('div'); controls.className = 'ma-immersive-controls';
  controls.innerHTML = '<a class="ma-quiet-button" href="parcela.html" id="ma-exit">←</a><button class="ma-quiet-button" id="ma-fullscreen" type="button"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg></button><button class="ma-quiet-button" id="ma-options" type="button">☰</button>';
  root.append(controls);
  const radio = document.createElement('p'); radio.id = 'ma-radio-status'; guide.querySelector('.ma-bubble').append(radio);
  const source = document.createElement('section'); source.className = 'ma-observed'; source.id = 'ma-observed';
  root.querySelector('.ma-agro-in').prepend(source);
  let phase = 'grow', index = 0, paused = false;
  const t = (key, vars) => CampoI18n.t('experience.' + key, vars);
  function render() {
    if (!CampoI18n.catalog) return;
    const context = window.CampoInteractive;
    const messages = context?.advice?.(phase) || [];
    index %= messages.length || 1;
    if (messages.length) document.getElementById('ma-tip').textContent = messages[index];
    document.getElementById('ma-tip-count').textContent = `${index + 1} / ${messages.length || 1}`;
    document.getElementById('ma-tip-prev').setAttribute('aria-label', t('previousTip'));
    document.getElementById('ma-tip-next').setAttribute('aria-label', t('nextTip'));
    const immersive = document.body.classList.contains('campo-immersive');
    document.getElementById('ma-options').textContent = immersive ? '☰' : '×';
    document.getElementById('ma-options').setAttribute('aria-label', t(immersive ? 'options' : 'returnCube'));
    document.getElementById('ma-options').setAttribute('aria-expanded', String(!immersive));
    document.getElementById('ma-fullscreen').setAttribute('aria-label', t(document.fullscreenElement ? 'exitFullscreen' : 'fullscreen'));
    const parcel = context?.parcel;
    document.getElementById('ma-exit').href = parcel ? 'parcela.html?id=' + encodeURIComponent(parcel.id) : 'index.html';
    document.getElementById('ma-exit').setAttribute('aria-label', CampoI18n.t('survey.back'));
    if (context?.crop) document.getElementById('ma-planned-crop').textContent = t('preview', { crop: CampoI18n.crop(context.crop.id, context.crop.nombre) });
    const weather = context?.weather;
    const weatherState = context?.weatherState || 'loading';
    const metrics = weather ? [weather.temperature == null ? null : Math.round(weather.temperature) + ' °C', weather.moisture == null ? null : Math.round(weather.moisture) + ' %'].filter(Boolean).join(' · ') : '';
    document.getElementById('ma-nasa-status').textContent = weather ? 'NASA · ' + metrics : t(weatherState === 'loading' ? 'nasaLoading' : 'nasaMissing');
    source.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('observedTitle'); source.append(title);
    const line = document.createElement('p');
    line.textContent = weather ? t('observedDate', { date:CampoI18n.date(weather.date.slice(0,4)+'-'+weather.date.slice(4,6)+'-'+weather.date.slice(6,8)) }) + ' · ' + metrics : t(weatherState === 'loading' ? 'nasaLoading' : 'nasaMissing');
    source.append(line);
    const note = document.createElement('p'); note.textContent = t('regional'); source.append(note);
    root.dataset.crop = context?.crop?.id || '';
    root.dataset.weatherSource = weather ? 'nasa' : 'unavailable';
    root.dataset.weatherState = weatherState;
    root.dataset.moisture = weather?.moisture ?? '';
    root.dataset.cropForm = context?.traits?.form || '';
  }
  document.getElementById('ma-tip-prev').onclick = () => { index = Math.max(0,index - 1); render(); };
  document.getElementById('ma-tip-next').onclick = () => { index++; render(); };
  guide.addEventListener('pointerenter', () => { paused = true; });
  guide.addEventListener('pointerleave', () => { paused = false; });
  const timer = setInterval(() => { if (!document.hidden && !paused) { index++; render(); } }, 8500);
  window.addEventListener('pagehide', () => clearInterval(timer), { once:true });
  document.getElementById('ma-options').onclick = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
    document.body.classList.toggle('campo-immersive'); render();
    if (document.body.classList.contains('campo-immersive')) window.MusuqParcela?.setRole('farmer');
    document.dispatchEvent(new Event('campo:layout'));
  };
  document.getElementById('ma-fullscreen').onclick = async () => {
    document.body.classList.add('campo-immersive');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen?.(); } catch { /* Immersive layout remains available on iOS and restricted contexts. */ }
    render();
  };
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('campo:language', render);
  document.addEventListener('campo:weather', render);
  document.addEventListener('campo:interactive-ready', render);
  return { render, setPhase(next) { if (phase !== next) { phase = next; index = 0; } render(); } };
})();
