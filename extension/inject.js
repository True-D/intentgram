// Runs in the page's own JS world. Copies the JSON responses Instagram's web app
// already fetches for itself and hands them to content.js. Makes no extra requests.
(() => {
  const isInteresting = (url) => /\/(api\/v1|graphql)\b/.test(url) || url.includes('/graphql');
  const looksLikePosts = (text) => typeof text === 'string' && (text.includes('"code"') || text.includes('"shortcode"'));
  const send = (url, text) => {
    if (looksLikePosts(text)) window.postMessage({ __intentgram: true, url, text }, '*');
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (isInteresting(url)) res.clone().text().then((t) => send(url, t)).catch(() => {});
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__intentgramUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (isInteresting(this.__intentgramUrl || '')) {
      this.addEventListener('load', () => {
        try {
          const t = this.responseType === '' || this.responseType === 'text'
            ? this.responseText
            : this.responseType === 'json' ? JSON.stringify(this.response) : null;
          if (t) send(this.__intentgramUrl, t);
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
