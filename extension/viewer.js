const G = IntentgramGeo;
let data = null;
let accounts = new Map();
let activeTopic = '';
let activeAccount = ''; // '' for all accounts  // a category, '__events', '__saved' or '' for all
let remote = [];       // place suggestions from the geocoder for the current text
const imageUrls = new Map(); // post id -> object URL of the saved image

// A post matches a typed place when any name of its place contains the text
// ("Taiwan" matches a post whose looked-up country is Taiwan). Posts whose
// coordinates were not looked up yet fall back to the area's map box.
function placeMatch(p, raw) {
  const picked = remote.find((r) => r.label === raw);
  const q = norm(picked ? picked.name : raw);
  const { names, areas, known } = G.areasOf(p, data.geoCache);
  // Looked-up areas must start with the text as a whole word ("Xinyi" finds
  // "Xinyi District", but "Taipei" doesn't find "New Taipei");
  // Instagram's free-text place names only need to contain the text.
  if (areas.some((n) => norm(n) === q || norm(n).startsWith(q + ' '))) return true;
  if (names.filter((n) => !areas.includes(n)).some((n) => norm(n).includes(q))) return true;
  const area = picked || remote[0];
  return !!(area && !known && p.place && p.place.lat != null && G.inBox(area.box, p.place.lat, p.place.lng));
}

