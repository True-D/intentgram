// Runs in the page's own JS world. Copies the JSON responses Instagram's web app
// already fetches for itself and hands them to content.js. Makes no extra requests.
(() => {
  const isInteresting = (url) => /\/(api\/v1|graphql)\b/.test(url) || url.includes('/graphql');
  const looksLikePosts = (text) => typeof text === 'string' && (text.includes('"code"') || text.includes('"shortcode"'));
  // Signs that Instagram wants the session to slow down; the auto-scroller stops on these.
  const pushback = (status, text) =>
    status === 429 ? 'is limiting requests (HTTP 429)'
      : /"(feedback_required|checkpoint_required|login_required)"|Please wait a few minutes/.test(text || '')
        ? 'asked to slow down or confirm your account' : null;
  const warn = (status, text) => {
    const why = pushback(status, text);
    if (why) window.postMessage({ __intentgramBlocked: true, why }, '*');
  };
  const send = (url, text) => {
    if (looksLikePosts(text)) window.postMessage({ __intentgram: true, url, text }, '*');
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (isInteresting(url)) res.clone().text().then((t) => { warn(res.status, t); send(url, t); }).catch(() => {});
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
          warn(this.status, t);
          if (t) send(this.__intentgramUrl, t);
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
