document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  const originalTitle = document.title;
  const steps = ['ubicar-chacra.html', 'conocerte.html', 'riego.html', 'insumos.html', 'cosecha.html'];
  document.body.style.setProperty('--page-gutter', getComputedStyle(document.body).paddingLeft);
  document.body.classList.add('campo-app');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0b132b');
  const interactive = page === 'parcela_neugrac_interactiva.html';
  if (interactive) document.body.classList.add('campo-interactive');
  // Replace brand-only legacy headers, retaining the location step's title/help.
  document.querySelectorAll('body > header').forEach(el => {
    if (!el.querySelector('h1')) el.remove();
  });
  const header = document.createElement('nav'); document.body.prepend(header);
  header.setAttribute('aria-label', 'Navegación principal');
  header.classList.add('campo-header');
  const brand = document.createElement('a'); brand.href = 'index.html?inicio=1'; brand.className = 'campo-brand';
  brand.innerHTML = '<img class="campo-brand-image" src="data/brand/musuq-allpa.jpg" width="64" height="52" alt=""><span>Musuq Allpa<small>campo · v.1.0.2</small></span>';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'campo-language';
  const links = document.createElement('div'); links.className = 'campo-header-actions';
  const home = document.createElement('a'); home.href = 'index.html?inicio=1'; home.textContent = 'Mis parcelas';
  if (page === 'index.html') home.setAttribute('aria-current', 'page');
  links.append(home);
  header.append(brand);
  if (interactive) {
    const language = document.getElementById('ma-lang');
    language.className = 'campo-language';
    links.append(language);
    new LanguageSwitch(language);
  } else { links.append(button); new LanguageSwitch(button); }
  header.append(links);
  const index = steps.indexOf(page);
  const requestedId = new URLSearchParams(location.search).get('id');
  const active = typeof Almacen !== 'undefined' && (requestedId ? Almacen.todas().find(p => p.id === requestedId) : Almacen.activa());
  const previous = index > 0 ? steps[index - 1] : page === 'index.html' ? null :
    index < 0 && active?.perfil && page !== 'parcela.html' ? 'parcela.html?id=' + encodeURIComponent(active.id) : 'index.html?inicio=1';
  if (previous) {
    const back = document.createElement('a'); back.className = 'campo-back'; back.href = previous; back.dataset.i18n = 'survey.back';
    links.prepend(back);
  }
  // Small vector icons keep navigation legible on devices without emoji fonts.
  const iconPaths = {
    '📍': '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    '🌾': '<path d="M5 22 18 3M10 15C4 15 3 11 3 9c5 0 7 3 7 6Zm3-5c-5 0-6-4-6-6 5 0 7 2 6 6Zm0 0c0-5 4-6 7-6 0 4-2 6-7 6Zm-3 5c1-4 5-4 9-3-1 4-5 5-9 3Z"/>',
    '🎙️': '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    '🌱': '<path d="M12 22V11M12 14C4 14 2 9 3 5c7 0 9 3 9 9Zm0-3c0-6 4-9 9-9 0 6-3 9-9 9Z"/>',
    '📖': '<path d="M12 5v17M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 3-2-3-5-4-9-3Z"/>',
    '🌞': '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    '✏️': '<path d="m3 21 1-6L17 2l5 5L9 20l-6 1ZM14 5l5 5M4 15l5 5"/>',
    '➕': '<path d="M12 3v18M3 12h18"/>',
    '🥔': '<path d="M21 9c2 6-4 12-10 13C4 23 1 18 3 12 5 5 18 0 21 9Z"/><path d="m8 11 1 1m5-5 1 1m-2 9 1 1"/>',
    '🌽': '<path d="M9 17c-6-1-7-6-7-6 7 0 11 3 11 10 1-6 4-10 9-12 0 8-5 12-10 13M8 14V7c0-7 10-7 10 0v6M12 3v11m-3-7h8m-8 4h8"/>'
  };
  function decorateIcons() {
    document.querySelectorAll('.ico,.icono,.menu-icon').forEach(el => {
      const paths = iconPaths[el.textContent.trim()];
      if (!paths || el.querySelector('svg')) return;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    });
  }

  // Translate text nodes, retaining markup and application-owned values/identifiers.
  const originals = new WeakMap();
  function translate() {
    decorateIcons();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('script,style,.campo-language,.ma,[data-campo-context],[data-user-value],[data-localized-text],.campo-screen-nav') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }});
    let node;
    while ((node = walker.nextNode())) {
      const prior = originals.get(node);
      const original = prior && node.textContent === prior.rendered ? prior.source : node.textContent;
      const text = original.trim();
      const next = CampoI18n.text(original);
      if (node.textContent !== next) node.textContent = next;
      originals.set(node, { source: original, rendered: next });
    }
    document.querySelectorAll('[data-i18n]:not(.ma [data-i18n]):not(#interactive-title)').forEach(el => {
      const value = CampoI18n.t(el.dataset.i18n);
      if (typeof value === 'string' && el.textContent !== value) el.textContent = value;
    });
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el => {
      if (el.closest('.ma,[data-campo-context],[data-user-value]') || el.matches('.campo-language')) return;
      for (const attr of ['placeholder','aria-label','title']) {
        if (!el.hasAttribute(attr)) continue;
        el.dataset['source' + attr.replace(/[^a-z]/g,'')] ||= el.getAttribute(attr);
        el.setAttribute(attr, CampoI18n.text(el.dataset['source' + attr.replace(/[^a-z]/g,'')]));
      }
    });
    document.title = CampoI18n.text(originalTitle);
    document.documentElement.dataset.localized = 'true';
  }
  CampoI18n.ready.then(() => {
    translate();
    if (!interactive && document.querySelector('body > main')) new CampoScreens(document.querySelector('body > main'));
    if (interactive) {
      new CampoScreens(document.querySelector('.ma-agro-in'));
      new CampoScreens(document.querySelector('.campo-survey-content'));
    }
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return; scheduled = true;
      queueMicrotask(() => { scheduled = false; translate(); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('campo:language', translate);
  }).catch(() => {
    const messages = {
      es: ['No se pudo cargar esta pantalla. Tus parcelas siguen guardadas.', 'Reintentar'],
      en: ['This screen could not load. Your plots are still saved.', 'Try again'],
      qu: ['Kay qhawanata mana kichayta atirqaykuchu. Chakraykikuna waqaychasqallam.', 'Yapamanta ruray']
    };
    const [message, label] = messages[document.documentElement.lang] || messages.es;
    const main = document.createElement('main');
    const paragraph = document.createElement('p'); paragraph.textContent = message;
    const retry = document.createElement('button'); retry.textContent = label; retry.onclick = () => location.reload();
    main.append(paragraph, retry); document.body.replaceChildren(main);
    document.documentElement.dataset.localized = 'true';
  });
});
