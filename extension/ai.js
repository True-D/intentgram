// Sorts each post into a topic with on-device models (see ai-worker.js):
//  - the picture is compared with each topic's description (CLIP)
//  - the caption is compared with each topic's description, in any language (E5)
//  - posts you corrected teach it: similar posts lean toward the topic you picked
// Everything runs on this computer. Vectors are kept in IndexedDB.
const IntentgramAI = (() => {
  // Descriptions name what a photo shows or a caption talks about: a vague one
  // like "buildings" matches any photo with a building in the background.
  const DEFAULT_TOPICS = [
    ['Wildlife', 'wild animals in nature, safari, a deer, a bear, a monkey, 野生動物'],
    ['Birds', 'a wild bird, bird watching, 鳥, 賞鳥, 野鳥'],
    ['Dogs', 'a pet dog, a puppy, 狗, 狗狗'],
    ['Cats', 'a pet cat, a kitten, 貓, 貓咪'],
    ['Other pets', 'a pet rabbit, a hamster, a pet bird, a reptile, 兔子, 倉鼠, 寵物'],
    ['Plants & flowers', 'flowers, houseplants, a garden, gardening, 花, 植物, 園藝'],
    ['Mountains & hiking', 'a mountain landscape, a forest, a hiking trail, 登山, 健行, 森林'],
    ['Sea & beaches', 'a beach, the ocean, an island coast, 海邊, 沙灘, 海'],
    ['Sky & sunsets', 'a sunset, a sunrise, clouds, the night sky with stars, 夕陽, 日出, 星空'],
    ['Travel', 'travel, a trip abroad, sightseeing, a famous landmark, 旅行, 旅遊, 景點'],
    ['City streets', 'a city street, an old town, a street view, urban life, 街景, 城市, 老街'],
    ['Hotels & stays', 'a hotel room, a resort, a swimming pool, 飯店, 住宿, 民宿'],
    ['Restaurants', 'a plated dish at a restaurant, fine dining, 餐廳, 美食'],
    ['Asian food', 'ramen, noodles, sushi, dumplings, hot pot, street food, 拉麵, 壽司, 小吃, 夜市'],
    ['Home cooking', 'home cooking, a recipe, cooking in a kitchen, 料理, 食譜, 自煮'],
    ['Baking & desserts', 'baking, an oven, bread, a cake, pastries, a dessert, 烘焙, 甜點, 蛋糕, 麵包'],
    ['Coffee & cafés', 'a cup of coffee, latte art, a café, tea, 咖啡, 咖啡廳, 茶'],
    ['Drinks & bars', 'a cocktail, wine, beer, a bar, 調酒, 酒吧, 葡萄酒, 啤酒'],
    ['Architecture', 'the architecture of a building exterior, a modern building design, 建築, 建築設計'],
    ['Interior design', 'interior design of a room, home decor, furniture, materials, 室內設計, 居家佈置, 家具, 材質'],
    ['Product design', 'a designed object, a chair, a lamp, industrial design, 產品設計, 工業設計, 物件'],
    ['Graphic design', 'a poster, typography, a logo, graphic design, branding, 平面設計, 字體, 海報'],
    ['Painting & illustration', 'a painting, a drawing, an illustration, 繪畫, 插畫, 畫作'],
    ['Exhibitions & museums', 'an art exhibition, a museum, a gallery, an installation, 展覽, 美術館, 藝廊'],
    ['Crafts & ceramics', 'handmade crafts, ceramics, pottery, weaving, 手作, 陶藝, 工藝'],
    ['Photography', 'a camera, a photographer, a photo shoot, film photography, 攝影, 相機, 底片'],
    ['Film', 'a film, cinema, a movie screening, a director, a film festival, 電影, 電影院, 影展, 導演'],
    ['TV & series', 'a TV series, a drama, a streaming show, anime, 影集, 日劇, 韓劇, 動畫'],
    ['Books & reading', 'a book, reading, a bookstore, a library, 書, 閱讀, 書店'],
    ['Writing & poetry', 'a poem, an essay, writing, literature, 詩, 散文, 寫作, 文學'],
    ['Music', 'a musician, a singer, a band, an album, playing an instrument, 音樂, 歌手, 樂團, 專輯'],
    ['Concerts & festivals', 'a concert stage, a live music festival crowd, 演唱會, 音樂祭, 現場'],
    ['Dance', 'dancers, a dance performance, ballet, 舞蹈, 跳舞, 芭蕾'],
    ['Theatre & performance', 'a theatre play, a stage performance, performance art, 劇場, 表演, 舞台劇'],
    ['Fashion', 'an outfit, street style, clothing, a fashion show, 穿搭, 時尚'],
    ['Beauty & makeup', 'makeup, skincare products, nail art, hair styling, 美妝, 保養, 美甲'],
    ['Fitness', 'a gym workout, weight training, 健身, 重訓'],
    ['Yoga & wellness', 'yoga, pilates, meditation, wellness, 瑜伽, 冥想, 身心靈'],
    ['Running & cycling', 'running, a marathon, cycling, a bike ride, 跑步, 馬拉松, 自行車'],
    ['Sports', 'football, basketball, baseball, tennis, a sports match, 運動, 比賽, 球賽'],
    ['Outdoor adventures', 'surfing, rock climbing, skiing, camping, diving, 衝浪, 攀岩, 滑雪, 露營'],
    ['Selfies & portraits', 'a selfie, a portrait of a person, 自拍, 人像'],
    ['Friends & family', 'a group of friends, family photos, a party, 朋友, 家人, 聚會'],
    ['Kids & parenting', 'a baby, young children, parenting, 寶寶, 小孩, 育兒, 親子'],
    ['Weddings', 'a wedding, a bride, an engagement, 婚禮, 婚紗, 求婚'],
    ['Life', 'personal life, a diary, moving house, everyday moments, memories, 生活, 日常, 日子, 搬家, 回憶'],
    ['Self help', 'psychology, self growth, mental health, toxic people, setting boundaries, 心理, 自我成長, 情緒, 界線'],
    ['Love & relationships', 'love, a couple, dating, relationships, 愛情, 感情, 情侶'],
    ['Quotes', 'a quote, a text post, words on a plain background, 語錄, 金句, 文字'],
    ['Humor', 'a meme, a joke, a funny video, 迷因, 搞笑'],
    ['News', 'news, politics, current events, an election, 新聞, 政治, 時事'],
    ['Social issues', 'activism, a protest, human rights, climate change, equality, 社會議題, 人權, 環境, 平權'],
    ['Tech', 'technology, a gadget, a computer, software, AI, 科技, 程式, 人工智慧'],
    ['Science & learning', 'science, history, education, explainers, facts, 科學, 歷史, 知識, 教育'],
    ['Business & career', 'business, startups, work, career advice, entrepreneurship, 創業, 職場, 工作'],
    ['Money & investing', 'money, investing, stocks, personal finance, 理財, 投資, 股票'],
    ['Open calls', 'an open call, an artist residency, an application deadline, submissions, a grant, 徵件, 駐村, 截止, 報名, 徵選'],
    ['Events & workshops', 'a workshop, a talk, a market, an event poster, tickets, 工作坊, 講座, 市集, 活動'],
    ['Shopping', 'a product for sale, a new collection, a discount, a shop, 購物, 新品, 折扣, 開箱'],
    ['Cars & motorbikes', 'a car, a motorcycle, a scooter, 汽車, 機車, 重機'],
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
