// Saved images (IndexedDB) and user settings, shared by the background worker and pages.
const IntentgramStore = (() => {
  const DEFAULTS = { keepDays: 30, saveImages: true };
  let dbp = null;

  function db() {
    return dbp || (dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('intentgram', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('images', mode);
      const req = fn(t.objectStore('images'));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  }

  const putImage = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
  const getImage = (id) => tx('readonly', (s) => s.get(id));
  const imageKeys = () => tx('readonly', (s) => s.getAllKeys());
  const deleteImages = (ids) => tx('readwrite', (s) => { for (const id of ids) s.delete(id); });

  async function settings() {
    const { settings = {} } = await chrome.storage.local.get('settings');
    return { ...DEFAULTS, ...settings };
  }

  return { DEFAULTS, putImage, getImage, imageKeys, deleteImages, settings };
})();
