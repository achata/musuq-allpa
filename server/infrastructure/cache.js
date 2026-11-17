// Bounded TTL cache with single-flight requests. Failed requests are never cached.
class MemoryCache {
  constructor({ ttl = 3600000, limit = 500 } = {}) {
    this.ttl = ttl; this.limit = limit; this.entries = new Map(); this.pending = new Map();
  }
  async get(key, load) {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = Promise.resolve().then(load).then(value => {
      if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value);
      this.entries.set(key, { value, expires: Date.now() + this.ttl });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
module.exports = { MemoryCache };
