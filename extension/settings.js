const C = IntentgramClassifier;
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
let data = null;
let accounts = new Map();

function stat(value, label) { return `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`; }

function renderStats() {
  const posts = data.all;
  const codes = new Set(posts.map((p) => p.code));
  const onScreen = Object.keys(data.screenCodes);
  const captured = onScreen.filter((c) => codes.has(c)).length;
  const ads = posts.filter((p) => p.isAd).length;
  const followed = posts.filter((p) => p.following === true && !p.isAd).length;
  const notFollowed = posts.filter((p) => p.following === false && !p.isAd).length;
  const byType = (t) => posts.filter((p) => p.type === t).length;
  const expiries = posts.map((p) => p.mediaExpiresAt).filter(Boolean).map((ms) => (ms - Date.now()) / 36e5).sort((a, b) => a - b);
  const median = expiries.length ? expiries[Math.floor(expiries.length / 2)] : null;
  $('stats').innerHTML = [
    stat(posts.length, 'posts captured'),
    stat(onScreen.length ? `${captured} / ${onScreen.length} (${pct(captured, onScreen.length)})` : '–', 'home-feed posts on screen that were captured (coverage, test #2)'),
    stat(new Set(posts.map((p) => p.author)).size, 'different authors'),
    stat(`${followed} / ${notFollowed} / ${ads}`, 'followed / suggested / ads'),
    stat(`${byType('photo')} · ${byType('carousel')} · ${byType('video')} · ${byType('reel')}`, 'photo · carousel · video · reel (test #4)'),
    stat(pct(posts.filter((p) => p.caption.trim()).length, posts.length), 'have a caption (test #11)'),
    stat(pct(posts.filter((p) => p.altText).length, posts.length), 'have Instagram alt text (useful for AI)'),
    stat(pct(posts.filter((p) => p.event).length, posts.length), 'look like events'),
    stat(median == null ? '–' : `${Math.round(median)} h`, 'median time until image links expire (test #5)'),
  ].join('');
}

