// The only writer of captured posts: content scripts send what they find here.
// Also saves each post's image locally (Instagram image links expire after a few
// days) and removes posts older than the "keep posts for" setting.
// Chrome loads store.js here; Firefox lists it before this file in manifest.firefox.json.
if (typeof importScripts === 'function') importScripts('store.js');
const S = IntentgramStore;

let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch((e) => console.warn('[intentgram]', e)));

async function updateBadge() {
  const { posts = {}, paused } = await chrome.storage.local.get(['posts', 'paused']);
  const n = Object.keys(posts).length;
  chrome.action.setBadgeText({ text: paused ? '||' : n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: paused ? '#8e8e93' : '#6b4fd8' });
}

// While collecting is paused, posts seen on Instagram are ignored, not stored.
const isPaused = async () => !!(await chrome.storage.local.get('paused')).paused;

async function setPaused(paused) {
  await chrome.storage.local.set({ paused });
  if (paused) {
    const tabs = await chrome.tabs.query({ url: HOME + '*' });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'autoscroll-stop', why: 'Stopped: collecting is paused.' }).catch(() => {});
  }
  updateBadge();
}

async function savePosts(posts, source) {
  if (await isPaused()) return;
  const { posts: stored = {}, adCodes = {} } = await chrome.storage.local.get(['posts', 'adCodes']);
  const now = Date.now();
  for (const p of posts) {
    const prev = stored[p.id];
    // Once a post is known to be an ad, a later copy without the ad fields doesn't undo it.
    const isAd = !!(p.isAd || (prev && prev.isAd) || adCodes[p.code]);
    stored[p.id] = { ...prev, ...p, isAd, firstSeen: prev ? prev.firstSeen : now, lastSeen: now, source: prev ? prev.source : source };
  }
  await chrome.storage.local.set({ posts: stored });
  updateBadge();
  saveImages();
}

async function saveScreenCodes(codes, ads = []) {
  if (await isPaused()) return;
  const { screenCodes = {}, adCodes = {}, posts = {} } = await chrome.storage.local.get(['screenCodes', 'adCodes', 'posts']);
  const now = Date.now();
  let changed = false;
  for (const c of codes) if (!screenCodes[c]) { screenCodes[c] = now; changed = true; }
  if (changed) await chrome.storage.local.set({ screenCodes });
  // Posts shown with a "Sponsored" label are ads, whatever the feed data said.
  const newAds = ads.filter((c) => !adCodes[c]);
  if (!newAds.length) return;
  for (const c of newAds) adCodes[c] = now;
  for (const p of Object.values(posts)) if (newAds.includes(p.code)) p.isAd = true;
  await chrome.storage.local.set({ adCodes, posts });
}

// Account details Instagram sent (private, verified, business or creator...), merged
// per username so a profile visit adds to what feed posts said.
async function saveAccounts(found) {
  if (await isPaused()) return;
  const { accountInfo = {} } = await chrome.storage.local.get('accountInfo');
  const seen = Date.now();
  for (const [name, f] of Object.entries(found)) accountInfo[name] = { ...accountInfo[name], ...f, seen };
  await chrome.storage.local.set({ accountInfo });
}

