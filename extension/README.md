# Intentgram — Chrome extension prototype (v0.6.3)

Intentgram lets you browse your Instagram feed by intent: by topic, place, time or account instead of the algorithm's order. This prototype is a Chrome extension. It collects the posts in your home feed as you scroll, sorts them into categories, and lets you filter, save and review them on your own computer.

It's also a feasibility test. It answers tests #1b, #2, #4, #5 and #11 in `../feasibility-tests.md`.

## How it works

- **Capture.** It reads the feed data instagram.com already downloads for itself: the first batch built into the page, plus each new batch as you scroll. It makes no extra requests to Instagram.
- **Storage.** Posts, settings and saved images stay in the extension's storage on this computer.
- **What leaves your computer.** Only place lookups (see Place search) go to Photon, a free OpenStreetMap service. They send map coordinates and the place you type, never posts or account names.
- **Downloads.** With AI sorting on, the AI models download once from Hugging Face. Nothing about your posts is sent; the models run on this computer.
- **Capturing needs scrolling.** It only sees posts Instagram has loaded, so scroll your home feed to collect more, or let auto-scroll do it (see Auto-scroll).

## Install

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder.
4. Pin it: click the puzzle-piece icon, then pin **Intentgram Feed Probe**.

**Updating:** get the new files (for example with `git pull`), then click the reload icon on the extension in `chrome://extensions`. If a version adds new permissions, remove the extension and load it again instead.

### Firefox and LibreWolf

Firefox 128 or newer, and browsers based on it like LibreWolf, need their own build.

1. In the repository folder, run `./build-firefox.sh`. It creates `dist/firefox` and `intentgram-firefox.xpi`.
2. To try it, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `dist/firefox/manifest.json`. A temporary add-on is removed when the browser closes.
3. To keep it installed in LibreWolf: type `about:config` in the address bar and accept the warning. Search for `xpinstall.signatures.required` and click the ⇌ toggle so it reads `false`. Then open `about:addons`, choose **Extensions**, click the gear icon, choose **Install Add-on From File…**, pick `intentgram-firefox.xpi` and click **Add**. Regular Firefox ignores that setting and only installs signed add-ons, which means submitting it to addons.mozilla.org (free).
4. If the icon menu shows **Allow access to Instagram**, click it. Firefox can leave site access off until you allow it.

**Updating:** pull the new files, run `./build-firefox.sh` again and install the new `.xpi` the same way.

Chrome's built-in AI (the older optional sorting) isn't available in Firefox. The on-device CLIP and E5 sorting is.

## Using it

1. Open https://www.instagram.com/ while logged in and scroll your home feed. The badge on the icon counts captured posts.
2. Click the icon, then **Open collected posts** to open the feed page.
3. To skip the scrolling, click the icon, then **Auto-scroll: collect the last 7 days** (see Auto-scroll).
4. Click **Manage** (top right of the feed page, or in the icon menu) for accounts, saving options and test numbers.
5. To browse Instagram without collecting, click the icon, then **Pause collecting** (see Pausing).

## Pausing

**Pause collecting** (in the icon menu) stops saving new posts until you click **Resume collecting**. It stays paused after you close Chrome.

- While paused, the icon's badge shows **||**, the feed page shows a "Collecting is paused" note with a Resume button, and auto-scroll can't start.
- Pausing stops an auto-scroll that's running.
- Posts already collected stay, and the feed page, categories and Manage keep working.

## Auto-scroll

**Auto-scroll: collect the last 7 days** (in the icon menu) scrolls your home feed for you until it has collected the past week.

- **Where it runs.** In your own Instagram tab, where you're already logged in. It reuses the current tab if it's Instagram; otherwise it opens the home feed in a new tab. It doesn't use a hidden browser, a separate login or any extra requests to Instagram.
- **Pace.** It scrolls one screen at a time and waits a few seconds between screens, sometimes longer, like someone reading.
- **Progress.** A purple box in the corner of the Instagram page shows how many new posts it has captured and how far back it has reached. Click **Stop** there to stop it.
- **It pauses** while the tab is in the background and continues when you come back to it.

