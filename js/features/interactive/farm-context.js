(function(root) {
  const traits = id => ['maiz','choclo'].includes(id) ? { form:'maize', height:1.9, leaf:1.55, grain:'#ffd166' }
    : ['papa','papa-nativa','camote','fresa','cebolla'].includes(id) ? { form:'low', height:.55, leaf:1.35, grain:'#b8cf71' }
    : ['palta','mango','cafe','cacao','platano'].includes(id) ? { form:'tree', height:1.6, leaf:1.8, grain:'#e99d5b' }
    : { form:'grain', height:1, leaf:1, grain:'#eac66a' };
  function observation(raw, location) {
    if (!raw || Math.abs(raw.lat - location.lat) > .00001 || Math.abs(raw.lon - location.lon) > .00001 || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null;
    const latest = (raw.dias || []).filter(d => /^\d{8}$/.test(d.fecha)).sort((a,b) => a.fecha.localeCompare(b.fecha)).at(-1);
    if (!latest) return null;
    const number = key => Number.isFinite(latest[key]) && latest[key] !== -999 ? latest[key] : null;
    return { source:'NASA POWER', date:latest.fecha, temperature:number('tmed'), min:number('tmin'), max:number('tmax'), rain:number('lluvia'), moisture:number('suelo'), wind:number('viento') };
  }
  const api = { traits, observation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampoFarmContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
