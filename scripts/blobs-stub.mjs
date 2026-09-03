/**
 * A blob store the test can break on purpose. `failReads` makes `get` throw the
 * way a real outage does, so a write can be attempted on top of a read that
 * never landed.
 */
const keys = new Map();
export const control = {
  failReads: false,
  failWrites: false,
  reads: 0,
  writes: 0,
  seed(key, value) {
    keys.set(key, JSON.stringify(value));
  },
  raw(key) {
    const v = keys.get(key);
    return v ? JSON.parse(v) : null;
  },
};

export function getStore() {
  return {
    async get(key) {
      control.reads += 1;
      if (control.failReads) throw new Error("simulated blob outage");
      return keys.get(key) ?? null;
    },
    async setJSON(key, value) {
      control.writes += 1;
      if (control.failWrites) throw new Error("simulated blob outage");
      keys.set(key, JSON.stringify(value));
    },
  };
}
