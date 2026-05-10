'use strict';
class TtlCache extends Map {
  set(key, value, ttlMs) {
    super.set(key, { value, expiry: Date.now() + ttlMs });
  }
  get(key) {
    const entry = super.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.delete(key);
      return undefined;
    }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
}
module.exports = { TtlCache };
