document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  const steps = ['ubicar-chacra.html', 'conocerte.html', 'riego.html', 'insumos.html', 'cosecha.html'];
  const header = document.createElement('nav'); document.body.prepend(header);
  header.classList.add('campo-header');
  const brand = document.createElement('a'); brand.href = 'index.html'; brand.textContent = 'campo';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'campo-language';
  header.append(brand);
  if (page === 'parcela_neugrac_interactiva.html') header.classList.add('campo-header--dark');
  else { header.append(button); new LanguageSwitch(button); }
  const index = steps.indexOf(page);
  const previous = index > 0 ? steps[index - 1] : page === 'index.html' ? null : 'index.html?inicio=1';
  if (previous) {
    const back = document.createElement('a'); back.className = 'campo-back'; back.href = previous; back.dataset.i18n = 'survey.back';
    (document.querySelector('main') || header).prepend(back);
  }
  // Translate text nodes, retaining markup and application-owned values/identifiers.
  const originals = new WeakMap();
  function translate() {
    const dictionary = CampoI18n.t('survey.texts');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('script,style,.campo-language') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }});
    let node;
    while ((node = walker.nextNode())) {
      if (!originals.has(node)) originals.set(node, node.textContent);
      const original = originals.get(node); const text = original.trim();
      const translated = dictionary?.[text];
      const next = translated ? original.replace(text, translated) : original;
      if (node.textContent !== next) node.textContent = next;
    }
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const value = CampoI18n.t(el.dataset.i18n);
      if (typeof value === 'string' && el.textContent !== value) el.textContent = value;
    });
  }
  CampoI18n.ready.then(() => {
    translate();
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return; scheduled = true;
      queueMicrotask(() => { scheduled = false; translate(); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('campo:language', translate);
  }).catch(() => { if (previous) document.querySelector('.campo-back').textContent = '← Volver'; });
});
