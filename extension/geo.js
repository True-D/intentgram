// Place lookups with Photon (photon.komoot.io), a free OpenStreetMap geocoder.
// Only coordinates of tagged places and the text you type are sent; never post content.
const IntentgramGeo = (() => {
  const API = 'https://photon.komoot.io';
  const LEVELS = ['district', 'locality', 'city', 'county', 'state', 'country'];
  const key = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Country, state, city... for one coordinate, in English.
  async function reverse(lat, lng) {
    const r = await fetch(`${API}/reverse?lat=${lat}&lon=${lng}&lang=en`);
    if (!r.ok) throw new Error('reverse ' + r.status);
    const f = (await r.json()).features?.[0];
    const out = {};
    if (f) for (const l of LEVELS) if (f.properties[l]) out[l] = f.properties[l];
    return out;
  }

  // Looks up every not-yet-known coordinate, one request per second (fair use).
  async function enrich(posts, cache, onProgress) {
    const todo = new Map();
    for (const p of posts) {
      const pl = p.place;
      if (pl && pl.lat != null && pl.lng != null && !cache[key(pl.lat, pl.lng)]) todo.set(key(pl.lat, pl.lng), pl);
    }
    let done = 0, failedInARow = 0;
    for (const [k, pl] of todo) {
      try { cache[k] = await reverse(pl.lat, pl.lng); failedInARow = 0; } catch (e) {
        console.warn('[intentgram] place lookup failed', e);
        if (++failedInARow >= 3) break; // service is down; retry next time the page opens
      }
      onProgress(++done, todo.size);
      if (done < todo.size) await sleep(1000);
    }
    return done;
  }

  // Area suggestions for what the user is typing, each with a bounding box.
  async function search(q) {
    const r = await fetch(`${API}/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`);
    if (!r.ok) throw new Error('search ' + r.status);
    return ((await r.json()).features || []).map((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      // Photon extent is [minLon, maxLat, maxLon, minLat]; points get a ~5 km box.
      const box = p.extent
        ? { minLat: p.extent[3], maxLat: p.extent[1], minLng: p.extent[0], maxLng: p.extent[2] }
        : { minLat: lat - 0.05, maxLat: lat + 0.05, minLng: lng - 0.05, maxLng: lng + 0.05 };
      const label = [...new Set([p.name, p.state, p.country].filter(Boolean))].join(', ');
      return { name: p.name || label, label, type: p.type || '', box };
    });
  }

  const inBox = (b, lat, lng) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;

  // `areas` are the looked-up district/city/state/country; `names` adds Instagram's own text.
  // Every name a post's place is known by: Instagram's own name, city and address,
  // plus the looked-up district, city, state and country.
  function areasOf(p, cache) {
    const pl = p.place;
    if (!pl && !p.location) return { names: [], areas: [], known: false };
    const names = [p.location, pl && pl.name, pl && pl.city, pl && pl.address].filter(Boolean);
    const geo = pl && pl.lat != null && cache[key(pl.lat, pl.lng)];
    const areas = geo ? Object.values(geo) : [];
    return { names: [...names, ...areas], areas, known: !!geo };
  }

  return { enrich, search, inBox, areasOf, key };
})();
