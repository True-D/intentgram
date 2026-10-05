// Runs the on-device models in a background thread so pages stay responsive.
// CLIP turns pictures (and short English topic descriptions) into vectors in one
// shared space; multilingual E5 does the same for captions in any language.
// Models download from Hugging Face once, then load from the browser cache.
import {
  env, pipeline, AutoTokenizer, AutoProcessor, RawImage,
  CLIPTextModelWithProjection, CLIPVisionModelWithProjection,
} from './lib/transformers.min.js';

const CLIP = 'Xenova/clip-vit-base-patch32';
const E5 = 'Xenova/multilingual-e5-small';

env.allowLocalModels = false;
// By default the library copies its engine file into a blob: URL and imports that,
// which Chrome's extension rules block. The engine is bundled here, so load it directly.
env.useWasmCache = false;
const wasm = env.backends.onnx.wasm;
wasm.wasmPaths = {
  mjs: new URL('lib/ort-wasm-simd-threaded.asyncify.mjs', self.location.href).href,
  wasm: new URL('lib/ort-wasm-simd-threaded.asyncify.wasm', self.location.href).href,
};
wasm.numThreads = 1; // extension pages aren't cross-origin isolated, so no threads

// Download progress, summed over all model files.
const files = new Map();
function progress(p) {
  if (p.status !== 'progress' && p.status !== 'done') return;
  files.set(p.file + p.name, { loaded: p.loaded || p.total || 0, total: p.total || 0 });
  let loaded = 0, total = 0;
  for (const f of files.values()) { loaded += f.loaded; total += f.total; }
  postMessage({ type: 'download', loaded, total });
}
const opts = { dtype: 'q8', device: 'wasm', progress_callback: progress };

let clip = null, e5 = null;
const loadClip = () => clip || (clip = Promise.all([
  AutoTokenizer.from_pretrained(CLIP, opts),
  AutoProcessor.from_pretrained(CLIP, opts),
  CLIPTextModelWithProjection.from_pretrained(CLIP, opts),
  CLIPVisionModelWithProjection.from_pretrained(CLIP, opts),
]).then(([tokenizer, processor, text, vision]) => ({ tokenizer, processor, text, vision })));
const loadE5 = () => e5 || (e5 = pipeline('feature-extraction', E5, opts));

function unit(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
const rows = (t) => { const [n, d] = t.dims; return Array.from({ length: n }, (_, i) => unit(t.data.subarray(i * d, (i + 1) * d))); };

async function clipText(texts) {
  const m = await loadClip();
  const { text_embeds } = await m.text(m.tokenizer(texts, { padding: true, truncation: true }));
  return rows(text_embeds);
}

async function clipImage(blob) {
  const m = await loadClip();
  const { image_embeds } = await m.vision(await m.processor(await RawImage.fromBlob(blob)));
  return rows(image_embeds)[0];
}

async function e5Text(texts) {
  const out = await (await loadE5())(texts.map((t) => 'query: ' + t), { pooling: 'mean', normalize: true });
  return rows(out);
}

const jobs = {
  // topics: [{ img: [English phrases], txt: [phrases, any language] }]
  //   -> per topic, a list of image-space and a list of text-space vectors
  async topics({ topics }) {
    const img = [], txt = [];
    for (const t of topics) {
      img.push(await clipText(t.img.map((p) => `a photo of ${p}`)));
      txt.push(await e5Text(t.txt));
    }
    return { img, txt };
  },
  // items: [{ id, blob, text }] -> [{ id, img, txt }]; either vector may be null
  async embed({ items }) {
    const out = [];
    for (const it of items) {
      let img = null;
      if (it.blob) { try { img = await clipImage(it.blob); } catch (e) { console.warn('[intentgram] image', it.id, e); } }
      out.push({ id: it.id, img, txt: null });
    }
    const withText = items.map((it, i) => [i, it.text]).filter(([, t]) => t && t.trim());
    if (withText.length) {
      const vs = await e5Text(withText.map(([, t]) => t.slice(0, 2000)));
      withText.forEach(([i], k) => { out[i].txt = vs[k]; });
    }
    return out;
  },
};

onmessage = async (e) => {
  const { id, type } = e.data;
  try { postMessage({ id, ok: true, result: await jobs[type](e.data) }); }
  catch (err) { postMessage({ id, ok: false, error: String((err && err.message) || err) }); }
};
