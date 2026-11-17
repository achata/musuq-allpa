class ServiceError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}

function createHttpClient({ fetchImpl = fetch, timeout = 12000 } = {}) {
  return async function get(url) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'Campo/1.0 (agricultural application)', Accept: 'application/json' }
      });
      if (!response.ok) throw new ServiceError('PROVEEDOR_NO_DISPONIBLE');
      return await response.json();
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('PROVEEDOR_NO_DISPONIBLE');
    }
  };
}
module.exports = { createHttpClient, ServiceError };
