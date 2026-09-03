/**
 * A blob store the test can break on purpose.
 *
 * It keeps a version tag per key and honours conditional writes, so a test can
 * slip a competing write in between a read and a save and watch what happens.
 */
const keys = new Map();
let version = 0;

export const control = {
  failReads: false,
  failWrites: false,
  reads: 0,
  writes: 0,
  refused: 0,
  /** Runs once after the next read, standing in for another instance writing. */
  afterNextRead: null,
  seed(key, value) {
    keys.set(key, { body: JSON.stringify(value), etag: `v${++version}` });
  },
  raw(key) {
    const row = keys.get(key);
    return row ? JSON.parse(row.body) : null;
  },
  reset() {
    keys.clear();
    this.failReads = false;
    this.failWrites = false;
    this.reads = 0;
    this.writes = 0;
    this.refused = 0;
    this.afterNextRead = null;
  },
};

export function getStore() {
  return {
    async get(key) {
      control.reads += 1;
      if (control.failReads) throw new Error("simulated blob outage");
      return keys.get(key)?.body ?? null;
    },
    async getWithMetadata(key) {
      control.reads += 1;
      if (control.failReads) throw new Error("simulated blob outage");
      const row = keys.get(key);
      const hook = control.afterNextRead;
      if (hook) {
        control.afterNextRead = null;
        await hook();
      }
      return row ? { data: row.body, etag: row.etag } : null;
    },
    async setJSON(key, value, guard = {}) {
      if (control.failWrites) throw new Error("simulated blob outage");
      const row = keys.get(key);
      if (guard.onlyIfNew && row) {
        control.refused += 1;
        return { modified: false };
      }
      if (guard.onlyIfMatch && row?.etag !== guard.onlyIfMatch) {
        control.refused += 1;
        return { modified: false };
      }
      control.writes += 1;
      keys.set(key, { body: JSON.stringify(value), etag: `v${++version}` });
      return { modified: true };
    },
  };
}
