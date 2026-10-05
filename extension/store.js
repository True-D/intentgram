// Saved images and AI vectors (IndexedDB) and user settings, shared by the background worker and pages.
const IntentgramStore = (() => {
  const DEFAULTS = { keepDays: 30, saveImages: true, aiSort: false };
  let dbp = null;

  function db() {
    return dbp || (dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('intentgram', 2);
      r.onupgradeneeded = () => {
        for (const s of ['images', 'vectors']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => {
        // Let a newer version of the extension upgrade the database instead of waiting on us.
        r.result.onversionchange = () => { r.result.close(); dbp = null; };
        resolve(r.result);
      };
      r.onerror = () => { dbp = null; reject(r.error); };
      r.onblocked = () => console.warn('[intentgram] database upgrade is waiting for an older copy of the extension; reload it in chrome://extensions');
    }));
  }

  async function tx(mode, fn, store = 'images') {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  }

  const putImage = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
  const getImage = (id) => tx('readonly', (s) => s.get(id));
  const imageKeys = () => tx('readonly', (s) => s.getAllKeys());
  const deleteImages = (ids) => tx('readwrite', (s) => { for (const id of ids) s.delete(id); });

  // Per-post vectors from the on-device models: { img, txt } Float32Arrays (either may be null).
  const putVectors = (entries) => tx('readwrite', (s) => { for (const [id, v] of entries) s.put(v, id); }, 'vectors');
  async function getAllVectors() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const out = new Map();
      const r = d.transaction('vectors').objectStore('vectors').openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return resolve(out); out.set(c.key, c.value); c.continue(); };
      r.onerror = () => reject(r.error);
    });
  }
  const vectorKeys = () => tx('readonly', (s) => s.getAllKeys(), 'vectors');
  const deleteVectors = (ids) => tx('readwrite', (s) => { for (const id of ids) s.delete(id); }, 'vectors');

  async function settings() {
    const { settings = {} } = await chrome.storage.local.get('settings');
    return { ...DEFAULTS, ...settings };
  }

  return { DEFAULTS, putImage, getImage, imageKeys, deleteImages, putVectors, getAllVectors, vectorKeys, deleteVectors, settings };
})();
