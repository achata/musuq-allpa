/* One readable screen at a time; keep the original nodes and their event handlers. */
window.CampoScreens = class CampoScreens {
  static instances = [];
  constructor(track) {
    this.track = track;
    this.index = 0;
    this.stage = document.createElement('div');
    this.stage.className = 'campo-screen-stage';
    this.viewport = document.createElement('div');
    this.viewport.className = 'campo-screen-viewport';
    this.controls = document.createElement('div');
    this.controls.className = 'campo-scroll-cue';
    this.controls.setAttribute('aria-hidden', 'true');
    this.controls.innerHTML = '<svg viewBox="0 0 64 80" fill="none" aria-hidden="true"><path d="M32 18V5m-6 6 6-6 6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M23 51V29c0-8 9-8 9 0v13-5c0-6 9-6 9 0v7-3c0-6 9-6 9 0v6c0-5 9-5 9 1v11c0 11-7 17-18 17h-5c-6 0-10-3-14-8l-10-13c-5-7 2-12 7-6l4 4Z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg><span></span>';
    this.status = document.createElement('span');
    this.status.className = 'campo-screen-status';
    this.status.setAttribute('aria-live', 'polite');
    track.before(this.stage);
    this.stage.append(this.viewport, this.controls, this.status);
    this.viewport.append(track);
    track.classList.add('campo-screen-track');
    this.viewport.tabIndex = -1;
    const dismiss = () => { this.dismissed = true; this.controls.hidden = true; };
    this.observer = new MutationObserver(() => this.schedule());
    this.observe();
    new ResizeObserver(() => this.schedule()).observe(this.viewport);
    track.addEventListener('toggle', () => this.schedule(), true);
    document.addEventListener('campo:language', () => this.schedule());
    document.addEventListener('campo:layout', () => this.schedule());
    let locked = 0, start;
    this.viewport.addEventListener('wheel', e => {
      if (e.ctrlKey || e.target.closest('select,textarea,input,.leaflet-container,.ma-scroll,canvas') || Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      if (Date.now() < locked) return;
      dismiss(); this.go(this.index + Math.sign(e.deltaY)); locked = Date.now() + 600;
    }, { passive: false });
    this.viewport.addEventListener('touchstart', e => {
      start = e.touches.length === 1 && !e.target.closest('input,select,textarea,.leaflet-container,canvas,.ma-scroll') ? e.touches[0].clientY : null;
    }, { passive: true });
    this.viewport.addEventListener('touchend', e => {
      if (start == null) return;
      const delta = start - e.changedTouches[0].clientY;
      if (Math.abs(delta) > 45) { dismiss(); this.swipedAt = Date.now(); this.go(this.index + Math.sign(delta)); }
      start = null;
    });
    this.viewport.addEventListener('click', e => { if (Date.now() - (this.swipedAt || 0) < 400) { e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('keydown', e => {
      if (!this.stage.getClientRects().length || e.target.closest('input,select,textarea,canvas') || !['PageDown','PageUp'].includes(e.key)) return;
      e.preventDefault(); dismiss(); this.go(this.index + (e.key === 'PageDown' ? 1 : -1));
    });
    CampoScreens.instances.push(this);
    this.schedule();
  }
  observe() { this.observer.observe(this.track, { childList: true, subtree: true, characterData: true }); }
  schedule() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => { this.pending = null; this.layout(); });
  }
  layout() {
    const height = this.viewport.clientHeight;
    if (height < 80) return;
    this.observer.disconnect();
    this.units?.forEach(el => { el.classList.remove('campo-screen-away'); el.inert = false; el.removeAttribute('aria-hidden'); });
    this.track.style.transform = 'none';
    const origin = this.track.getBoundingClientRect().top;
    const atomic = 'p,h1,h2,h3,h4,a,button,input,select,textarea,label,summary,figure,table,pre,.opcion,.opcion-ubicacion,.parcela,.vacio,.otra,.activa,.fila,.chips,.meses,.linea,.lineaMeses,.tarjeta:not(.principal)';
    const walk = parent => Array.from(parent.children).flatMap(el => {
      if (!el.getClientRects().length || el.matches('script,style,[hidden]')) return [];
      if ((el.matches(atomic) && el.getBoundingClientRect().height <= height - 16) || !el.children.length || Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return [el];
      return walk(el);
    });
    this.units = walk(this.track);
    const rows = [];
    this.units.map(el => ({ el, top: el.getBoundingClientRect().top - origin, bottom: el.getBoundingClientRect().bottom - origin }))
      .sort((a,b) => a.top - b.top).forEach(item => {
        const last = rows.at(-1);
        if (last && item.top < last.bottom - 1) { last.items.push(item.el); last.bottom = Math.max(last.bottom, item.bottom); }
        else rows.push({ top: item.top, bottom: item.bottom, items: [item.el] });
      });
    this.pages = [{ offset: 0, units: [] }];
    for (const row of rows) {
      let page = this.pages.at(-1);
      if (page.units.length && row.bottom > page.offset + height - 8) {
        page = { offset: Math.max(0, row.top - 8), units: [] }; this.pages.push(page);
      }
      page.units.push(...row.items);
    }
    this.index = Math.min(this.index, this.pages.length - 1);
    this.go(this.index, false);
    this.observe();
  }
  go(index, animate = true) {
    if (!this.pages) return;
    const direction = index >= this.index ? 1 : -1;
    this.index = Math.max(0, Math.min(index, this.pages.length - 1));
    const page = this.pages[this.index];
    const active = new Set(page.units);
    this.units.forEach(el => {
      const away = !active.has(el);
      el.classList.toggle('campo-screen-away', away); el.inert = away;
      if (away) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
    });
    this.track.style.transform = `translateY(-${page.offset}px)`;
    if (animate) { this.viewport.getAnimations().forEach(a => a.cancel()); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.viewport.animate([{ transform: `translateY(${direction * 100}%)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' }); }
    const t = key => window.CampoI18n?.catalog ? CampoI18n.t('screens.' + key) : key;
    this.controls.querySelector('span').textContent = t('swipe');
    this.status.textContent = `${this.index + 1} / ${this.pages.length}`;
    this.controls.hidden = this.pages.length < 2 || this.dismissed;
    this.stage.dataset.screen = this.index + 1;
    this.stage.dataset.screens = this.pages.length;
    // Keep browser focus outside hidden content after advancing with the wheel.
    if (this.units.some(el => el.inert && el.contains(document.activeElement))) this.viewport.focus({ preventScroll: true });
  }
  reveal(el) { const index = this.pages?.findIndex(p => p.units.some(unit => unit === el || unit.contains(el))); if (index >= 0) this.go(index); }
};