It stops by itself when:
- 12 posts in a row from accounts you follow are older than 7 days (done)
- only suggested posts are left, because you're all caught up (done)
- you scroll, click or type on the page (you take over)
- Instagram limits requests or asks you to confirm your account, which can mean it suspects automation. Wait a while before running it again.
- the feed stops loading, or after 15 minutes or 800 new posts

The icon menu shows the result of the last run.

**Use it sparingly.** Instagram's terms don't allow automated collection, even of your own feed. Reading pace and the safety stops keep it close to normal browsing, but they can't guarantee Instagram won't notice. About once a day is plenty for a week of posts.

## Feed page

### Following, Suggested, Ads

Tabs at the top choose which posts the whole page shows, each with a count:
- **Following** (default): posts from accounts you follow
- **Suggested**: posts Instagram added from accounts you don't follow
- **Ads**: sponsored posts
- **All**: everything captured, matching the number in the icon menu

Categories and their counts follow the selected tab.

### Categories

- Each post gets a category (see How categories are chosen). Change it with the menu on the post's card, or set a whole account's category in Manage.
- **Events** lists posts that announce an event (see Events).
- **★ Saved** lists the posts you saved.

### Filters, in order

| Filter | What it does |
|---|---|
| **Type** | Photos, carousels, videos or reels |
| **Time** | When the post was published: Today, Yesterday, Last 7 days, or a Custom date range |
| **Place** | Any area, like "Taiwan", "Taipei", "Xinyi" or "Kyoto" (see Place search) |
| **Keywords** | Text in the caption or the account name |
| **Account** | One account's posts. Clicking an @name on a post does the same. |

All filters combine with the tab and category. For example: Following + Events + Last 7 days + Taipei.

### Post cards

- Each card shows the image, account, category menu and type, plus a summary box if the post is an event. Suggested posts and ads carry a "Suggested" or "Ad" label.
- It also shows the caption, the tagged place and when the post was published.
- **Open on Instagram** goes to the original post.
- **★** saves the post forever. Click it again to unsave.

## How categories are chosen

Each post gets its own category, so an account that posts food, travel and its dog can appear in all three.

### On-device AI sorting (recommended)

Turn it on with **Turn on** above the categories on the feed page, or in **Manage → Topics**. The first time, it downloads two AI models, about 270 MB, which Chrome then keeps. Everything runs on this computer; no posts, images or captions are sent anywhere.

For each post it combines three things:
1. **The picture.** CLIP, an image model, compares the picture with each topic's description.
2. **The caption.** A multilingual text model (E5) compares the caption, Instagram's image description and the place name with each topic's description, in English, Chinese or other languages.
3. **Your corrections.** Change a post's category with the menu on its card. Posts that look or read similarly, from any account, lean toward the category you picked. Setting an account's category in Manage teaches it the same way, with every post of that account.

When it isn't sure, a post goes to its account's usual topic if the account mostly posts about one thing, otherwise to its best guess.

### Topics

**Manage → Topics** lists the categories. There are 60 to start with, from Birds and Coffee & cafés to Film, Open calls, Life and Self help, and only the ones that have posts appear on the feed page. Add, rename or remove topics, and edit their descriptions. The AI matches each post against the topic's name and every phrase in its description, so list what the posts show or talk about, in any language, separated by commas. For example: `Birding` with `birds, bird watching, binoculars, 賞鳥, 鳥類`. Renaming a topic keeps your choices; removing one drops them. **Other** is always there.

### Without AI sorting

Without it, each account gets one category from counting topic words in all its posts' text, in English and Chinese. It also counts longer words that start with a topic word, like "photographers". Instagram's boilerplate at the start of image descriptions ("Photo by … on …") is ignored. Topics you add have no topic words, so they're only used with AI sorting or when you pick them.

**Chrome's built-in AI:** if Chrome's on-device AI is available, Manage also shows a **Sort accounts and read events with Chrome's on-device AI** button. It sorts whole accounts from their captions and reads event details.

**Your choice always wins:** a category you pick for a post beats one picked for its account, which beats the AI.

## Events

A post counts as an event when its caption has a date, or a day like "this Saturday" or 本週六, together with event words (concert, tickets, lineup, 演出, 票價, 售票…), a time, or a price.

