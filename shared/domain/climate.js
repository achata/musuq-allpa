(function(root) {
  function summarizeClimate(cache) {
    const days = cache.dias.slice(-5);
    const mean = key => { const a = days.map(d => d[key]).filter(Number.isFinite); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
    const rain = days.map(d => d.lluvia).filter(Number.isFinite);
    return { tmed: mean('tmed'), tmin: mean('tmin'), lluviaMax: rain.length ? Math.max(...rain) : null,
      hr: mean('hr'), viento: mean('viento'), suelo: mean('suelo'), estimado: false };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { summarizeClimate };
  else root.ClimateDomain = { summarizeClimate };
})(typeof window !== 'undefined' ? window : globalThis);
