window.CampoI18n = (() => {
  let catalog, language = 'es';
  try { language = localStorage.getItem('musuq.lang') || 'es'; } catch {}
  const lookup = (object, path) => path.split('.').reduce((o, k) => o?.[k], object);
  const t = (key, vars = {}) => {
    const value = lookup(catalog?.[language], key) ?? lookup(catalog?.es, key) ?? key;
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : value;
  };
  function setLanguage(code) {
    if (!catalog?._meta.order.includes(code)) return;
    language = code;
    try { localStorage.setItem('musuq.lang', code); } catch {}
    document.documentElement.lang = t('lang.html');
    document.dispatchEvent(new CustomEvent('campo:language', { detail: code }));
  }
  const ready = fetch('/data/i18n.json').then(r => { if (!r.ok) throw new Error('I18N'); return r.json(); }).then(data => {
    catalog = data; if (!catalog._meta.order.includes(language)) language = catalog._meta.default;
    setLanguage(language); return catalog;
  });
  window.addEventListener('storage', e => { if (e.key === 'musuq.lang') setLanguage(e.newValue); });
  return { ready, t, setLanguage, get language() { return language; }, get catalog() { return catalog; } };
})();
