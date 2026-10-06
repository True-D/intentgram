# CLAUDE.md

Context for Claude (or anyone) continuing work on this repo.

## What this is

**Intently** is a browser extension (Chrome, Firefox 128+, LibreWolf) that collects the posts in your own Instagram home feed and lets you browse them by topic, place, time and account instead of the algorithm's order. Sorting runs with on-device AI. It's a prototype by t (GitHub `True-D`) that also serves as a feasibility test (`feasibility-tests.md`, `spec.md`).

- User-facing docs: `README.md` (overview, install) and `extension/README.md` (every feature in detail, plus a file table). Read the extension README before changing behavior.
- Current version: see `"version"` in `extension/manifest.json`.

### Naming: renamed from Intentgram, ids kept on purpose

The product was renamed from Intentgram to Intently (2026-10-05) because Instagram's brand rules forbid "gram"/"insta" in third-party app names, a takedown risk if it's ever published. Only user-visible names changed. Keep these two as they are:

- The Firefox add-on id `intentgram@true-d` (`extension/manifest.firefox.json`). Changing it makes Firefox treat it as a new add-on, so existing Firefox installs lose all their data.
- The IndexedDB name `intentgram` (`extension/store.js`). It holds the saved photo copies in every browser; renaming it loses them (posts live in `chrome.storage.local` and are unaffected).

JS identifiers (`Intentgram*`), `[intentgram]` log prefixes and the repo name are invisible to users and safe to rename, but there's no need to.

## Architecture

- **Capture:** `inject.js` (page context) reads the feed data instagram.com already downloads → `content.js` → `background.js`. No extra requests to Instagram.
- **Storage:** `background.js` is the only writer of posts and saved images (`chrome.storage.local`, images in IndexedDB via `store.js`), and it runs every write through one queue (`enqueue`). Other pages ask it through `chrome.runtime.sendMessage` (`deletePost`, `deleteAll`, `cleanup`, `pause`, `autoscroll`). The feed page and Manage only write their own settings and overrides (topics, account kinds, stars, geo cache) to `chrome.storage.local`.
- **Parsing:** `parser.js` turns Instagram's undocumented JSON into posts. If capture drops to 0, this is where it breaks.
- **AI:** `ai.js` + `ai-worker.js` run CLIP (images) and multilingual-e5-small (text) with Transformers.js, vendored in `extension/lib/`. `classifier.js` has the word-count fallback.
- **Pages:** `viewer.*` is the feed page, `settings.*` is Manage, `popup.*` is the icon menu, `autoscroll.js` drives auto-scroll, `events.js` detects events, `geo.js` does place lookups (Photon/OpenStreetMap, the only outside service).
- **Account kinds:** `accountKind()` in `shared.js` decides Friend vs Creator & brand from account info plus user overrides (`accountKinds`).

## Build and test

There's no build step or test suite for Chrome.

- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `extension/`. After changes, click the reload icon. Reloading orphans open Instagram tabs until they're refreshed.
- **Firefox / LibreWolf:** `./build-firefox.sh` makes `dist/firefox/` and `intently-firefox.xpi` (both git-ignored). It copies `extension/` and swaps in `manifest.firefox.json`.
- **Check syntax:** `node --check extension/*.js` (skip `lib/`).
- **Real testing** needs a logged-in Instagram tab and, for AI, a machine that can reach huggingface.co (the cloud sandbox can't). Most features were built against a fake feed.
- **Releasing a version:** bump `"version"` in both `extension/manifest.json` and `extension/manifest.firefox.json`, and the version in the `extension/README.md` title. Update the extension README for any user-visible change.

## Decisions (with reasons)

- **Desktop browser extension first**, phone later. Instagram's official API can't read a personal home feed; an extension reads what the user's browser already loaded.
- **No paid scrapers or backends.** t wants zero running costs while proving feasibility.
- **On-device AI by default** (CLIP + multilingual-e5-small), with an optional user API key / OpenRouter later. The builder pays nothing and posts never leave the computer. Larger models (e5-base, bge-m3, Qwen3-Embedding) were tested and weren't better.
- **A flat list of 60 default topics plus a literal-word bonus** (a topic phrase found word for word in a caption counts extra), editable in Manage. Bad categories came from missing topics, so improve sorting by adding topics or phrases.
- **Rejected: grouped subtopics and auto-discovered feed topics.** t judged both worse on their own feed. Don't reintroduce them without asking.
- **Declined: a "N new posts" live-update banner on the feed page, and re-attaching open Instagram tabs after a reload** (would need the `scripting` permission). Don't build them unless t asks.
- **Accounts with no friend/creator signal default to Creators & brands with a "?"** so the user can pick.
- **Delete post has no confirm, and deleted posts aren't remembered**, so they're collected again if seen again.
- **Ads are hidden by default**, shown via Filters → Show ads.

## Open work

- **Auto-scroll opt-in (waiting on t):** proposal to hide auto-scroll behind an opt-in toggle in Manage with a risk warning, since Instagram's terms don't allow automated collection. Not built.
- **Stale branches** on GitHub (`feed-topics`, `subtopics`, `firefox`, `pause-collecting`, `more-topics`): delete only when t says so.

## Working conventions

- t usually reviews in a browser, so explain changes in plain words and keep the READMEs current.
- Code work has normally been done by a Claude Code session on t's Mac in `~/claude-project/intendgram` (it can run the real AI models). Avoid two sessions building the same change in parallel.
- Work on a branch and open a PR to `main`; t merges.
