window.CampoI18n = (() => {
  let catalog, language = 'es';
  try { language = localStorage.getItem('musuq.lang') || 'es'; } catch {}
  const lookup = (object, path) => path.split('.').reduce((o, k) => o?.[k], object);
  const t = (key, vars = {}) => {
    const value = lookup(catalog?.[language], key) ?? key;
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : value;
  };
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = new Map();
  function text(source, depth = 0) {
    if (!catalog || language === 'es' || depth > 3) return source;
    const dictionary = catalog[language].survey.texts;
    const value = source.trim();
    if (dictionary[value]) return source.replace(value, dictionary[value]);
    for (const [pattern, translated] of Object.entries(catalog[language].templates || {})) {
      const names = Array.from(pattern.matchAll(/\{(\w+)\}/g), m => m[1]);
      const expression = '^' + pattern.split(/\{\w+\}/).map(escape).join('(.+?)') + '$';
      const match = value.match(new RegExp(expression, 'u'));
      if (match) return source.replace(value, translated.replace(/\{(\w+)\}/g, (_, name) => text(match[names.indexOf(name) + 1], depth + 1)));
    }
    // Handles compound labels (crop lists, units and criteria), preserving numbers and punctuation.
    if (!patterns.has(language)) {
      const keys = Object.keys(dictionary).filter(k => k && dictionary[k] !== k).sort((a,b) => b.length - a.length);
      patterns.set(language, new RegExp('(?<![\\p{L}])(?:' + keys.map(escape).join('|') + ')(?![\\p{L}])', 'gu'));
    }
    const re = patterns.get(language);
    return source.replace(re, match => dictionary[match]);
  }
  const crop = (id, fallback = '') => t('crops.' + id) === 'crops.' + id ? text(fallback) : t('crops.' + id);
  const month = number => t('months.' + (number - 1));
  function date(value) {
    const d = new Date(value);
    return Number.isNaN(+d) ? '' : t('date', { day: d.getUTCDate(), month: month(d.getUTCMonth() + 1), year: d.getUTCFullYear() });
  }
  function setLanguage(code) {
    if (!catalog?._meta.order.includes(code)) return;
    language = code;
    try { localStorage.setItem('musuq.lang', code); } catch {}
    document.documentElement.lang = t('lang.html');
    document.dispatchEvent(new CustomEvent('campo:language', { detail: code }));
  }
  const ready = fetch('/data/i18n.json?release=1.0.2').then(r => { if (!r.ok) throw new Error('I18N'); return r.json(); }).then(data => {
    catalog = data; if (!catalog._meta.order.includes(language)) language = catalog._meta.default;
    setLanguage(language); return catalog;
  });
  window.addEventListener('storage', e => { if (e.key === 'musuq.lang') setLanguage(e.newValue); });
  return { ready, t, text, crop, month, date, setLanguage, get language() { return language; }, get catalog() { return catalog; } };
})();
