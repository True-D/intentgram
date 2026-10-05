// Sorts each post into a topic with on-device models (see ai-worker.js):
//  - the picture is compared with each topic's description (CLIP)
//  - the caption is compared with each topic's description, in any language (E5)
//  - posts you corrected teach it: similar posts lean toward the topic you picked
// Everything runs on this computer. Vectors are kept in IndexedDB.
const IntentgramAI = (() => {
  const DEFAULT_TOPICS = [
    ['Wildlife', 'wild animals, birds, insects and safari 野生動物 鳥 賞鳥'],
    ['Pets', 'pet dogs and cats at home 寵物 狗 貓 毛孩'],
    ['Nature', 'landscapes, mountains, forests, sea, sunsets and flowers 風景 大自然 山 海'],
    ['Travel', 'travel, trips, sightseeing and hotels 旅行 旅遊 景點'],
    ['Dance', 'dancers, dance performances and ballet 舞蹈 跳舞 芭蕾'],
    ['Music', 'musicians, concerts, bands and singers 音樂 演唱會 樂團'],
    ['Architecture', 'buildings, interiors and architecture 建築 室內設計'],
    ['Food', 'food, drinks, cooking and restaurants 美食 料理 餐廳 咖啡'],
    ['Fashion', 'fashion, outfits, makeup and beauty 時尚 穿搭 美妝'],
    ['Fitness', 'fitness, gym workouts, yoga and running 健身 瑜伽 跑步'],
    ['Sports', 'sports games, football, basketball and athletes 運動 比賽 球賽'],
    ['Art', 'art, paintings, illustrations and exhibitions 藝術 插畫 展覽'],
    ['Photography', 'photography, cameras and photo shoots 攝影 相機'],
    ['Tech', 'technology, gadgets, software and AI 科技 程式'],
    ['Humor', 'memes, jokes and funny videos 迷因 搞笑'],
    ['News', 'news, politics and current events 新聞 政治'],
  ].map(([name, hint]) => ({ name, hint }));
  const OTHER = 'Other';
  const VERSION = 1; // bump when models or inputs change, so vectors are rebuilt
  const UNSURE = 0.3; // below this, a post falls back to its account's usual topic

  async function topics() {
    const { topics } = await chrome.storage.local.get('topics');
    return Array.isArray(topics) && topics.length ? topics : DEFAULT_TOPICS;
  }

  // ---- Worker ----
  let worker = null, seq = 0;
  const pending = new Map();
  let onDownload = null;
  function call(type, payload) {
    if (!worker) {
      worker = new Worker('ai-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'download') { if (onDownload) onDownload(e.data); return; }
        const p = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (p) e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }

  // Instagram's alt text starts with boilerplate ("Photo by x on May 3. May be an image of").
  const cleanAlt = (alt) => String(alt || '').replace(/^.*?(may be|could be) (an? )?(image|photo|video|graphic|illustration)( of)?/i, '').trim();
  const postText = (p) => [p.caption, cleanAlt(p.altText), p.location].filter(Boolean).join('\n');

  async function imageBlob(p) {
    try { const b = await IntentgramStore.getImage(p.id); if (b) return b; } catch (_) {}
    if (!p.thumb || (p.mediaExpiresAt && p.mediaExpiresAt < Date.now())) return null;
    try { const r = await fetch(p.thumb, { credentials: 'omit' }); return r.ok ? await r.blob() : null; } catch (_) { return null; }
  }

  // A topic is matched by its name and each phrase of its description, and a post
  // scores its best match. Pictures are compared with the English phrases only.
  function phrases(t) {
    const ps = [t.name, ...String(t.hint || '').split(/[,，、;；]\s*|\s+and\s+|\s+(?=[\u3040-\u9fff])/)]
      .map((s) => s.trim()).filter(Boolean);
    const english = ps.filter((s) => !/[\u3040-\u9fff]/.test(s)).map((s) => s.toLowerCase());
    return { img: english.length ? english : [t.name], txt: ps };
  }

  // Topic vectors are cached under a key that changes whenever the topic list does.
  async function topicVectors(list) {
    const key = '__topics';
    const sig = 'phrases-v1' + JSON.stringify(list.map((t) => [t.name, t.hint]));
    const all = await IntentgramStore.getAllVectors();
    const cached = all.get(key);
    if (cached && cached.sig === sig) return { vectors: all, topicVecs: cached };
    const v = await call('topics', { topics: list.map(phrases) });
    const topicVecs = { sig, img: v.img, txt: v.txt };
    await IntentgramStore.putVectors([[key, topicVecs]]);
    return { vectors: all, topicVecs };
  }

  // Computes vectors for posts that don't have them yet. progress(done, total, download)
  async function prepare(posts, progress) {
    onDownload = (d) => progress(0, 0, d);
    const list = await topics();
    const { vectors, topicVecs } = await topicVectors(list);
    const todo = posts.filter((p) => { const v = vectors.get(p.id); return !v || v.v !== VERSION; });
    for (let i = 0; i < todo.length; i += 4) {
      const batch = todo.slice(i, i + 4);
      const items = await Promise.all(batch.map(async (p) => ({ id: p.id, blob: await imageBlob(p), text: postText(p) })));
      const out = await call('embed', { items });
      const entries = out.map((r) => [r.id, { v: VERSION, img: r.img, txt: r.txt }]);
      await IntentgramStore.putVectors(entries);
      for (const [id, v] of entries) vectors.set(id, v);
      progress(Math.min(i + 4, todo.length), todo.length);
    }
    onDownload = null;
    return { list, vectors, topicVecs };
  }

  // ---- Scoring (pure) ----
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  function softmax(xs, scale) {
    const m = Math.max(...xs);
    const e = xs.map((x) => Math.exp((x - m) * scale));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / z);
  }

  // How alike two posts are, 0..1. Pictures count most; E5 similarities sit high
  // (unrelated captions still score ~0.75), so they're stretched first.
  function similarity(a, b) {
    const s = [];
    if (a.img && b.img) s.push(dot(a.img, b.img));
    if (a.txt && b.txt) s.push(Math.max(0, 1 - (1 - dot(a.txt, b.txt)) * 2.5));
    return s.length ? Math.max(...s) : 0;
  }

  // labels: Map post id -> topic the user picked (directly, or via the account).
  // Returns Map post id -> { topic, sure, parts } for posts that have vectors.
  function assign(posts, prepared, labels) {
    const { list, vectors, topicVecs } = prepared;
    const names = list.map((t) => t.name);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const examples = [...labels].map(([id, topic]) => ({ id, topic, v: vectors.get(id), author: byId.get(id) && byId.get(id).author }))
      .filter((x) => x.v && names.includes(x.topic));
    const out = new Map();
    for (const p of posts) {
      const v = vectors.get(p.id);
      if (!v) continue;
      // Zero-shot: compare with each topic's description.
      const parts = [];
      const best = (x, vs) => Math.max(...vs.map((t) => dot(x, t)));
      if (v.img) parts.push([softmax(topicVecs.img.map((vs) => best(v.img, vs)), 100), (p.caption || '').length < 20 ? 3 : 1]);
      if (v.txt) parts.push([softmax(topicVecs.txt.map((vs) => best(v.txt, vs)), 100), 1]);
      let probs = names.map(() => 0);
      if (parts.length) {
        const w = parts.reduce((a, [, x]) => a + x, 0);
        probs = names.map((_, i) => parts.reduce((a, [ps, x]) => a + ps[i] * x, 0) / w);
      }
      // Learned: the most similar posts you've labeled vote for their topic.
      const near = examples.filter((x) => x.id !== p.id)
        .map((x) => ({ topic: x.topic, s: similarity(v, x.v) + (x.author === p.author ? 0.03 : 0) }))
        .filter((x) => x.s > 0.75).sort((a, b) => b.s - a.s).slice(0, 5);
      if (near.length) {
        const votes = names.map(() => 0);
        let weight = 0;
        for (const n of near) { const w = Math.exp((n.s - 1) / 0.08); votes[names.indexOf(n.topic)] += w; weight += w; }
        const a = Math.min(0.8, weight);
        probs = probs.map((x, i) => (1 - a) * x + a * (votes[i] / weight));
      }
      const top = probs.indexOf(Math.max(...probs));
      out.set(p.id, { topic: names[top], sure: probs[top], learned: near.length > 0 });
    }
    return out;
  }

  return { DEFAULT_TOPICS, OTHER, UNSURE, topics, prepare, assign };
})();
