/* Google Maps + Places (New). The browser key is provided by server configuration. */
window.CampoMaps = (() => {
  let config, loaded, session;
  const configuration = () => config ||= CampoApi.request('/maps-config');
  async function googleLibraries() {
    if (loaded) return loaded;
    loaded = (async () => {
      const settings = await configuration();
      if (!settings.key) throw Error('MAPS_NOT_CONFIGURED');
      await new Promise((resolve, reject) => {
        if (window.google?.maps?.importLibrary) return resolve();
        const callback = '__campoGoogleMapsReady';
        const timer = setTimeout(() => { reject(Error('MAPS_TIMEOUT')); }, 15000);
        window[callback] = () => { clearTimeout(timer); delete window[callback]; resolve(); };
        window.gm_authFailure = () => { clearTimeout(timer); reject(Error('MAPS_AUTH')); document.dispatchEvent(new Event('campo:map-error')); };
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key: settings.key, v: 'weekly', loading: 'async', callback, language: 'en', region: 'PE' });
        script.onerror = () => { clearTimeout(timer); reject(Error('MAPS_LOAD')); };
        document.head.append(script);
      });
      return google.maps;
    })();
    loaded.catch(() => { loaded = null; });
    return loaded;
  }
  async function isGoogle() { return (await configuration()).provider === 'google'; }
  async function create(container, lat, lon, zoom, onMove) {
    if (await isGoogle()) {
      const maps = await googleLibraries();
      const { Map } = await maps.importLibrary('maps');
      const map = new Map(container, { center: { lat, lng: lon }, zoom, mapTypeId: 'hybrid', disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false });
      map.addListener('center_changed', () => { const c = map.getCenter(); if (c) onMove({ lat: c.lat(), lon: c.lng() }); });
      return {
        provider: 'google',
        setView(a,o,z) { map.setCenter({ lat:a, lng:o }); map.setZoom(z); },
        resize() { const c = map.getCenter(); maps.event.trigger(map, 'resize'); if (c) map.setCenter(c); },
        zoom(delta) { map.setZoom(map.getZoom() + delta); }
      };
    }
    if (!window.L) throw Error('MAPS_LOAD');
    const map = L.map(container, { zoomControl:false, attributionControl:true }).setView([lat, lon], zoom);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(map);
    map.on('move', () => { const c = map.getCenter(); onMove({lat:c.lat,lon:c.lng}); });
    tiles.on('tileerror', () => document.dispatchEvent(new Event('campo:tiles-error')));
    tiles.on('tileload', () => document.dispatchEvent(new Event('campo:tiles-ready')));
    return { provider:'openstreetmap', setView(a,o,z) { map.setView([a,o],z); }, resize() { const c = map.getCenter(); map.invalidateSize({ pan:false }); map.setView(c, map.getZoom(), { animate:false }); }, zoom(delta) { map.setZoom(map.getZoom()+delta); } };
  }
  async function search(input, { signal } = {}) {
    const maps = await googleLibraries();
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary('places');
    session ||= new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken:session, includedRegionCodes:['pe'], language:'en', region:'pe' });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return suggestions.filter(s => s.placePrediction).map(({placePrediction: prediction}) => ({
      nombre: prediction.text.toString(),
      async resolve() {
        const place = prediction.toPlace();
        await place.fetchFields({ fields:['location'] });
        session = null;
        if (!place.location) throw Error('PLACE_LOCATION');
        return { lat:place.location.lat(), lon:place.location.lng() };
      }
    }));
  }
  return { isGoogle, create, search };
})();
