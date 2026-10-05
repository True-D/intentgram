// Helpers and data loading shared by the viewer and the settings page.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const norm = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : '–');

const KEYS = ['posts', 'screenCodes', 'accountTopics', 'aiTopics', 'aiEvents', 'geoCache', 'starred', 'topics', 'postTopics', 'aiPostTopics', 'aiPostGuesses'];

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
    topics: Array.isArray(d.topics) && d.topics.length ? d.topics : IntentgramAI.DEFAULT_TOPICS, // [{ name, hint }]
    postTopics: d.postTopics || {},   // post id -> category the user picked for that post
    aiPostTopics: d.aiPostTopics || {}, // post id -> category from the on-device picture+caption models
    aiPostGuesses: d.aiPostGuesses || {}, // post id -> the models' best guess when they weren't sure
  };
}

// Each post's category, first match wins: your choice for the post, your choice for
// its account, the on-device models when they're sure, the account's usual topic if
// it mostly posts about one thing, the models' best guess, then the account's topic.
// An account's usual topic is the most common sure model result among its posts,
// falling back to Chrome's AI or keyword counting.
function computeAccounts(data) {
  const names = new Set([...data.topics.map((t) => t.name), IntentgramClassifier.OTHER]);
  const valid = (t) => (t && names.has(t) ? t : null);
  const byAuthor = new Map();
  for (const p of data.all) {
    if (!byAuthor.has(p.author)) byAuthor.set(p.author, []);
    byAuthor.get(p.author).push(p);
  }
  const accounts = new Map();
  for (const [author, posts] of byAuthor) {
    const { topic: kw, scores } = IntentgramClassifier.classifyAccount(posts);
    const auto = valid(kw) || IntentgramClassifier.OTHER;
    const ai = valid(data.aiTopics[author]);
    const mix = {};
    for (const p of posts) { const t = valid(data.aiPostTopics[p.id]); if (t) mix[t] = (mix[t] || 0) + 1; }
    const usual = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    const sure = Object.values(mix).reduce((a, b) => a + b, 0);
    const focused = !!usual && usual[1] / sure >= 0.6;
    const topic = valid(data.overrides[author]) || (usual && usual[0]) || ai || auto;
    accounts.set(author, { posts, auto, ai, scores, mix, focused, topic });
  }
  for (const p of data.all) {
    const a = accounts.get(p.author);
    p.topic = valid(data.postTopics[p.id]) || valid(data.overrides[p.author]) || valid(data.aiPostTopics[p.id]) ||
      (a.focused ? a.topic : valid(data.aiPostGuesses[p.id])) || a.topic;
    p.event = IntentgramEvents.merge(IntentgramEvents.extract(p), data.aiEvents[p.id], p);
  }
  return accounts;
}