Each event card shows a summary:
- 🗓 **Date and time**, for example "Oct 25 · 7pm", "2026年10月25日 晚上7點半", "11/8 (Sat) 14:00–17:00" or "this Saturday 10am–6pm"
- 📍 **Place**, from "Venue:", "地點：", a 📍 line, or the tagged place
- 🎤 **Performers**, from "Lineup:", "演出者：", "Featuring:" and @mentions
- 🎟 **Price and tickets**, for example NT$800, 600元起, Free entry, a ticket link, or "Link in bio"
- An **Upcoming** or **Past** label

The Events category lists upcoming events first, soonest at the top. Detection is pattern-based, so some events will be missed or wrongly flagged. The on-device AI button re-reads possible events for more accurate details.

## Place search

Type any area into the Place filter. Posts tagged anywhere inside it are shown.

- **Looking up places:** when the feed page opens, it looks up the district, city, region and country of each tagged place's map coordinates, in English. It does about one place per second, and each place is looked up once, then remembered.
- **Matching:** "Taiwan" finds posts in Taipei, Jiufen and Kaohsiung. "Taipei" finds Taipei City but not New Taipei. "Xinyi" finds Xinyi District.
- **Suggestions:** while you type, it suggests areas that have posts, with counts, plus matching areas from the map.
- **Before a place is looked up:** it's matched by the area's rectangle on the map instead.
- **Untagged posts:** posts without a tagged place can't be found by place, which is common for Reels.

## Manage

### Accounts you follow

- **The list:** every account you follow, with its post count, category, and why it got that category. Suggested accounts and ads are hidden, and a note says how many.
- **Collapsing:** click the heading to collapse the section. It stays collapsed next time.
- **Viewing an account:** click an account to open the feed with only its posts.

### Saving

- **Keep captured posts for:** 7 days, 30 days (default), 3 months, 1 year or Forever. Older posts are removed automatically, except ★ saved ones.
- **Save images on this computer** (on by default): Instagram's image links stop working after a few days, so the extension saves a copy of each image at about 640px wide. Videos keep only their cover image.
- **Space used:** shows the number of posts kept, ★ saved posts, saved images and disk space.
- **Export posts as JSON:** downloads everything, which is useful for testing topic-sorting accuracy (test #10).
- **Delete all posts except ★ saved:** clears the collection. Category choices are kept.

### Feasibility numbers

| Number | What it tells you |
|---|---|
| **Coverage** | Posts you scrolled past that were captured. Aim for 80% or more. |
| **Followed / suggested / ads** | How much of the feed comes from accounts you follow |
| **Types** | Whether photos, carousels, videos and reels all come through |
| **Captions and alt text** | How much text the sorting has to work with |
| **Look like events** | Share of posts detected as events |
| **Image link expiry** | How long Instagram's image links last |

## Known limits

- **Desktop only.** It runs in Chrome, Firefox and LibreWolf on a computer. Phones would need a port: Firefox for Android, or Safari on iPhone.
- **Never tested on real Instagram.** All features were tested with a fake Instagram feed. Instagram's internal data format isn't documented and can change at any time. If capture drops to 0, `parser.js` needs updating.
- **Who you follow.** The Following tab relies on Instagram marking which posts come from accounts you follow. If it doesn't, the extension shows all non-ad posts and says so in Manage.
- **Rough automatic sorting.** Categories from counting words are approximate. Use the on-device AI button, or fix accounts by hand.
- **Instagram's Terms.** They restrict automated collection. This prototype only reads what your own browser already received, for your own use. Check the policy (test #9) before sharing it with others.

## Files

| File | Role |
|---|---|
| `manifest.json` | Extension setup and permissions |
| `inject.js`, `content.js` | Read feed data on instagram.com |
| `parser.js` | Turn Instagram's data into posts |
| `background.js` | Store posts, save images, remove old posts |
| `store.js` | Saved images and settings |
| `classifier.js` | Categories |
| `events.js` | Event detection and summaries |
| `geo.js` | Place lookups |
| `shared.js` | Shared by the feed page and Manage |
| `viewer.html`, `viewer.js` | Feed page |
| `settings.html`, `settings.js` | Manage page |
| `popup.html`, `popup.js` | Icon menu |
| `styles.css` | Shared styles |
