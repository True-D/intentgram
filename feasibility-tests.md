# Intently — Feasibility Test Checklist

Based on `spec.md`. Researched 2026-10-03. Ordered by risk: if a test near the top fails, the ones below it may not matter yet.

## The core risk, up front

Instagram's official APIs **do not expose a user's home feed** (posts from accounts they follow), and they don't expose the list of accounts a user follows either.

- **Basic Display API** (the old "connect your personal account" API) was shut down in December 2024.
- **Instagram API with Instagram Login** only returns the logged-in professional account's *own* media.
- **Business Discovery** (Instagram API with Facebook Login) can fetch public posts of *other* accounts by username, but only Business/Creator accounts, it needs the caller to be a professional account linked to a Facebook Page, and it requires Meta app review (`instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`).
- **Scraping / the private mobile API** violates Instagram's Terms, risks the user's account being locked, and can be blocked at any time.

So test #1 is not "can I call the API" but "which data path can actually produce the followed-accounts feed".

---

## P0 — Data access (decides if the idea works as specced)

1. **Pick and prove one data path.** Try each candidate against a real test account and record what you get:
   - a. **Business Discovery**: user types/imports the accounts they follow, you fetch each one's recent posts. Test: what % of a real person's follows are Business/Creator accounts (personal accounts return nothing).
   - b. **Browser extension / web overlay**: reorganize the feed the user already loads on instagram.com in their own browser. Test: can you read post data (image, caption, author, link) from the loaded page reliably, and how much breaks after an Instagram front-end update.
   - c. **Data export (Download Your Information)**: test whether it gives the following list (it does) and whether that's enough to seed path (a).
   - d. **Unofficial/private API or scraping**: only test to understand it; treat as not shippable.
2. **Coverage**: for one real account, compare "posts in the real feed in the last 48h" vs "posts your path retrieved". Target a number (e.g. ≥80%).
3. **Freshness**: how quickly new posts appear via your path (polling delay).
4. **Content types**: confirm you get photos, carousels (all slides), videos and Reels (thumbnail + caption at minimum), and permalinks for "open original".
5. **Media URLs**: test whether image/video URLs expire (Instagram CDN URLs are signed and time-limited) and whether you may cache/re-host them.

## P1 — Platform rules and access (decides if you can launch)

6. **Meta app review**: build a dev app, request the permissions your path needs, and check what review demands (screencast, privacy policy, business verification). Test-users work before review; real users don't.
7. **Account-type friction**: Business Discovery requires the *user* to switch to a professional account and link a Facebook Page. Test whether a normal user would accept that during onboarding.
8. **Rate limits**: measure calls needed per user per refresh (≈1 call per followed account). With ~200 follows and the Graph API's per-user/app call budget (~200 calls/hour per user under platform rate limiting), check whether a refresh fits.
9. **Terms / policy check**: read Meta Platform Terms + Instagram Terms for your path, especially rules on building alternative clients, caching content, and using content for AI processing. Get a one-paragraph written conclusion before building more.

## P2 — AI classification (decides if the core value is good)

10. **Topic accuracy**: take ~200 real posts from your own feed, hand-label topics, run the classifier (image + caption), measure accuracy. Specifically test the spec's use case: "wildlife" precision/recall.
11. **Captionless / video posts**: accuracy when the caption is empty, emoji-only, non-English, or the post is a video (classify from thumbnail/frames?).
12. **Auto-generated categories**: does clustering produce ~5–10 sensible topics for one real feed, and are they stable between refreshes (no renaming chaos)?
13. **User corrections**: test that rename/merge/move actually changes future classification (few-shot examples or per-user rules).
14. **Summary quality**: "Curated" summaries are short, accurate, and don't invent facts; check on 30 posts.
15. **Cost & latency**: AI cost per post and per user per day, and time from fetch to dashboard ready. Set a ceiling (e.g. cents/user/day).

## P3 — Product and UX

16. **Dashboard counts**: "32 new" is correct (de-duplication, "seen" state).
17. **Read view**: full caption, carousel, video playback or clean fallback to "open in Instagram".
18. **Deep links**: "open original" opens the Instagram app on mobile and the web on desktop.
19. **User value test**: give 3–5 people a clickable prototype using their own (or a mock) feed and see if they'd use it instead of the app's feed.

## P4 — Data handling

20. **Token lifecycle**: long-lived token refresh (60 days), revoked access, password change.
21. **Privacy**: what you store (posts, images, AI labels), retention, and a working data-deletion callback (required by Meta).

---

## Recommended starting path (decided 2026-10-03)

Start with a **desktop Chrome extension**, since it's free and fastest to test. Phone comes later, and the same extension code can be reused there:
- Firefox for Android runs extensions on instagram.com, and publishing is free.
- On iOS, Safari web extensions can do the same, but they have to ship inside an App Store app, which needs a $99/yr Apple developer account.

First tests for the extension: P0 #1b, #2, #4 and #5, then P2 #10 and #15. The only cost while testing is the AI calls.

## Who pays for AI (decided 2026-10-03)

The app builder doesn't pay for AI. Plan:
- **Default: on-device AI, free.** Sort posts into topics with Chrome's built-in model (Gemini Nano, available to extensions through the Prompt API) or a small open model such as CLIP running in the extension through transformers.js. On phones, use Apple Foundation Models (iOS) or Gemini Nano (Android).
- **Optional: the user brings their own AI** for better summaries. They either paste their own API key (Anthropic / OpenAI / Google), stored locally, or log in with OpenRouter, which uses the user's OpenRouter credit.
- **Not possible:** logging in with a Claude.ai Pro/Max subscription. Third-party apps can't use consumer plans, and the API is billed separately.

Extra tests this adds:
- On-device topic accuracy vs a cloud model on the same ~200 hand-labeled posts (extends #10).
- On-device speed and memory per post, especially on a mid-range laptop and phone.
- Whether Chrome's built-in model is available on the user's machine (it needs supported hardware and a model download).

## Assumptions

- Intently is meant for normal personal accounts, as the spec says ("connect personal Instagram account"). That's exactly the case the official API no longer supports, which is why P0 dominates.
- Web or mobile app is undecided; a browser-extension path only works on desktop web.

## Sources

- [Business Discovery reference (Meta)](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery)
- [Instagram Official APIs reference, April 2026](https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42)
- [Basic Display API deprecation and replacements](https://www.keyapi.ai/blog/instagram-basic-display-api/)
- [Instagram API options in 2026](https://zernio.com/blog/instagram-api)
