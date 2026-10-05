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

// Time is a row of one-click options in the Filters panel.
const WHENS = [['', 'Any time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['custom', 'Custom']];
const optVal = (id) => $(id).dataset.v;
function renderOpts() {
  for (const [id, opts] of [['when', WHENS]]) {
    $(id).innerHTML = opts.map(([v, label]) =>
      `<button class="opt${v === optVal(id) ? ' on' : ''}" data-v="${v}" aria-pressed="${v === optVal(id)}">${label}</button>`).join('');
  }
  $('customRange').classList.toggle('hidden', optVal('when') !== 'custom');
}

function timeRange() {
  const v = optVal('when');
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

// Which posts the whole page shows: friends you follow (the default), creators and
// businesses you follow, suggested by Instagram, or all of them. Ads are hidden
// unless "Show ads" is on in Filters; then they appear under Suggested and All.
let source = 'friend';
let showAds = false;
const SOURCES = [
  ['friend', 'Friends', 'Personal accounts you follow'],
  ['pro', 'Creators & brands', 'Creator and brand accounts you follow'],
  ['other', 'Suggested', 'Posts Instagram suggested from accounts you don\'t follow'],
  ['', 'All', 'Everything captured'],
];
const kindOf = (p) => (accounts.get(p.author) || {}).kind || 'friend';
const sourceOf = (p) => (p.isAd ? 'ad' : !isFollowed(p) ? 'other' : kindOf(p) === 'pro' ? 'pro' : 'friend');
const inSource = (p, k) => {
  const s = sourceOf(p);
  return s === 'ad' ? showAds && (k === '' || k === 'other') : !k || s === k;
};
const sourceMatch = (p) => inSource(p, source);

function renderSource() {
  const n = {};
  for (const [k] of SOURCES) n[k] = data.all.filter((p) => inSource(p, k)).length;
  $('source').innerHTML = SOURCES.map(([k, label, tip]) =>
    `<button role="tab" aria-selected="${k === source}" class="tab ${k || 'all'}${k === source ? ' on' : ''}" data-k="${k}" title="${esc(tip)}">${label}<b>${n[k]}</b></button>`).join('');
}

function setSource(k) {
  source = k;
  renderSource();
  renderChips();
  renderGrid();
}

// Short times on cards: 3h, 2d, then the date.
function ago(ms) {
  if (!ms) return '';
  const h = (Date.now() - ms) / 36e5;
  if (h < 1) return 'now';
  if (h < 24) return Math.floor(h) + 'h';
  if (h < 24 * 7) return Math.floor(h / 24) + 'd';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Active filters, as removable pills. Also counted on the Filters button.
function activeFilters() {
  const out = [];
  const when = optVal('when');
  if (when === 'custom') out.push(['when', [$('from').value, $('to').value].filter(Boolean).join(' – ') || 'Custom dates']);
  else if (when) out.push(['when', WHENS.find(([v]) => v === when)[1]]);
  if ($('loc').value.trim()) out.push(['loc', '📍 ' + $('loc').value.trim()]);
  if (activeAccount) out.push(['acct', '@' + activeAccount]);
  if (showAds) out.push(['ads', 'Ads shown']);
  return out;
}

function clearFilter(k) {
  if (k === 'when') { $(k).dataset.v = ''; renderOpts(); }
  if (k === 'ads') { setShowAds(false); return; }
  if (k === 'loc') $('loc').value = '';
  if (k === 'acct') { showAccount(''); return; }
  renderGrid();
}

function renderGrid() {
  const all = data.all;
  const q = $('q').value.trim().toLowerCase();
  const loc = $('loc').value.trim();
  const range = timeRange();
  let list = all.filter((p) =>
    (!activeTopic || (activeTopic === '__events' ? !!p.event : activeTopic === '__saved' ? !!data.starred[p.id] : p.topic === activeTopic)) &&
    (!range || (p.takenAt && p.takenAt >= range[0] && p.takenAt < range[1])) &&
    (!loc || placeMatch(p, loc)) &&
    (!activeAccount || p.author === activeAccount) &&
    sourceMatch(p) &&
    (!q || (p.caption + ' ' + p.author).toLowerCase().includes(q)));
  if (activeTopic === '__events') list = [...list].sort(eventOrder);

  $('grid').innerHTML = list.map((p) => {
    const on = !!data.starred[p.id];
    const src = sourceOf(p);
    const acct = accounts.get(p.author) || {};
    const badge = src === 'ad' ? '<span class="corner ad">Ad</span>' : src === 'other' ? '<span class="corner other">Suggested</span>'
      : src === 'pro' && source !== 'pro' ? `<span class="corner pro">${esc(acct.label)}</span>` : '';
    const unsure = src === 'friend' && acct.sure === 'no'
      ? `<button class="kindq" title="Not sure if @${esc(p.author)} is a friend or a creator or brand. Click to choose.">?</button>` : '';
    const meta = [esc(p.topic), esc(ago(p.takenAt)), p.location ? esc(p.location) : ''].filter(Boolean).join(' · ');
    return `<div class="card">
      <div class="media">${badge}<img loading="lazy" referrerpolicy="no-referrer" data-id="${esc(p.id)}" alt="${esc(p.altText || '')}"></div>
      <div class="body">
        <div class="who"><a href="#" class="author" data-author="${esc(p.author)}" title="Show only @${esc(p.author)}">@${esc(p.author)}</a>${unsure}
          <button class="star${on ? ' on' : ''}" data-id="${esc(p.id)}" title="${on ? 'Saved forever. Click to unsave' : 'Save forever'}" aria-label="${on ? 'Unsave' : 'Save'}">${on ? '★' : '☆'}</button>
          <details class="more"><summary title="More" aria-label="More">⋯</summary><div class="menu">
            <label>Category ${topicPicker(p)}</label>
            <label>Account ${kindPicker(p.author, acct)}</label>
            <div class="muted">${esc(p.type)}${p.slides > 1 ? ' · ' + p.slides + ' slides' : ''} · posted ${esc(fmtTime(p.takenAt))}</div>
            ${p.location ? `<div class="muted">📍 ${esc(placeLine(p))}</div>` : ''}
            <a href="${esc(p.permalink)}" target="_blank" rel="noopener">Open on Instagram ↗</a>
          </div></details></div>
        ${eventBox(p.event)}
        ${p.caption ? `<div class="cap">${esc(p.caption)}</div>` : ''}
        <div class="meta">${meta}</div>
      </div></div>`;
  }).join('') || `<div class="muted empty">${all.length ? 'No posts match these filters.' : 'No posts yet. Open instagram.com and scroll your home feed.'}</div>`;

  // One quiet status line: what you're looking at, the active filters, the count.
  const label = activeTopic === '__events' ? 'Events' : activeTopic === '__saved' ? '★ Saved' : activeTopic;
  const filters = activeFilters();
  $('pills').innerHTML = filters.map(([k, text]) =>
    `<button class="pill" data-k="${k}" title="Remove this filter">${esc(text)} <span aria-hidden="true">✕</span></button>`).join('');
  $('count').innerHTML = (label ? `<b>${esc(label)}</b> · ` : '') + `${list.length} post${list.length === 1 ? '' : 's'}`;
  $('matchCount').textContent = `${list.length} post${list.length === 1 ? '' : 's'} match`;
  $('filterCount').textContent = filters.length;
  $('filterCount').classList.toggle('hidden', !filters.length);
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

// Friend or creator/business, for the whole account. "Automatic" undoes your choice.
function kindPicker(author, a) {
  const mine = !!data.kindOverrides[author];
  const opt = (v, label) => `<option value="${v}"${mine && a.kind === v ? ' selected' : ''}>${label}</option>`;
  return `<select class="tag kind${mine ? ' mine' : ''}" data-kind="${esc(author)}" title="${esc(a.why || '')}">` +
    `<option value=""${mine ? '' : ' selected'}>Auto: ${(a.autoKind || a.kind) === 'pro' ? 'Creator or brand' : 'Friend'}</option>` +
    opt('friend', 'Friend') + opt('pro', 'Creator or brand') + '</select>';
}

function setShowAds(on) {
  showAds = on;
  $('showAds').checked = on;
  renderSource();
  renderChips();
  renderGrid();
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
    note.textContent = '· AI sorting is off';
    note.title = 'Sort each post by its picture and caption with AI that runs on this computer. The first time, it downloads about 270 MB.';
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
    note.textContent = '· sorted on this computer';
    note.title = 'Sorted by picture and caption with AI on this computer. Change a post\'s category in its ⋯ menu and similar posts follow.';
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

// Categories in a sidebar: All, Events and Saved, then topics largest first. Only
// the first few topics show until "Show more"; Other stays last. Counts follow the tab.
const SHOWN_TOPICS = 8;
let allTopicsShown = false;
function renderChips() {
  const base = data.all.filter(sourceMatch);
  const counts = {};
  for (const p of base) counts[p.topic] = (counts[p.topic] || 0) + 1;
  const events = base.filter((p) => p.event).length;
  const saved = base.filter((p) => data.starred[p.id]).length;
  const ordered = Object.entries(counts).sort((a, b) => (a[0] === IntentgramClassifier.OTHER) - (b[0] === IntentgramClassifier.OTHER) || b[1] - a[1]);
  if (activeTopic && !activeTopic.startsWith('__') && !counts[activeTopic]) activeTopic = '';
  const item = (t, label, n, cls = '') => `<button class="item ${cls}${t === activeTopic ? ' on' : ''}" data-t="${esc(t)}" aria-current="${t === activeTopic}"><span>${esc(label)}</span><b>${n}</b></button>`;
  const other = ordered.filter(([t]) => t === IntentgramClassifier.OTHER);
  const topics = ordered.filter(([t]) => t !== IntentgramClassifier.OTHER);
  const extra = topics.length - SHOWN_TOPICS;
  $('chips').classList.toggle('expanded', allTopicsShown);
  $('chips').innerHTML = [item('', 'All', base.length),
    events ? item('__events', '📅 Events', events) : '',
    saved ? item('__saved', '★ Saved', saved) : '',
    topics.length ? '<div class="sep"></div><div class="cap">Topics</div>' : '',
    ...topics.map(([t, n], i) => item(t, t, n, i >= SHOWN_TOPICS && t !== activeTopic ? 'extra' : '')),
    extra > 0 ? `<button class="item toggle" id="moreTopics">${allTopicsShown ? 'Show fewer' : `Show ${extra} more`}</button>` : '',
    other.length ? '<div class="sep"></div>' + item(other[0][0], other[0][0], other[0][1], 'otherTopic') : ''].join('');
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
  if (author) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  accounts = computeAccounts(data);
  renderOpts();
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
  const showPaused = (p) => $('pausedNote').classList.toggle('hidden', !p);
  showPaused((await chrome.storage.local.get('paused')).paused);
  chrome.storage.onChanged.addListener((c) => { if (c.paused) showPaused(c.paused.newValue); });
  $('resume').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'pause', paused: false }));
  $('acct').addEventListener('input', (e) => showAccount(e.target.value));
  for (const id of ['q', 'from', 'to']) $(id).addEventListener('input', renderGrid);
  $('showAds').addEventListener('change', (e) => setShowAds(e.target.checked));
  for (const id of ['when']) $(id).addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b) return;
    $(id).dataset.v = b.dataset.v;
    renderOpts();
    renderGrid();
  });
  $('filtersBtn').addEventListener('click', () => {
    const open = $('filters').classList.toggle('hidden') === false;
    $('filtersBtn').setAttribute('aria-expanded', open);
  });
  $('clearAll').addEventListener('click', () => {
    $('when').dataset.v = ''; $('loc').value = '';
    showAds = false; $('showAds').checked = false;
    renderOpts();
    renderSource();
    renderChips();
    showAccount('');
  });
  // Close an open ⋯ menu when clicking anywhere else.
  document.addEventListener('click', (e) => {
    for (const d of document.querySelectorAll('details.more[open]')) if (!d.contains(e.target)) d.open = false;
  });
  $('pills').addEventListener('click', (e) => { const b = e.target.closest('.pill'); if (b) clearFilter(b.dataset.k); });
  $('source').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setSource(b.dataset.k); });
  $('loc').addEventListener('input', onPlaceInput);
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.item');
    if (!b) return;
    if (b.id === 'moreTopics') { allTopicsShown = !allTopicsShown; renderChips(); return; }
    activeTopic = b.dataset.t;
    renderChips();
    renderGrid();
  });
  $('grid').addEventListener('change', async (e) => {
    const author = e.target.dataset.kind;
    if (author !== undefined) {
      if (e.target.value) data.kindOverrides[author] = e.target.value; else delete data.kindOverrides[author];
      await chrome.storage.local.set({ accountKinds: data.kindOverrides });
      renderAll();
      return;
    }
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
    const q = e.target.closest('.kindq');
    if (q) {
      const menu = q.closest('.card').querySelector('details.more');
      menu.open = true;
      menu.querySelector('select.kind').focus();
      e.stopPropagation();
      return;
    }
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
