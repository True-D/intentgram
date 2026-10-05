# Bundled libraries

Chrome extensions can't load code from the internet, so these files are included here.

- `transformers.min.js`: [Transformers.js](https://github.com/huggingface/transformers.js) 4.3.0 by Hugging Face, Apache-2.0 (see `LICENSE-transformers.txt`).
- `ort-wasm-simd-threaded.asyncify.mjs` and `.wasm`: [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.31.0-dev.20260914-8d85527a0 by Microsoft, MIT.

The AI models themselves aren't bundled. They download from Hugging Face the first time AI sorting runs: `Xenova/clip-vit-base-patch32` (MIT) and `Xenova/multilingual-e5-small` (MIT).
