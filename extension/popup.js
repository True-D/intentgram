(async () => {
  const { posts = {}, starred = {} } = await chrome.storage.local.get(['posts', 'starred']);
  document.getElementById('count').textContent = Object.keys(posts).length;
  document.getElementById('sub').textContent = `posts kept · ${Object.keys(starred).length} ★ saved`;
})();
document.getElementById('open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();

// Auto-scroll runs in the Instagram tab; the popup only starts it and shows the last result.
(async () => {
  const { autoScroll } = await chrome.storage.local.get('autoScroll');
  if (autoScroll) {
    document.getElementById('autoStatus').textContent = autoScroll.state === 'running'
      ? 'Auto-scroll is running in the Instagram tab.'
      : `Last auto-scroll (${new Date(autoScroll.at).toLocaleString()}): ${autoScroll.message} ${autoScroll.newPosts} new posts.`;
  }
})();
document.getElementById('auto').onclick = async () => {
  const status = document.getElementById('autoStatus');
  status.textContent = 'Starting…';
  let r;
  try { r = await chrome.runtime.sendMessage({ type: 'autoscroll', days: 7 }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (r && r.ok) window.close();
  else status.textContent = 'Could not start: ' + ((r && r.error) || 'no answer from the extension. Reload it in chrome://extensions.');
};
