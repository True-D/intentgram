(async () => {
  const { posts = {}, starred = {} } = await chrome.storage.local.get(['posts', 'starred']);
  document.getElementById('count').textContent = Object.keys(posts).length;
  document.getElementById('sub').textContent = `posts kept · ${Object.keys(starred).length} ★ saved`;
})();
document.getElementById('open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
