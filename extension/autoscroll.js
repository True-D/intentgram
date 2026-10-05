// Scrolls the home feed for the user until it reaches posts older than the chosen
// number of days. Runs in the user's own logged-in tab at reading pace, and stops as
// soon as the user touches the page or Instagram shows any sign of pushing back.
const IntentgramAutoScroll = (() => {
  const LIMITS = {
    maxMinutes: 15,
    maxNewPosts: 800,
    oldStreak: 12,       // followed posts in a row older than the cutoff
    suggestedStreak: 30, // posts in a row from accounts you don't follow ("You're all caught up")
    idleSteps: 8,        // steps at the bottom of the page with nothing new loading
  };

  // Pure state updates, kept separate from the DOM so they can be tested.
  function newRun(days, now) {
    return { days, cutoff: now - days * 864e5, startedAt: now, seen: new Set(), newPosts: 0,
      oldStreak: 0, suggestedStreak: 0, idleSteps: 0, oldestRecent: null };
  }

  function addPosts(run, posts) {
    for (const p of posts) {
      if (run.seen.has(p.id)) continue;
      run.seen.add(p.id);
      run.newPosts++;
      if (p.isAd) continue;
      if (p.following === false) { run.suggestedStreak++; continue; }
      run.suggestedStreak = 0;
      if (!p.takenAt) continue;
      if (p.takenAt < run.cutoff) run.oldStreak++;
      else {
        run.oldStreak = 0;
        if (!run.oldestRecent || p.takenAt < run.oldestRecent) run.oldestRecent = p.takenAt;
      }
    }
  }

  function check(run, now) {
    if (run.oldStreak >= LIMITS.oldStreak) return `Done: reached posts older than ${run.days} days.`;
    if (run.suggestedStreak >= LIMITS.suggestedStreak) return "Done: you're all caught up; only suggested posts are left.";
    if (run.idleSteps >= LIMITS.idleSteps) return 'Stopped: the feed stopped loading new posts.';
    if (run.newPosts >= LIMITS.maxNewPosts) return `Stopped at the ${LIMITS.maxNewPosts}-post limit.`;
    if (now - run.startedAt > LIMITS.maxMinutes * 60e3) return `Stopped at the ${LIMITS.maxMinutes}-minute limit.`;
    return null;
  }

  // ---- Page side ----
  let run = null;
  let box = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const ago = (ms) => { const d = Math.floor((Date.now() - ms) / 864e5); return d < 1 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };

  function overlay(text, running) {
    if (!box) {
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:300px;padding:12px 14px;' +
        'border-radius:12px;background:#6b4fd8;color:#fff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      box.innerHTML = '<b>Intentgram auto-scroll</b><div></div><button style="margin-top:8px;padding:4px 10px;border:0;' +
        'border-radius:6px;background:#fff;color:#6b4fd8;font:inherit;cursor:pointer"></button>';
      box.querySelector('button').onclick = () => (run ? stop('Stopped by you.') : (box.remove(), (box = null)));
      document.documentElement.appendChild(box);
    }
    box.querySelector('div').textContent = text;
    box.querySelector('button').textContent = running ? 'Stop' : 'Close';
  }

  function progress() {
    const oldest = run.oldestRecent ? ` · scrolled back to ${ago(run.oldestRecent)}` : '';
    return `${run.newPosts} new posts${oldest}. Touch the page to stop.`;
  }

  function report(state, message) {
    chrome.storage.local.set({ autoScroll: { state, message, newPosts: run ? run.newPosts : 0, at: Date.now() } });
  }

  function stop(message) {
    if (!run) return;
    overlay(`${message} ${run.newPosts} new posts captured.`, false);
    report('done', message);
    run = null;
  }

  // Any real input from the user hands control back to them. Our own scrolling uses
  // scrollBy, which doesn't fire these events.
  const takeOver = (e) => { if (run && e.isTrusted && !(box && box.contains(e.target))) stop('Stopped: you took over.'); };

  const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200;
  const offFeed = () => location.pathname !== '/';

  async function start(days) {
    if (run) return;
    if (offFeed()) { overlay('Open your Instagram home feed first.', false); return; }
    run = newRun(days, Date.now());
    overlay('Starting…', true);
    report('running', 'Scrolling');
    for (let i = 0; i < 30 && run && !document.querySelector('article'); i++) await sleep(500);

    while (run) {
      if (document.hidden) { overlay('Paused while this tab is in the background.', true); await sleep(1000); continue; }
      if (offFeed()) { stop('Stopped: the page left the home feed.'); break; }

      const before = run.newPosts;
      window.scrollBy({ top: window.innerHeight * rand(0.6, 0.9), behavior: 'smooth' });
      // Reading pace: a few seconds per screen, with an occasional longer pause.
      await sleep(Math.random() < 0.1 ? rand(6000, 12000) : rand(1800, 4200));
      if (!run) break;

      if (run.newPosts > before) run.idleSteps = 0;
      else if (atBottom()) run.idleSteps++;
      const reason = check(run, Date.now());
      if (reason) stop(reason);
      else overlay(progress(), true);
    }
  }

  if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    for (const t of ['wheel', 'keydown', 'mousedown', 'touchstart']) window.addEventListener(t, takeOver, true);
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg.type === 'autoscroll-start') { start(msg.days); reply({ ok: true }); }
      if (msg.type === 'autoscroll-stop') { if (run) stop(msg.why || 'Stopped by you.'); reply({ ok: true }); }
    });
  }

  return {
    onPosts: (posts) => { if (run) addPosts(run, posts); },
    blocked: (why) => stop(`Stopped: Instagram ${why}. Wait a while before trying again.`),
    _test: { LIMITS, newRun, addPosts, check },
  };
})();
if (typeof module !== 'undefined') module.exports = IntentgramAutoScroll;
