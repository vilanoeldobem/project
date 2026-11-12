/**
 * Minimal R2 bucket stand-in for unit tests: an in-memory map with put/get/delete, which is all the API uses.
 * `failNext(op)` makes the next call of that operation throw, to test what happens when R2 is unavailable.
 */
export function createR2() {
  const objects = new Map();
  const failing = new Set();
  const maybeFail = (op) => {
    if (failing.delete(op)) throw new Error(`r2 ${op} failed`);
  };
  return {
    /** Test helpers. */
    objects,
    keys: () => [...objects.keys()].sort(),
    bytes: (key) => objects.get(key)?.bytes,
    failNext: (op) => failing.add(op),

    async put(key, value, options = {}) {
      maybeFail("put");
      const bytes = new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, httpMetadata: options.httpMetadata ?? {} });
      return { key, size: bytes.length };
    },
    async get(key) {
      maybeFail("get");
      const object = objects.get(key);
      if (!object) return null;
      return { key, size: object.bytes.length, httpMetadata: object.httpMetadata, body: new Response(object.bytes).body };
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { key, size: object.bytes.length, httpMetadata: object.httpMetadata } : null;
    },
    async delete(keys) {
      maybeFail("delete");
      for (const key of [].concat(keys)) objects.delete(key);
    },
  };
}
