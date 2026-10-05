// Helpers and data loading shared by the viewer and the settings page.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const norm = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : '–');

const KEYS = ['posts', 'screenCodes', 'accountTopics', 'aiTopics', 'aiEvents', 'geoCache', 'starred'];

async function loadData() {
  const d = await chrome.storage.local.get(KEYS);
  return {
    all: Object.values(d.posts || {}).sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0)),
    screenCodes: d.screenCodes || {},
    overrides: d.accountTopics || {}, // author -> category the user picked
    aiTopics: d.aiTopics || {},       // author -> category from Chrome's on-device model
    aiEvents: d.aiEvents || {},       // post id -> event details from the on-device model
    geoCache: d.geoCache || {},
    starred: d.starred || {},         // post id -> true, kept forever
  };
}

// One category per account, from all of its posts; each post gets its account's category.
function computeAccounts(data) {
  const byAuthor = new Map();
  for (const p of data.all) {
    if (!byAuthor.has(p.author)) byAuthor.set(p.author, []);
    byAuthor.get(p.author).push(p);
  }
  const accounts = new Map();
  for (const [author, posts] of byAuthor) {
    const { topic: auto, scores } = IntentgramClassifier.classifyAccount(posts);
    const ai = data.aiTopics[author];
    accounts.set(author, { posts, auto, ai, scores, topic: data.overrides[author] || ai || auto });
  }
  for (const p of data.all) {
    p.topic = accounts.get(p.author).topic;
    p.event = IntentgramEvents.merge(IntentgramEvents.extract(p), data.aiEvents[p.id], p);
  }
  return accounts;
}
