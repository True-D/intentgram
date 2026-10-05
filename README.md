# Intently

Browse your Instagram feed by intent: by topic, place, time and account, instead of the algorithm's order.

![feed]([http://url/to/img.png](https://github.com/True-D/intentgram/blob/main/store-assets/screenshot-1-feed.png)

Intently is a browser extension prototype for Chrome, Firefox and LibreWolf. It collects the posts in your Instagram home feed and lets you browse them by topic, separate from the algorithm's order:

- **Friends, Creators & brands and Suggested tabs** keep your friends' posts apart from creators, brands and what Instagram mixes in. Ads stay hidden unless you turn them on.
- **AI sorting by picture and caption** puts each post in a topic. It runs on your computer and learns from the categories you correct.
- **Topics you define**, described in any language.
- **Auto-scroll** collects the last 7 days of your feed for you.
- **Filters** by time, place, keywords and account, plus event details and ★ saved posts.

The [extension README](extension/README.md) covers installing, using it and how it works.

## Try it in Chrome

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Open instagram.com and scroll your feed, then click the extension icon and choose **Open collected posts**.

## Try it in Firefox or LibreWolf

Needs Firefox 128 or newer.

1. Download or clone this repository, then run `./build-firefox.sh` in its folder. It makes `intently-firefox.xpi`.
2. **LibreWolf, to keep it installed:** type `about:config` in the address bar and accept the warning. Search for `xpinstall.signatures.required` and click the ⇌ toggle so it reads `false`. Then open `about:addons`, choose **Extensions**, click the gear icon, choose **Install Add-on From File…**, pick `intently-firefox.xpi` and click **Add**.
3. **Regular Firefox** ignores that setting and only installs signed add-ons. Load it for one session instead: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `dist/firefox/manifest.json`. It's removed when Firefox closes.
4. Open instagram.com. If the extension's icon menu shows **Allow access to Instagram**, click it.

After pulling new changes, run `./build-firefox.sh` again and reinstall the new `.xpi`.
