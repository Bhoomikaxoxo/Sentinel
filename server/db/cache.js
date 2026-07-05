class Cache {
  constructor() {
    this.store = new Map();
    this.TTL = 24 * 60 * 60 * 1000; // 24 hours
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value) {
    this.store.set(key, {
      value,
      expiry: Date.now() + this.TTL
    });
  }
}

module.exports = new Cache();
