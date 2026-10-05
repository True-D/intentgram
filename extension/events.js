// Spots event posts and pulls out date, time, place, performers, price and tickets
// from the caption. Plain pattern matching (English + Chinese), runs locally.
const IntentgramEvents = (() => {
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const WD = '(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?,?\\s+)?';
  const ORD = '(?:st|nd|rd|th)?';

  const KEYWORDS = [
    'event', 'concert', 'gig', 'live', 'festival', 'fest', 'ticket', 'tickets', 'lineup', 'line-up', 'performance',
    'performing', 'exhibition', 'exhibit', 'workshop', 'meetup', 'talk', 'screening', 'premiere', 'opening', 'party',
    'market', 'fair', 'tour', 'rsvp', 'doors', 'admission', 'register', 'registration', 'save the date', 'join us', 'show',
    '活動', '演出', '演唱會', '音樂會', '表演', '展覽', '市集', '講座', '工作坊', '售票', '購票', '門票', '票價', '報名',
    '開幕', '派對', '音樂節', '巡演', '見面會', '放映', '首映', '免費入場', '演唱', '展期', 'free entry', 'free admission',
  ];
  const KW_RE = new RegExp(KEYWORDS.map((k) => /^[a-z -]+$/.test(k) ? `\\b${k}\\b` : k).join('|'), 'gi');

  const uniq = (a) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];
  const all = (re, text) => [...text.matchAll(re)];

  function findDates(t) {
    const out = [];
    for (const m of all(new RegExp(`\\b${WD}${MON}\\.?\\s+(\\d{1,2})${ORD}(?:\\s*[-–~]\\s*\\d{1,2}${ORD})?(?:,?\\s+(\\d{4}))?`, 'gi'), t))
      out.push({ text: m[0], month: MONTHS[m[1].slice(0, 3).toLowerCase()], day: +m[2], year: m[3] && +m[3], at: m.index });
    for (const m of all(new RegExp(`\\b${WD}(\\d{1,2})${ORD}(?:\\s*[-–~]\\s*\\d{1,2}${ORD})?\\s+${MON}\\b\\.?(?:,?\\s+(\\d{4}))?`, 'gi'), t))
      out.push({ text: m[0], month: MONTHS[m[2].slice(0, 3).toLowerCase()], day: +m[1], year: m[3] && +m[3], at: m.index });
    for (const m of all(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号](?:\s*[(（][一二三四五六日天][)）])?/g, t))
      out.push({ text: m[0], month: +m[2] - 1, day: +m[3], year: m[1] && +m[1], at: m.index });
    for (const m of all(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/g, t))
      out.push({ text: m[0], month: +m[2] - 1, day: +m[3], year: +m[1], at: m.index });
    // 10/12 or 10/12(六): month/day, unless the first number can't be a month.
    for (const m of all(/(?<![\d/.$])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])(?:\s*[(（][一二三四五六日天a-z]{1,3}[)）])?/gi, t)) {
      let [a, b] = [+m[1], +m[2]];
      if (a > 12) [a, b] = [b, a];
      const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
      out.push({ text: m[0], month: a - 1, day: b, year, at: m.index });
    }
    return out.filter((d) => d.month >= 0 && d.month < 12 && d.day >= 1 && d.day <= 31)
      .sort((x, y) => x.at - y.at)
      .filter((d, i, arr) => !arr.some((o, j) => j < i && d.at >= o.at && d.at < o.at + o.text.length));
  }

  // "this Saturday", "tonight", "本週六": a date without a calendar day.
  function findRelative(t) {
    const re = /\b(?:tonight|tomorrow|this (?:weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)day)|next (?:weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)day)|every (?:(?:mon|tues|wednes|thurs|fri|satur|sun)day))\b(?:\s*(?:&|and)\s*(?:mon|tues|wednes|thurs|fri|satur|sun)day)?|今晚|今天|明天|明晚|後天|這週[一二三四五六日末]|本週[一二三四五六日末]|週末|下週[一二三四五六日]/gi;
    return uniq(all(re, t).map((m) => m[0]));
  }

  function findTimes(t) {
    const out = [];
    for (const m of all(/\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–~]\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi, t)) {
      let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12;
      out.push({ text: m[0], h, min: +(m[2] || 0), at: m.index });
    }
    for (const m of all(/(?<![\d:/.])([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–~]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?(?!\s*(?:am|pm|[\d]))/gi, t))
      out.push({ text: m[0], h: +m[1], min: +m[2], at: m.index });
    for (const m of all(/(上午|下午|晚上|中午|早上|傍晚)?\s*(\d{1,2})\s*[點点時时](?:\s*(\d{1,2})\s*分|(半))?/g, t)) {
      let h = +m[2]; if (/下午|晚上|傍晚/.test(m[1] || '') && h < 12) h += 12;
      out.push({ text: m[0].trim(), h, min: m[4] ? 30 : +(m[3] || 0), at: m.index });
    }
    return out.filter((x) => x.h <= 24).sort((a, b) => a.at - b.at)
      .filter((d, i, arr) => !arr.some((o, j) => j < i && d.at >= o.at && d.at < o.at + o.text.length));
  }

  function findPrices(t) {
    const out = [];
    for (const m of all(/(?:NT\$|NTD|TWD|HK\$|US\$|A\$|C\$|S\$|\$|€|£|¥|₩)\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*[-–~\/]\s*\$?\d[\d,]*)?/gi, t)) out.push(m[0]);
    for (const m of all(/\d[\d,]*(?:\.\d{1,2})?\s?(?:元起?|(?:NTD|TWD|USD|EUR|GBP|JPY|HKD|dollars|euros)\b)/gi, t)) out.push(m[0]);
    for (const m of all(/(?:tickets?|票價|門票|price|admission|entry|入場費?)\s*[:：]\s*(\d[\d,]*(?:\s*[-–~\/]\s*\d[\d,]*)?)/gi, t)) out.push(m[1]);
    for (const m of all(/\bfree\s+(?:entry|admission|entrance|of charge|event)\b|(?:admission|entry|tickets?)\s*[:：]?\s*free\b|免費(?:入場|參加|參觀)?|入場免費/gi, t)) out.push(m[0]);
    return uniq(out).filter((p, i, arr) => !arr.some((o, j) => j !== i && o.length > p.length && o.includes(p)));
  }

  const LABEL = (words) => new RegExp(`(?:^|\\n|\\b)(?:${words})\\s*[:：]\\s*([^\\n]{2,120})`, 'gi');

  function findPerformers(t, author) {
    const out = [];
    for (const m of all(LABEL('line\\s?-?up|featuring|feat\\.|ft\\.|performers?|artists?|with|speakers?|hosted by|演出者?|表演者?|演出嘉賓|嘉賓|卡司|主講人?|講者|樂團'), t))
      out.push(...m[1].split(/\s*(?:,|、|\/|＆|&|\band\b|\||•)\s*/i));
    for (const m of all(/@([A-Za-z0-9._]{2,30})/g, t)) {
      const h = m[1].replace(/\.$/, '');
      if (h.toLowerCase() !== String(author || '').toLowerCase()) out.push('@' + h);
    }
    return uniq(out).slice(0, 8);
  }

  function findVenue(t, post) {
    const m = LABEL('venue|location|place|where|address|地點|場地|地址|會場|地址').exec(t) || /📍\s*([^\n]{2,100})/.exec(t);
    return (m && m[1].trim()) || post.location || null;
  }

  function findTickets(t) {
    if (!/ticket|購票|售票|報名|rsvp|register|registration|門票/i.test(t)) return null;
    const url = /https?:\/\/[^\s)]+|\b[a-z0-9-]+\.(?:com|tw|org|net|io|co|me|ly)\/[^\s)]*/i.exec(t);
    if (url) return url[0];
    if (/link in (?:our |my )?bio|連結在(?:主頁|首頁|bio)|主頁連結|見bio/i.test(t)) return 'Link in bio';
    return 'See caption';
  }

  // Best guess of when the event starts, for sorting and "upcoming" / "past".
  function eventTime(dates, times, postedAt) {
    if (!dates.length) return null;
    const d = dates[0];
    const posted = postedAt ? new Date(postedAt) : new Date();
    let year = d.year || posted.getFullYear();
    const t = times[0];
    let when = new Date(year, d.month, d.day, t ? t.h : 0, t ? t.min : 0).getTime();
    // "Jan 5" in a December post means next year.
    if (!d.year && when < posted.getTime() - 60 * 864e5) when = new Date(year + 1, d.month, d.day, t ? t.h : 0, t ? t.min : 0).getTime();
    return when;
  }

  function extract(post) {
    const t = post.caption || '';
    if (t.length < 10) return null;
    const kw = (t.match(KW_RE) || []).length;
    const dates = findDates(t), times = findTimes(t), prices = findPrices(t), relative = findRelative(t);
    const hasDate = dates.length > 0 || relative.length > 0;
    const isEvent = (hasDate && (kw >= 1 || times.length > 0 || prices.length > 0)) ||
      (kw >= 2 && (times.length > 0 || prices.length > 0));
    if (!isEvent) return null;
    return {
      date: uniq([...dates.map((d) => d.text), ...relative]).slice(0, 3).join(' · ') || null,
      time: uniq(times.map((x) => x.text)).slice(0, 2).join(' · ') || null,
      startsAt: eventTime(dates, times, post.takenAt),
      venue: findVenue(t, post),
      performers: findPerformers(t, post.author),
      price: prices.slice(0, 3).join(' · ') || null,
      tickets: findTickets(t),
      source: 'patterns',
    };
  }

  // A post worth a second look by the on-device AI (has some event signal).
  const maybeEvent = (post) => !!post.caption &&
    ((post.caption.match(KW_RE) || []).length > 0 || findDates(post.caption).length > 0 || findRelative(post.caption).length > 0);

  let session = null;
  async function aiExtract(post) {
    if (!session) {
      session = await LanguageModel.create({ initialPrompts: [{ role: 'system', content:
        'You read Instagram captions. Decide if the post announces or promotes a specific event (concert, show, exhibition, market, workshop, talk, party, festival...) and extract its details exactly as written. Use empty strings or [] when a detail is not in the caption.' }] });
    }
    const s = await session.clone();
    try {
      const out = await s.prompt(`Account @${post.author}. Tagged place: ${post.location || 'none'}. Posted ${new Date(post.takenAt || Date.now()).toDateString()}.\nCaption:\n${post.caption.slice(0, 1500)}`, {
        responseConstraint: { type: 'object', required: ['isEvent'], properties: {
          isEvent: { type: 'boolean' }, date: { type: 'string' }, time: { type: 'string' }, venue: { type: 'string' },
          performers: { type: 'array', items: { type: 'string' } }, price: { type: 'string' }, tickets: { type: 'string' } } },
      });
      return JSON.parse(out);
    } finally { s.destroy(); }
  }

  // Pattern result, corrected by the AI's answer when there is one.
  function merge(pattern, ai, post) {
    if (!ai) return pattern;
    if (!ai.isEvent) return null;
    const base = pattern || { startsAt: null, performers: [], venue: post.location || null };
    const pick = (a, b) => (a && String(a).trim()) || b || null;
    return { ...base, date: pick(ai.date, base.date), time: pick(ai.time, base.time), venue: pick(ai.venue, base.venue),
      performers: ai.performers && ai.performers.length ? ai.performers : base.performers,
      price: pick(ai.price, base.price), tickets: pick(ai.tickets, base.tickets), source: 'ai' };
  }

  return { extract, maybeEvent, aiExtract, merge };
})();
