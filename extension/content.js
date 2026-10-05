// Receives intercepted responses, extracts posts and stores them. Also records which
// posts actually appeared on screen so the viewer can report capture coverage.
(() => {
  // Storage is written only by the background worker, so tabs never overwrite each other.
  function savePosts(posts, source) {
    IntentgramAutoScroll.onPosts(posts);
    if (posts.length) chrome.runtime.sendMessage({ type: 'posts', posts, source }).catch(() => {});
  }

  function saveScreenCodes(codes, adCodes) {
    if (codes.length) chrome.runtime.sendMessage({ type: 'screen', codes, adCodes }).catch(() => {});
  }

  // The "Sponsored" label Instagram shows on ads, in the languages people are likely to use.
  const SPONSORED = new Set(['Sponsored', '贊助', '赞助', '廣告', '广告', '広告', '광고', 'Gesponsert',
    'Sponsorisé', 'Patrocinado', 'Sponsorizzato', 'Gesponsord', 'Sponsrad', 'Sponset', 'Sponsoreret',
    'Sponsoroitu', 'Sponsorowane', 'Реклама', 'Sponsorlu', 'ได้รับการสนับสนุน', 'Bersponsor', 'Được tài trợ']);
  const isSponsored = (article) => [...article.querySelectorAll('span, a, div')]
    .some((el) => el.childElementCount === 0 && SPONSORED.has(el.textContent.trim()));

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__intentgramBlocked) { IntentgramAutoScroll.blocked(e.data.why); return; }
    if (!e.data.__intentgram) return;
    let path = e.data.url;
    try { path = new URL(e.data.url, location.href).pathname; } catch (_) {}
    savePosts(IntentgramParser.extractFromText(e.data.text), path);
  });

  // The first batch of the feed is embedded in the page HTML rather than fetched.
  function scanEmbedded() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent;
      if (t && (t.includes('image_versions2') || t.includes('display_url'))) {
        savePosts(IntentgramParser.extractFromText(t), 'embedded-html');
      }
    }
  }

  // Only the home feed counts for coverage; profile grids and explore would skew it.
  function scanScreen() {
    if (location.pathname !== '/') return;
    const codes = new Set();
    const adCodes = new Set();
    for (const article of document.querySelectorAll('article')) {
      const own = new Set();
      for (const a of article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const m = a.getAttribute('href').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) own.add(m[1]);
      }
      own.forEach((c) => codes.add(c));
      if (own.size && isSponsored(article)) own.forEach((c) => adCodes.add(c));
    }
    saveScreenCodes([...codes], [...adCodes]);
  }

  let timer = null;
  const throttled = () => { if (!timer) timer = setTimeout(() => { timer = null; scanScreen(); }, 1000); };

  document.addEventListener('DOMContentLoaded', () => {
    scanEmbedded();
    scanScreen();
    new MutationObserver(throttled).observe(document.body, { childList: true, subtree: true });
  });
})();
