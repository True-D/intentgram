// Receives intercepted responses, extracts posts and stores them. Also records which
// posts actually appeared on screen so the viewer can report capture coverage.
(() => {
  // Storage is written only by the background worker, so tabs never overwrite each other.
  function savePosts(posts, source) {
    IntentgramAutoScroll.onPosts(posts);
    if (posts.length) chrome.runtime.sendMessage({ type: 'posts', posts, source }).catch(() => {});
  }

  function saveScreenCodes(codes) {
    if (codes.length) chrome.runtime.sendMessage({ type: 'screen', codes }).catch(() => {});
  }

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
    for (const a of document.querySelectorAll('article a[href*="/p/"], article a[href*="/reel/"]')) {
      const m = a.getAttribute('href').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      if (m) codes.add(m[1]);
    }
    saveScreenCodes([...codes]);
  }

  let timer = null;
  const throttled = () => { if (!timer) timer = setTimeout(() => { timer = null; scanScreen(); }, 1000); };

  document.addEventListener('DOMContentLoaded', () => {
    scanEmbedded();
    scanScreen();
    new MutationObserver(throttled).observe(document.body, { childList: true, subtree: true });
  });
})();