// Only accounts you follow. Instagram marks this on each post; if it never does,
// fall back to every account that isn't an ad so the list isn't empty.
function renderAccounts() {
  const entries = [...accounts.entries()];
  const known = entries.some(([, a]) => a.posts.some((p) => p.following !== null && p.following !== undefined));
  const shown = entries.filter(([, a]) => known ? a.posts.some((p) => p.following === true) : a.posts.some((p) => !p.isAd));
  const rows = shown.sort((a, b) => b[1].posts.length - a[1].posts.length || a[0].localeCompare(b[0]));
  $('acctCount').textContent = `(${rows.length})`;
  $('acctNote').textContent = known
    ? (entries.length > rows.length ? `${entries.length - rows.length} suggested or sponsored accounts are hidden.` : '')
    : 'Instagram didn\'t say which accounts you follow, so all non-ad accounts are shown.';
  const options = [...data.topics.map((t) => t.name), C.OTHER];
  $('acctRows').innerHTML = rows.map(([author, a]) => {
    const mix = Object.entries(a.mix).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, n]) => `${t} ${n}`).join(', ');
    const why = data.overrides[author] ? 'You chose this'
      : mix ? `Posts sorted by AI: ${mix}`
      : a.ai ? 'On-device AI'
      : Object.entries(a.scores).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, n]) => `${t} ${n}`).join(', ') || 'No topic words found';
    const sel = `<select data-author="${esc(author)}"><option value="">Auto: ${esc(data.overrides[author] ? (a.ai || a.auto) : a.topic)}</option>` +
      options.map((o) => `<option${data.overrides[author] === o ? ' selected' : ''}>${esc(o)}</option>`).join('') + '</select>';
    return `<tr><td><a href="viewer.html#account=${encodeURIComponent(author)}">@${esc(author)}</a></td><td>${a.posts.length}</td><td>${sel}</td><td class="muted">${esc(why)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">No accounts yet.</td></tr>';
}

async function renderUsage() {
  const keys = await IntentgramStore.imageKeys().catch(() => []);
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const mb = est ? (est.usage / 1048576).toFixed(1) + ' MB used' : '';
  const saved = Object.keys(data.starred).length;
  $('usage').textContent = `${data.all.length} posts kept · ${saved} ★ saved · ${keys.length} images saved${mb ? ' · ' + mb : ''}`;
}

// ---- Topics ----
function renderTopics() {
  $('topicCount').textContent = `(${data.topics.length})`;
  $('topicRows').innerHTML = data.topics.map((t) => topicRow(t.name, t.hint, t.name)).join('');
}
const topicRow = (name, hint, orig = '') => `<tr data-orig="${esc(orig)}"><td><input class="tname" value="${esc(name)}"></td>` +
  `<td><input class="thint" value="${esc(hint)}"></td><td><button class="plain tdel">Remove</button></td></tr>`;

// Saves the topic list. Renamed topics keep your choices; removed ones drop them.
async function saveTopics(list) {
  const rows = list || [...$('topicRows').querySelectorAll('tr')].map((tr) => ({
    orig: tr.dataset.orig, name: tr.querySelector('.tname').value.trim(), hint: tr.querySelector('.thint').value.trim(),
  })).filter((t) => t.name);
  const names = rows.map((t) => t.name.toLowerCase());
  if (!rows.length) return ($('topicStatus').textContent = 'Keep at least one topic.');
  if (names.includes(C.OTHER.toLowerCase())) return ($('topicStatus').textContent = '"Other" is always there; pick a different name.');
  if (new Set(names).size !== names.length) return ($('topicStatus').textContent = 'Two topics have the same name.');
  const rename = new Map(rows.filter((t) => t.orig).map((t) => [t.orig, t.name]));
  const keep = new Set(rows.map((t) => t.name));
  const fix = (map) => {
    for (const [k, v] of Object.entries(map)) {
      const to = rename.has(v) ? rename.get(v) : keep.has(v) || v === C.OTHER ? v : null;
      if (to) map[k] = to; else delete map[k];
    }
    return map;
  };
  await chrome.storage.local.set({
    topics: rows.map((t) => ({ name: t.name, hint: t.hint || t.name })),
    accountTopics: fix(data.overrides), postTopics: fix(data.postTopics), aiPostTopics: fix(data.aiPostTopics), aiPostGuesses: fix(data.aiPostGuesses),
  });
  $('topicStatus').textContent = 'Saved. Open the feed to re-sort.';
  render();
}

async function render() {
  data = await loadData();
  accounts = computeAccounts(data);
  renderTopics();
  renderAccounts();
  renderStats();
  renderUsage();
}

async function saveSettings(change) {
  const settings = { ...(await IntentgramStore.settings()), ...change };
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: 'cleanup' }); // applies the new limit and saves missing images
  render();
}

async function setupAi() {
  const status = await C.aiAvailable();
  if (!status) return;
  $('ai').classList.remove('hidden');
  if (status !== 'available') $('aiStatus').textContent = 'The first run downloads Chrome\'s model, which can take a while.';
  $('ai').onclick = async () => {
    $('ai').disabled = true;
    const list = [...accounts.entries()];
    const maybe = data.all.filter(IntentgramEvents.maybeEvent);
    let done = 0;
    const total = list.length + maybe.length;
    for (const [author, a] of list) {
      $('aiStatus').textContent = `Working ${++done} of ${total}…`;
      try { data.aiTopics[author] = await C.aiClassifyAccount(author, a.posts); } catch (e) { console.warn(e); }
    }
    for (const p of maybe) {
      $('aiStatus').textContent = `Working ${++done} of ${total}…`;
      try { data.aiEvents[p.id] = await IntentgramEvents.aiExtract(p); } catch (e) { console.warn(e); }
    }
    await chrome.storage.local.set({ aiTopics: data.aiTopics, aiEvents: data.aiEvents });
    $('aiStatus').textContent = `Done: ${list.length} accounts and ${maybe.length} possible events, all on this computer.`;
    $('ai').disabled = false;
    render();
  };
}

(async () => {
  // Remember whether the accounts section is open.
  try { if (localStorage.getItem('acctPanel') === 'closed') $('acctPanel').open = false; } catch (_) {}
  $('acctPanel').addEventListener('toggle', () => {
    try { localStorage.setItem('acctPanel', $('acctPanel').open ? 'open' : 'closed'); } catch (_) {}
  });
  const s = await IntentgramStore.settings();
  $('keepDays').value = String(s.keepDays || 0);
  $('saveImages').checked = !!s.saveImages;
  $('aiSort').checked = !!s.aiSort;
  $('aiSort').addEventListener('change', (e) => saveSettings({ aiSort: e.target.checked }));
  $('topicAdd').onclick = () => $('topicRows').insertAdjacentHTML('beforeend', topicRow('', ''));
  $('topicRows').addEventListener('click', (e) => { if (e.target.closest('.tdel')) e.target.closest('tr').remove(); });
  $('topicSave').onclick = () => saveTopics();
  $('topicReset').onclick = () => {
    if (confirm('Go back to the default topics? Your choices for topics that no longer exist are dropped.')) {
      saveTopics(IntentgramAI.DEFAULT_TOPICS.map((t) => ({ ...t, orig: data.topics.some((x) => x.name === t.name) ? t.name : '' })));
    }
  };
  await render();
  $('keepDays').addEventListener('change', (e) => {
    const days = +e.target.value;
    const old = data.all.filter((p) => days && !data.starred[p.id] && (p.firstSeen || 0) < Date.now() - days * 864e5).length;
    if (old && !confirm(`This removes ${old} posts captured more than ${days} days ago (★ saved posts stay). Continue?`)) {
      e.target.value = String(s.keepDays || 0);
      return;
    }
    s.keepDays = days || null;
    saveSettings({ keepDays: s.keepDays });
  });
  $('saveImages').addEventListener('change', (e) => saveSettings({ saveImages: e.target.checked }));
  $('acctRows').addEventListener('change', async (e) => {
    const author = e.target.dataset.author;
    if (!author) return;
    if (e.target.value) data.overrides[author] = e.target.value; else delete data.overrides[author];
    await chrome.storage.local.set({ accountTopics: data.overrides });
    render();
  });
  $('export').onclick = async () => {
    const d = await chrome.storage.local.get(null);
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `intently-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
  };
  $('deleteAll').onclick = async () => {
    if (!confirm('Delete all captured posts except ★ saved ones? Category choices are kept.')) return;
    await chrome.runtime.sendMessage({ type: 'deleteAll' });
    render();
  };
  setupAi();
})();
