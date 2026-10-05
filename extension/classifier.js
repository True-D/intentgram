// Sorts each account into one topic using the text of all its captured posts
// (captions, hashtags, Instagram's alt text, location, username). Runs locally.
const IntentgramClassifier = (() => {
  const TOPICS = {
    Wildlife: ['wildlife', 'animal', 'bird', 'birds', 'lion', 'tiger', 'elephant', 'fox', 'wolf', 'bear', 'deer', 'owl', 'eagle', 'safari', 'whale', 'shark', 'monkey', 'zebra', 'giraffe', 'leopard', 'cheetah', 'insect', 'butterfly', 'reptile', 'snake', 'natgeo', 'birding', 'birdwatching'],
    Pets: ['dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'pet', 'pets', 'doggo', 'catsofinstagram', 'dogsofinstagram'],
    Nature: ['nature', 'mountain', 'mountains', 'forest', 'lake', 'ocean', 'sea', 'sunset', 'sunrise', 'landscape', 'waterfall', 'hiking', 'hike', 'trees', 'flowers', 'sky', 'beach', 'snow', 'outdoors'],
    Travel: ['travel', 'trip', 'vacation', 'holiday', 'wanderlust', 'explore', 'traveling', 'travelling', 'roadtrip', 'airport', 'flight', 'hotel', 'destination', 'backpacking', 'passport', 'visit'],
    Dance: ['dance', 'dancer', 'dancing', 'ballet', 'choreography', 'choreo', 'hiphop', 'salsa', 'tango', 'breakdance', 'kpop', 'contemporary'],
    Music: ['music', 'song', 'singer', 'concert', 'jazz', 'gig', 'festival', 'guitar', 'piano', 'band', 'album', 'dj', 'live', 'tour', 'musician', 'newmusic', 'rap'],
    Architecture: ['architecture', 'architect', 'building', 'buildings', 'interior', 'interiordesign', 'design', 'house', 'skyline', 'facade', 'bridge', 'church', 'cathedral', 'modernism', 'brutalism'],
    Food: ['food', 'recipe', 'cooking', 'cook', 'dinner', 'lunch', 'breakfast', 'restaurant', 'delicious', 'yummy', 'cake', 'coffee', 'pizza', 'pasta', 'sushi', 'baking', 'chef', 'foodie', 'vegan', 'dessert'],
    Fashion: ['fashion', 'outfit', 'ootd', 'style', 'dress', 'shoes', 'model', 'streetwear', 'vogue', 'makeup', 'beauty', 'skincare', 'hair'],
    Fitness: ['fitness', 'gym', 'workout', 'training', 'yoga', 'running', 'run', 'marathon', 'health', 'muscle', 'crossfit', 'pilates'],
    Sports: ['football', 'soccer', 'basketball', 'nba', 'tennis', 'match', 'goal', 'team', 'f1', 'race', 'cycling', 'surf', 'surfing', 'ski', 'skate', 'climbing', 'olympics'],
    Art: ['art', 'artist', 'painting', 'drawing', 'illustration', 'sketch', 'artwork', 'gallery', 'museum', 'sculpture', 'digitalart', 'watercolor', 'exhibition'],
    Photography: ['photography', 'photographer', 'photoshoot', 'camera', 'canon', 'nikon', 'sony', 'lens', 'portrait', 'streetphotography', 'film', '35mm'],
    Tech: ['tech', 'technology', 'ai', 'startup', 'code', 'coding', 'software', 'iphone', 'apple', 'android', 'gadget', 'developer', 'robot'],
    Humor: ['meme', 'memes', 'funny', 'lol', 'lmao', 'comedy', 'joke', 'humor', 'humour'],
    News: ['news', 'breaking', 'politics', 'election', 'government', 'report', 'update', 'world', 'climate'],
  };
  // Chinese words are matched as substrings, since Chinese text has no spaces.
  const TOPICS_ZH = {
    Wildlife: ['野生動物', '動物', '鳥', '賞鳥', '獅子', '老虎', '大象', '狐狸', '熊貓'],
    Pets: ['狗', '貓', '毛孩', '寵物', '狗狗', '貓咪'],
    Nature: ['大自然', '山景', '海邊', '大海', '森林', '湖', '夕陽', '日出', '風景', '登山', '瀑布', '花海'],
    Travel: ['旅行', '旅遊', '出國', '自由行', '景點', '飯店', '機場'],
    Dance: ['舞蹈', '跳舞', '芭蕾', '編舞', '街舞', '舞者'],
    Music: ['音樂', '演唱會', '音樂會', '樂團', '歌手', '專輯', '爵士', '演出'],
    Architecture: ['建築', '室內設計', '設計', '大樓', '教堂'],
    Food: ['美食', '料理', '食譜', '餐廳', '咖啡', '甜點', '早午餐', '晚餐', '好吃', '烘焙'],
    Fashion: ['時尚', '穿搭', '彩妝', '保養', '美妝'],
    Fitness: ['健身', '運動', '瑜伽', '跑步', '馬拉松', '重訓'],
    Sports: ['足球', '籃球', '棒球', '網球', '比賽', '衝浪', '滑雪', '攀岩', '單車'],
    Art: ['藝術', '展覽', '畫作', '插畫', '美術館', '博物館', '雕塑', '藝術家'],
    Photography: ['攝影', '相機', '底片', '人像'],
    Tech: ['科技', '人工智慧', '程式', '手機', '新創'],
    Humor: ['迷因', '搞笑', '好笑', '笑死'],
    News: ['新聞', '快訊', '政治', '選舉'],
  };
  const NAMES = Object.keys(TOPICS);
  const OTHER = 'Other';
  const LOOKUP = new Map();
  for (const [topic, words] of Object.entries(TOPICS)) for (const w of words) LOOKUP.set(w, topic);

  // Instagram's alt text starts with boilerplate like "Photo by @x on May 3, 2026.
  // May be an image of ..." which would count as Photography on every post.
  function cleanAlt(alt) {
    return String(alt || '')
      .replace(/^(?:photo|video|reel) (?:shared )?by [^.]*?(?: on [A-Za-z]+ \d{1,2}, \d{4})?(?: tagging [^.]*)?\.\s*/i, '')
      .replace(/\b(?:may be|could be) (?:an? )?(?:image|photo|video|graphic|illustration|text|meme)(?: of)?\b/gi, ' ')
      .replace(/\bno photo description available\.?/gi, ' ');
  }

  function accountText(posts) {
    return posts.map((p) => [p.caption, cleanAlt(p.altText), p.location, p.author, p.authorFullName].filter(Boolean).join(' ')).join('\n');
  }

  function tokens(text) {
    // Hashtags count as words ("#wildlifephotography" -> also checks "wildlife").
    return text.toLowerCase().replace(/#/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  }

  function scoreText(text) {
    const scores = {};
    for (const t of tokens(text)) {
      let topic = LOOKUP.get(t);
      if (!topic && t.length > 6) {
        for (const [w, tp] of LOOKUP) if (w.length >= 4 && t.startsWith(w)) { topic = tp; break; }
      }
      if (topic) scores[topic] = (scores[topic] || 0) + 1;
    }
    for (const [topic, words] of Object.entries(TOPICS_ZH)) {
      for (const w of words) {
        const n = text.split(w).length - 1;
        if (n) scores[topic] = (scores[topic] || 0) + n;
      }
    }
    return scores;
  }

  // Returns { topic, scores } for one account.
  function classifyAccount(posts) {
    const scores = scoreText(accountText(posts));
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { topic: OTHER, scores };
    return { topic: ranked[0][0], scores };
  }

  // Optional: Chrome's built-in on-device model (Prompt API). Returns null when unavailable.
  async function aiAvailable() {
    try {
      if (typeof LanguageModel === 'undefined') return null;
      const a = await LanguageModel.availability();
      return a === 'unavailable' ? null : a; // 'available' | 'downloadable' | 'downloading'
    } catch (_) { return null; }
  }

  let session = null;
  async function aiClassifyAccount(author, posts) {
    if (!session) {
      session = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content:
          `You sort Instagram accounts into one topic based on their recent posts. Topics: ${NAMES.join(', ')}, ${OTHER}. Answer with the single best topic.` }],
      });
    }
    const sample = posts.slice(0, 8).map((p, i) =>
      `${i + 1}. ${(p.caption || '').slice(0, 300)}${p.altText ? ` [image: ${p.altText.slice(0, 200)}]` : ''}`).join('\n');
    const s = await session.clone();
    try {
      const out = await s.prompt(`Account @${author}. Recent posts:\n${sample}`, {
        responseConstraint: { type: 'object', properties: { topic: { type: 'string', enum: [...NAMES, OTHER] } }, required: ['topic'] },
      });
      return JSON.parse(out).topic;
    } finally { s.destroy(); }
  }

  return { NAMES, OTHER, classifyAccount, aiAvailable, aiClassifyAccount };
})();
