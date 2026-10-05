# Intentgram — Chrome extension prototype (v0.5.3)

Intentgram lets you browse your Instagram feed by intent: by topic, place, time or account instead of the algorithm's order. This prototype is a Chrome extension. It collects the posts in your home feed as you scroll, sorts them into categories, and lets you filter, save and review them on your own computer.

It's also a feasibility test. It answers tests #1b, #2, #4, #5 and #11 in `../feasibility-tests.md`.

## How it works

- **Capture.** It reads the feed data instagram.com already downloads for itself: the first batch built into the page, plus each new batch as you scroll. It makes no extra requests to Instagram.
- **Storage.** Posts, settings and saved images stay in the extension's storage on this computer.
- **What leaves your computer.** Only place lookups (see Place search) go to Photon, a free OpenStreetMap service. They send map coordinates and the place you type, never posts or account names.
- **Capturing needs scrolling.** It only sees posts Instagram has loaded, so scroll your home feed to collect more.

## Install

1. Unzip `intentgram-feed-probe.zip`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Pin it: click the puzzle-piece icon, then pin **Intentgram Feed Probe**.

**Updating:** unzip the new version over the old folder, then click the reload icon on the extension in `chrome://extensions`. If a version adds new permissions, remove the extension and load it again instead.

## Using it

1. Open https://www.instagram.com/ while logged in and scroll your home feed. The badge on the icon counts captured posts.
2. Click the icon, then **Open collected posts** to open the feed page.
3. Click **Manage** (top right of the feed page, or in the icon menu) for accounts, saving options and test numbers.

## Feed page

### Categories

- Each account gets one category, and all its posts appear under it. You can change an account's category in Manage.
- **Events** lists posts that announce an event (see Events).
- **★ Saved** lists the posts you saved.
- Category counts follow the Source filter, so with the default they count only followed content.

### Filters, in order

| Filter | What it does |
|---|---|
| **Type** | Photos, carousels, videos or reels |
| **Time** | When the post was published: Today, Yesterday, Last 7 days, or a Custom date range |
| **Place** | Any area, like "Taiwan", "Taipei", "Xinyi" or "Kyoto" (see Place search) |
| **Keywords** | Text in the caption or the account name |
| **Source** | **Followed content** (default), All sources, Suggested, or Ads |
| **Account** | One account's posts. Clicking an @name on a post does the same. |

All filters combine. For example: Events + Last 7 days + Taipei.

### Post cards

- Each card shows the image, account, category and type, plus a summary box if the post is an event.
- It also shows the caption, the tagged place and when the post was published.
- **Open on Instagram** goes to the original post.
- **★** saves the post forever. Click it again to unsave.

## How categories are chosen

1. For each account, the extension combines the text of all its captured posts: captions, hashtags, Instagram's image description, the place name and the username.
2. It counts topic words for each category, in English and Chinese. For example, Photography counts photography, photographer, photoshoot, camera, lens, portrait, 35mm, 攝影, 相機 and more. Longer words that start with a topic word also count, like "photographers".
3. The account goes to the category with the highest score. If no topic words appear, it goes to **Other**. Manage shows the scores in the "Why" column.

The boilerplate at the start of Instagram's image descriptions ("Photo by … on …", "May be an image of") is ignored, so it doesn't count toward any category.

**Better sorting with AI:** if Chrome's built-in on-device AI is available on your computer, Manage shows a **Sort accounts and read events with Chrome's on-device AI** button. It reads the posts instead of counting words, runs entirely on your computer and costs nothing. The first run may need to download Chrome's model.

**Fixing a category:** pick a different one in Manage. Your choice always wins over the automatic one.

Categories: Wildlife, Pets, Nature, Travel, Dance, Music, Architecture, Food, Fashion, Fitness, Sports, Art, Photography, Tech, Humor, News, Other.

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

- **Desktop Chrome only.** Android (Firefox) and iPhone (Safari) would need a port.
- **Never tested on real Instagram.** All features were tested with a fake Instagram feed. Instagram's internal data format isn't documented and can change at any time. If capture drops to 0, `parser.js` needs updating.
- **Who you follow.** "Followed content" relies on Instagram marking which posts come from accounts you follow. If it doesn't, the extension shows all non-ad posts and says so in Manage.
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
