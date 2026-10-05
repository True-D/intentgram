(async () => {
  const { posts = {}, starred = {} } = await chrome.storage.local.get(['posts', 'starred']);
  document.getElementById('count').textContent = Object.keys(posts).length;
  document.getElementById('sub').textContent = `posts kept · ${Object.keys(starred).length} ★ saved`;
})();

// Pause stops new posts from being stored (and stops auto-scroll) until resumed.
async function showPaused() {
  const { paused } = await chrome.storage.local.get('paused');
  document.getElementById('pause').textContent = paused ? 'Resume collecting' : 'Pause collecting';
  document.getElementById('pause').classList.toggle('paused', !!paused);
  document.getElementById('auto').disabled = !!paused;
  if (paused) document.getElementById('autoStatus').textContent = 'Collecting is paused. New posts are not saved.';
  return paused;
}
document.getElementById('pause').onclick = async () => {
  const { paused } = await chrome.storage.local.get('paused');
  await chrome.runtime.sendMessage({ type: 'pause', paused: !paused });
  if (paused) document.getElementById('autoStatus').textContent = '';
  showPaused();
};
document.getElementById('open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();

// Auto-scroll runs in the Instagram tab; the popup only starts it and shows the last result.
(async () => {
  const { autoScroll } = await chrome.storage.local.get('autoScroll');
  if (await showPaused()) return;
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

// Firefox may leave site access off until the user allows it; Chrome grants it at install.
(async () => {
  const origins = chrome.runtime.getManifest().host_permissions;
  if (!chrome.permissions || await chrome.permissions.contains({ origins })) return;
  const b = document.getElementById('grant');
  b.classList.remove('hidden');
  b.onclick = async () => { if (await chrome.permissions.request({ origins })) b.classList.add('hidden'); };
})();
