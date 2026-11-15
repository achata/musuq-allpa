window.CampoApi = (() => {
  const base = window.CAMPO_API_BASE || '/api';
  async function request(path, { body, signal } = {}) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, signal: signal || AbortSignal.timeout(25000) });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.code || 'SERVICIO'); error.code = data.code; throw error; }
    return data;
  }
  const at = (route, lat, lon) => request(`/${route}?${new URLSearchParams({ lat, lon })}`);
  return { request, at, recommend: farm => request('/recommendations', { body: farm }) };
})();