// Downloads images not saved yet, one at a time. Links that already expired are skipped.
let saving = false;
const failed = new Set();
async function saveImages() {
  if (saving || !(await S.settings()).saveImages) return;
  saving = true;
  try {
    for (;;) {
      const { posts = {} } = await chrome.storage.local.get('posts');
      const have = new Set(await S.imageKeys());
      const next = Object.values(posts).find((p) => p.thumb && !have.has(p.id) && !failed.has(p.id) &&
        !(p.mediaExpiresAt && p.mediaExpiresAt < Date.now()));
      if (!next) break;
      try {
        const r = await fetch(next.thumb, { credentials: 'omit' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await S.putImage(next.id, await r.blob());
      } catch (e) { failed.add(next.id); console.warn('[intentgram] image not saved', next.id, e.message); }
    }
  } finally { saving = false; }
}

// Removes posts first captured longer ago than the setting, except ★ saved ones.
async function cleanup() {
  const { keepDays } = await S.settings();
  const { posts = {}, starred = {}, screenCodes = {}, adCodes = {} } = await chrome.storage.local.get(['posts', 'starred', 'screenCodes', 'adCodes']);
  if (keepDays) {
    const cutoff = Date.now() - keepDays * 864e5;
    for (const [id, p] of Object.entries(posts)) if (!starred[id] && (p.firstSeen || 0) < cutoff) delete posts[id];
    for (const [c, t] of Object.entries(screenCodes)) if (t < cutoff) delete screenCodes[c];
    for (const [c, t] of Object.entries(adCodes)) if (t < cutoff) delete adCodes[c];
    await chrome.storage.local.set({ posts, screenCodes, adCodes });
  }
  const { accountInfo = {} } = await chrome.storage.local.get('accountInfo');
  const authors = new Set(Object.values(posts).map((p) => p.author));
  // Accounts with no captured posts are kept a while, in case their posts arrive later.
  const unused = Object.keys(accountInfo).filter((a) => !authors.has(a) && (accountInfo[a].seen || 0) < Date.now() - (keepDays || 30) * 864e5);
  if (unused.length) { for (const a of unused) delete accountInfo[a]; await chrome.storage.local.set({ accountInfo }); }
  const orphans = (await S.imageKeys()).filter((id) => !posts[id]);
  if (orphans.length) await S.deleteImages(orphans);
  const oldVectors = (await S.vectorKeys()).filter((id) => !posts[id] && !String(id).startsWith('__'));
  if (oldVectors.length) await S.deleteVectors(oldVectors);
  updateBadge();
}

async function deleteAllExceptStarred() {
  const { posts = {}, starred = {} } = await chrome.storage.local.get(['posts', 'starred']);
  for (const id of Object.keys(posts)) if (!starred[id]) delete posts[id];
  await chrome.storage.local.set({ posts, screenCodes: {} });
  await cleanup();
}

// Auto-scroll runs in the user's own Instagram tab: reuse the active one if it's
// Instagram, otherwise open the home feed in a new tab.
const HOME = 'https://www.instagram.com/';
function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(done);
  });
}

async function startAutoScroll(days) {
  if (await isPaused()) throw new Error('Collecting is paused. Resume it first.');
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab = active;
  if (active && (active.url || '').startsWith(HOME)) {
    if (new URL(active.url).pathname !== '/') {
      const loaded = waitForLoad(tab.id);
      await chrome.tabs.update(tab.id, { url: HOME });
      await loaded;
    }
  } else {
    tab = await chrome.tabs.create({ url: HOME });
    await waitForLoad(tab.id);
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'autoscroll-start', days });
  } catch (_) {
    // Tabs opened before the extension was installed or reloaded don't have its
    // scripts yet; reloading the tab adds them.
    const loaded = waitForLoad(tab.id);
    await chrome.tabs.reload(tab.id);
    await loaded;
    await chrome.tabs.sendMessage(tab.id, { type: 'autoscroll-start', days });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'autoscroll') {
    startAutoScroll(msg.days).then(() => reply({ ok: true }), (e) => {
      console.warn('[intentgram] auto-scroll', e);
      reply({ ok: false, error: (e && e.message) || String(e) });
    });
    return true;
  }
  const jobs = {
    posts: () => savePosts(msg.posts, msg.source),
    screen: () => saveScreenCodes(msg.codes, msg.adCodes),
    accounts: () => saveAccounts(msg.accounts),
    cleanup: () => cleanup().then(saveImages),
    deleteAll: deleteAllExceptStarred,
    pause: () => setPaused(!!msg.paused),
  };
  if (!jobs[msg.type]) return false;
  enqueue(jobs[msg.type]).then(() => reply({ ok: true }));
  return true; // reply asynchronously
});

chrome.alarms.create('cleanup', { periodInMinutes: 6 * 60 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'cleanup') enqueue(cleanup); });
chrome.runtime.onStartup.addListener(() => enqueue(cleanup));
chrome.runtime.onInstalled.addListener(() => enqueue(cleanup));