function placeLine(p) {
  const pl = p.place;
  const geo = pl && pl.lat != null && data.geoCache[G.key(pl.lat, pl.lng)];
  const area = geo ? [geo.city || geo.county || geo.state, geo.country].filter(Boolean).join(', ') : (pl && pl.city) || '';
  return [p.location, area].filter(Boolean).join(' · ');
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

function timeRange() {
  const v = $('when').value;
  const today = startOfDay(Date.now());
  if (v === 'today') return [today, Infinity];
  if (v === 'yesterday') return [today - 864e5, today];
  if (v === 'week') return [Date.now() - 7 * 864e5, Infinity];
  if (v === 'custom') {
    const f = $('from').value, t = $('to').value;
    return [f ? startOfDay(f + 'T00:00') : -Infinity, t ? startOfDay(t + 'T00:00') + 864e5 : Infinity];
  }
  return null;
}

function eventBox(e) {
  if (!e) return '';
  const when = [e.date, e.time].filter(Boolean).join(' · ');
  const status = e.startsAt ? (e.startsAt >= Date.now() - 864e5 ? '<span class="badge">Upcoming</span>' : '<span class="badge past">Past</span>') : '';
  const tickets = e.tickets && /^(https?:\/\/)?[a-z0-9-]+\.[a-z.]+\//i.test(e.tickets)
    ? `<a href="${esc(/^https?:/.test(e.tickets) ? e.tickets : 'https://' + e.tickets)}" target="_blank" rel="noopener">Tickets</a>`
    : esc(e.tickets || '');
  const lines = [
    when && `🗓 ${esc(when)}`,
    e.venue && `📍 ${esc(e.venue)}`,
    e.performers && e.performers.length && `🎤 ${esc(e.performers.join(', '))}`,
    (e.price || tickets) && `🎟 ${[esc(e.price || ''), tickets].filter(Boolean).join(' · ')}`,
  ].filter(Boolean).map((l) => `<div>${l}</div>`).join('');
  return `<div class="event"><div class="event-h">Event ${status}</div>${lines}</div>`;
}

// Events: upcoming soonest first, then undated, then past (most recent first).
function eventOrder(a, b) {
  const now = Date.now() - 864e5;
  const rank = (p) => (!p.event.startsAt ? 1 : p.event.startsAt >= now ? 0 : 2);
  return rank(a) - rank(b) || (rank(a) === 0 ? a.event.startsAt - b.event.startsAt : (b.event.startsAt || 0) - (a.event.startsAt || 0));
}

// Instagram marks posts from accounts you follow. If no post carries that mark,
// treat every non-ad post as followed so the default view isn't empty.
function isFollowed(p) {
  if (data.followKnown) return p.following === true && !p.isAd;
  return !p.isAd;
}

// Which posts the whole page shows: from accounts you follow (the default),
// suggested by Instagram, ads, or all of them.
let source = 'followed';
const SOURCES = [
  ['followed', 'Following', 'Posts from accounts you follow'],
  ['other', 'Suggested', 'Posts Instagram suggested from accounts you don\'t follow'],
  ['ad', 'Ads', 'Sponsored posts'],
  ['', 'All', 'Everything captured'],
];
const sourceOf = (p) => (p.isAd ? 'ad' : isFollowed(p) ? 'followed' : 'other');
const sourceMatch = (p) => !source || sourceOf(p) === source;

function renderSource() {
  const n = { '': data.all.length, followed: 0, other: 0, ad: 0 };
  for (const p of data.all) n[sourceOf(p)]++;
  $('source').innerHTML = SOURCES.map(([k, label, tip]) =>
    `<button role="tab" aria-selected="${k === source}" class="tab ${k || 'all'}${k === source ? ' on' : ''}" data-k="${k}" title="${esc(tip)}">${label}<b>${n[k]}</b></button>`).join('');
}

function setSource(k) {
  source = k;
  renderSource();
  renderChips();
  renderGrid();
}

function renderGrid() {
  const all = data.all;
  const type = $('type').value;
  const q = $('q').value.trim().toLowerCase();
  const loc = $('loc').value.trim();
  const range = timeRange();
  $('customRange').classList.toggle('hidden', $('when').value !== 'custom');
  let list = all.filter((p) =>
    (!activeTopic || (activeTopic === '__events' ? !!p.event : activeTopic === '__saved' ? !!data.starred[p.id] : p.topic === activeTopic)) &&
    (!range || (p.takenAt && p.takenAt >= range[0] && p.takenAt < range[1])) &&
    (!loc || placeMatch(p, loc)) &&
    (!activeAccount || p.author === activeAccount) &&
    (!type || p.type === type) &&
    sourceMatch(p) &&
    (!q || (p.caption + ' ' + p.author).toLowerCase().includes(q)));
  if (activeTopic === '__events') list = [...list].sort(eventOrder);

  $('grid').innerHTML = list.map((p) => {
    const on = !!data.starred[p.id];
    const tags = [
      topicPicker(p),
      `<span class="tag">${esc(p.type)}${p.slides > 1 ? ' ×' + p.slides : ''}</span>`,
      sourceOf(p) === 'ad' ? '<span class="tag src ad">Ad</span>' : '',
      sourceOf(p) === 'other' ? '<span class="tag src other">Suggested</span>' : '',
    ].join('');
    return `<div class="card">
      <div class="media"><img loading="lazy" referrerpolicy="no-referrer" data-id="${esc(p.id)}" alt="${esc(p.altText || '')}"></div>
      <div class="body">
        <div class="who"><a href="#" class="author" data-author="${esc(p.author)}" title="Show only @${esc(p.author)}"><b>@${esc(p.author)}</b></a> ${tags}<button class="star${on ? ' on' : ''}" data-id="${esc(p.id)}" title="${on ? 'Saved forever. Click to unsave' : 'Save forever'}">${on ? '★' : '☆'}</button></div>
        ${eventBox(p.event)}
        <div class="cap">${esc(p.caption) || '<span class="muted">(no caption)</span>'}</div>
        ${p.location ? `<div class="meta">📍 ${esc(placeLine(p))}</div>` : ''}
        <div class="meta">Posted ${esc(fmtTime(p.takenAt))}</div>
        <a href="${esc(p.permalink)}" target="_blank" rel="noopener">Open on Instagram</a>
      </div></div>`;
  }).join('') || `<div class="muted">${all.length ? 'No posts match these filters.' : 'No posts yet. Open instagram.com and scroll your home feed.'}</div>`;
  $('count').textContent = `${list.length} of ${all.length} posts`;
  loadImages(list);
}

// Each post's category is a menu, so it can be corrected right on the card.
function topicPicker(p) {
  const mine = !!data.postTopics[p.id];
  const names = [...data.topics.map((t) => t.name), IntentgramClassifier.OTHER];
  return `<select class="tag topic${mine ? ' mine' : ''}" data-pick="${esc(p.id)}" title="${mine ? 'You chose this category' : 'Change this post\'s category'}">` +
    (mine ? '<option value="">Automatic</option>' : '') +
    names.map((n) => `<option${n === p.topic ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
}

// ---- On-device sorting by picture and caption (ai.js) ----
let aiPrepared = null;

function applyAi() {
  if (!aiPrepared) return;
  // Your choices are the examples it learns from: single posts, and every post of an account you set.
  const labels = new Map();
  for (const p of data.all) {
    const t = data.postTopics[p.id] || data.overrides[p.author];
    if (t) labels.set(p.id, t);
  }
  const results = IntentgramAI.assign(data.all, aiPrepared, labels);
  data.aiPostTopics = {};
  data.aiPostGuesses = {};
  for (const [id, r] of results) (r.sure >= IntentgramAI.UNSURE ? data.aiPostTopics : data.aiPostGuesses)[id] = r.topic;
  chrome.storage.local.set({ aiPostTopics: data.aiPostTopics, aiPostGuesses: data.aiPostGuesses });
}

async function runAi() {
  const note = $('aiNote');
  if (!(await IntentgramStore.settings()).aiSort) {
    note.textContent = 'Sort each post by its picture and caption with AI that runs on this computer. The first time, it downloads about 270 MB.';
    $('aiOn').classList.remove('hidden');
    return;
  }
  $('aiOn').classList.add('hidden');
  const mb = (n) => Math.round(n / 1048576);
  try {
    note.textContent = 'Starting the on-device AI…';
    aiPrepared = await IntentgramAI.prepare(data.all, (done, total, dl) => {
      note.textContent = !dl ? `Sorting posts by picture and caption: ${done} of ${total}…`
        : dl.loaded > 1048576 && dl.loaded < dl.total ? `Downloading the AI models, one time only: ${mb(dl.loaded)} MB of about 270 MB…`
        : 'Loading the AI models…';
    });
    applyAi();
    renderAll();
    note.textContent = 'Sorted by picture and caption on this computer. Change a post\'s category and similar posts follow.';
  } catch (e) {
    console.warn('[intentgram] AI', e);
    note.textContent = 'On-device sorting didn\'t work: ' + e.message;
  }
}

let savedImagesStuck = false;

// Uses the copy saved on this computer when there is one, otherwise Instagram's link.
async function loadImages(list) {
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const img of document.querySelectorAll('#grid img[data-id]')) {
    const p = byId.get(img.dataset.id);
    img.addEventListener('error', () => img.replaceWith('Image not saved and its link has expired'), { once: true });
    if (!imageUrls.has(p.id)) {
      let blob = null;
      // Never let the saved copy hold up the page: if the database doesn't answer
      // within 2 seconds, use Instagram's links for the rest.
      if (!savedImagesStuck) {
        const wait = new Promise((resolve) => setTimeout(resolve, 2000, 'stuck'));
        try { blob = await Promise.race([IntentgramStore.getImage(p.id), wait]); } catch (_) {}
        if (blob === 'stuck') { savedImagesStuck = true; blob = null; }
      }
      if (blob) imageUrls.set(p.id, URL.createObjectURL(blob));
    }
    const src = imageUrls.get(p.id) || p.thumb || p.image;
    if (src) img.src = src; else img.replaceWith('No image');
  }
}

// Counts follow the source menu, so "All" matches what the default view shows.
function renderChips() {
  const base = data.all.filter(sourceMatch);
  const counts = {};
  for (const p of base) counts[p.topic] = (counts[p.topic] || 0) + 1;
  const events = base.filter((p) => p.event).length;
  const saved = base.filter((p) => data.starred[p.id]).length;
  const ordered = Object.entries(counts).sort((a, b) => (a[0] === IntentgramClassifier.OTHER) - (b[0] === IntentgramClassifier.OTHER) || b[1] - a[1]);
  if (activeTopic && !activeTopic.startsWith('__') && !counts[activeTopic]) activeTopic = '';
  const chip = (t, label, n, cls = '') => `<button class="chip ${cls}${t === activeTopic ? ' on' : ''}" data-t="${esc(t)}">${esc(label)}<b>${n}</b></button>`;
  $('chips').innerHTML = [chip('', 'All', base.length),
    events ? chip('__events', 'Events', events, 'special') : '',
    saved ? chip('__saved', '★ Saved', saved, 'special') : '',
    ...ordered.map(([t, n]) => chip(t, t, n))].join('');
}

// Suggestions: every area that has posts (with counts), then matches from the map.
function renderLocations() {
  const counts = {};
  for (const p of data.all) for (const n of new Set(G.areasOf(p, data.geoCache).names)) counts[n] = (counts[n] || 0) + 1;
  const local = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n, c]) => `<option value="${esc(n)}" label="${c} post${c > 1 ? 's' : ''}"></option>`);
  const fromMap = remote.filter((r) => !counts[r.label])
    .map((r) => `<option value="${esc(r.label)}" label="${esc(r.type || 'area')} · map"></option>`);
  $('placeList').innerHTML = local.concat(fromMap).join('');
}

let searchTimer = null;
function onPlaceInput() {
  renderGrid();
  clearTimeout(searchTimer);
  const raw = $('loc').value.trim();
  if (raw.length < 2 || remote.some((r) => r.label === raw)) return;
  searchTimer = setTimeout(async () => {
    try {
      remote = await G.search(raw);
      $('locNote').textContent = '';
    } catch (e) {
      remote = [];
      $('locNote').textContent = 'Map search is unavailable right now, so only place names are matched.';
    }
    renderLocations();
    renderGrid();
  }, 350);
}

async function lookUpPlaces() {
  const n = await G.enrich(data.all, data.geoCache, (done, total) => {
    $('locNote').textContent = `Looking up the area of tagged places: ${done} of ${total}…`;
    if (done % 5 === 0 || done === total) { chrome.storage.local.set({ geoCache: data.geoCache }); renderLocations(); renderGrid(); }
  });
  if (n) { await chrome.storage.local.set({ geoCache: data.geoCache }); $('locNote').textContent = ''; renderLocations(); renderGrid(); }
}

// Accounts menu, most posts first.
function renderAccountMenu() {
  const rows = [...accounts.entries()].sort((a, b) => b[1].posts.length - a[1].posts.length || a[0].localeCompare(b[0]));
  if (activeAccount && !accounts.has(activeAccount)) activeAccount = '';
  $('acct').innerHTML = '<option value="">All accounts</option>' + rows.map(([a, x]) =>
    `<option value="${esc(a)}"${a === activeAccount ? ' selected' : ''}>@${esc(a)} (${x.posts.length})</option>`).join('');
}

function showAccount(author) {
  activeAccount = author;
  $('acct').value = author;
  history.replaceState(null, '', author ? '#account=' + encodeURIComponent(author) : location.pathname);
  renderGrid();
  if (author) window.scrollTo({ top: $('acct').getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function renderAll() {
  accounts = computeAccounts(data);
  renderSource();
  renderAccountMenu();
  renderChips();
  renderLocations();
  renderGrid();
}

(async () => {
  data = await loadData();
  data.followKnown = data.all.some((p) => p.following === true || p.following === false);
  const fromLink = /#account=([^&]+)/.exec(location.hash);
  if (fromLink) activeAccount = decodeURIComponent(fromLink[1]);
  renderAll();
  $('acct').addEventListener('input', (e) => showAccount(e.target.value));
  for (const id of ['type', 'q', 'when', 'from', 'to']) $(id).addEventListener('input', renderGrid);
  $('source').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setSource(b.dataset.k); });
  $('loc').addEventListener('input', onPlaceInput);
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    activeTopic = b.dataset.t;
    renderChips();
    renderGrid();
  });
  $('grid').addEventListener('change', async (e) => {
    const id = e.target.dataset.pick;
    if (!id) return;
    if (e.target.value) data.postTopics[id] = e.target.value; else delete data.postTopics[id];
    await chrome.storage.local.set({ postTopics: data.postTopics });
    applyAi();
    renderAll();
  });
  $('aiOn').onclick = async () => {
    const settings = { ...(await IntentgramStore.settings()), aiSort: true };
    await chrome.storage.local.set({ settings });
    runAi();
  };
  $('grid').addEventListener('click', async (e) => {
    const who = e.target.closest('.author');
    if (who) { e.preventDefault(); showAccount(who.dataset.author); return; }
    const b = e.target.closest('.star');
    if (!b) return;
    if (data.starred[b.dataset.id]) delete data.starred[b.dataset.id]; else data.starred[b.dataset.id] = true;
    await chrome.storage.local.set({ starred: data.starred });
    renderChips();
    renderGrid();
  });
  lookUpPlaces();
  runAi();
})();
