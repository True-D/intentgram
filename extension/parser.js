// Finds post objects anywhere inside an Instagram JSON payload and normalizes them.
// Handles both the private v1 shape (image_versions2, media_type) and the older
// GraphQL shape (shortcode, display_url, edge_media_to_caption).
const IntentgramParser = (() => {
  const TYPE = { 1: 'photo', 2: 'video', 8: 'carousel' };

  function parseText(text) {
    const clean = text.replace(/^for\s*\(;;\);/, '').trim();
    try { return [JSON.parse(clean)]; } catch (_) {}
    // Some responses are several JSON documents separated by newlines.
    const docs = [];
    for (const line of clean.split('\n')) {
      try { docs.push(JSON.parse(line)); } catch (_) {}
    }
    return docs;
  }

  function isMedia(n) {
    if (typeof n.code === 'string' && (n.user || n.owner) &&
        (n.image_versions2 || n.carousel_media || n.video_versions)) return true;
    if (typeof n.shortcode === 'string' && n.owner && (n.display_url || n.thumbnail_src)) return true;
    return false;
  }

  // The size closest to 640px wide: big enough for a card, small enough to keep.
  function thumbCandidate(c) {
    if (!Array.isArray(c) || !c.length) return null;
    return [...c].sort((a, b) => Math.abs((a.width || 0) - 640) - Math.abs((b.width || 0) - 640))[0].url || null;
  }

  function bestCandidate(c) {
    if (!Array.isArray(c) || !c.length) return null;
    return [...c].sort((a, b) => (b.width || 0) - (a.width || 0))[0].url || null;
  }

  // Instagram CDN URLs carry an expiry as hex unix seconds in the `oe` parameter.
  function urlExpiry(url) {
    if (!url) return null;
    try {
      const oe = new URL(url).searchParams.get('oe');
      return oe ? parseInt(oe, 16) * 1000 : null;
    } catch (_) { return null; }
  }

  function normalize(n) {
    const user = n.user || n.owner || {};
    const code = n.code || n.shortcode;
    let type = TYPE[n.media_type] ||
      (n.__typename === 'GraphSidecar' || n.__typename === 'XDTGraphSidecar' ? 'carousel'
        : n.is_video ? 'video' : 'photo');
    if (n.product_type === 'clips') type = 'reel';

    const firstSlide = n.carousel_media && n.carousel_media[0];
    const image = bestCandidate(n.image_versions2 && n.image_versions2.candidates) ||
      bestCandidate(firstSlide && firstSlide.image_versions2 && firstSlide.image_versions2.candidates) ||
      n.display_url || n.thumbnail_src || null;
    const thumb = thumbCandidate(n.image_versions2 && n.image_versions2.candidates) ||
      thumbCandidate(firstSlide && firstSlide.image_versions2 && firstSlide.image_versions2.candidates) ||
      n.thumbnail_src || image;
    const video = (n.video_versions && n.video_versions[0] && n.video_versions[0].url) || n.video_url || null;

    const caption = (n.caption && n.caption.text) ||
      (n.edge_media_to_caption && n.edge_media_to_caption.edges &&
        n.edge_media_to_caption.edges[0] && n.edge_media_to_caption.edges[0].node.text) || '';

    const following = user.friendship_status && typeof user.friendship_status.following === 'boolean'
      ? user.friendship_status.following : null;

    return {
      id: String(n.pk || n.id || code),
      code,
      permalink: `https://www.instagram.com/${type === 'reel' ? 'reel' : 'p'}/${code}/`,
      author: user.username || null,
      authorFullName: user.full_name || null,
      following,
      type,
      slides: n.carousel_media_count || (n.carousel_media && n.carousel_media.length) ||
        (n.edge_sidecar_to_children && n.edge_sidecar_to_children.edges.length) || 1,
      caption,
      altText: n.accessibility_caption || null,
      location: (n.location && n.location.name) || null,
      place: n.location ? {
        id: n.location.pk ? String(n.location.pk) : n.location.id ? String(n.location.id) : null,
        name: n.location.name || null,
        city: n.location.city || null,
        address: n.location.address || null,
        lat: typeof n.location.lat === 'number' ? n.location.lat : null,
        lng: typeof n.location.lng === 'number' ? n.location.lng : null,
      } : null,
      takenAt: (n.taken_at || n.taken_at_timestamp || 0) * 1000 || null,
      image,
      thumb,
      video,
      mediaExpiresAt: urlExpiry(image),
      isAd: !!(n.ad_id || n.injected || n.ad_action || n.is_ad),
      isPaidPartnership: !!n.is_paid_partnership,
      likeCount: n.like_count ?? (n.edge_media_preview_like && n.edge_media_preview_like.count) ?? null,
      commentCount: n.comment_count ?? null,
    };
  }

  function extractPosts(root) {
    const out = [];
    const seen = new Set();
    const stack = [[root, 0]];
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 60) continue;
      if (Array.isArray(node)) { for (const v of node) stack.push([v, depth + 1]); continue; }
      if (isMedia(node)) {
        const p = normalize(node);
        if (p.code && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
        continue; // carousel children are part of this post, not separate posts
      }
      for (const k in node) stack.push([node[k], depth + 1]);
    }
    return out;
  }

  function extractFromText(text) {
    return parseText(text).flatMap(extractPosts);
  }

  return { extractFromText, extractPosts, urlExpiry };
})();
if (typeof module !== 'undefined') module.exports = IntentgramParser;
