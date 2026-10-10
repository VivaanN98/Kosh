# OCR evaluation (card scanning)

Card scanning reads the issuer, network, type and last four digits on the device. To pick the
engine, `scripts/ocr-eval` generates **24 synthetic, fictional cards**: 6 designs × 4 capture
conditions (clean print, embossed digits, glossy glare + blur, angled + low light + noise). Each
uses a fictional Luhn-valid number; no real card data. Every engine's output goes through the same
production parser (`src/domain/cards/ocrParse.ts`). Re-run with `npm run ocr:eval` (install the
optional engines first to compare them again).

Results, desktop Chromium (raw data in `docs/ocr-evaluation-*.json`):

| Engine | Issuer | Network | Type | Last 4 | All four | Wrong and not flagged | Time/card | First-scan download |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **tesseract.js 7** (eng best_int), chosen | 96% | 83% | 83% | 63% | 63% | 0 | ~0.31 s | ~7 MB |
| PaddleOCR PP-OCRv4 (onnxruntime-web) | 88% | 100% | 100% | 100% | 88% | 0 | ~1.3 s | ~30–45 MB |
| ocrad.js | 13% | 13% | 13% | 4% | 4% | n/a | 0.07 s | 1.2 MB |

**Why tesseract.js:** PaddleOCR reads more, but a 30–45 MB first download and roughly 4× slower
reads are unreasonable on a phone. Its package also didn't build with this toolchain without
patching an installed dependency. Tesseract's misses are safe: every wrong value was either left
empty or flagged "please confirm", and the review step requires confirming uncertain fields.

Two experiments made Tesseract worse and were dropped: contrast-stretch/invert preprocessing with
sparse-text mode (all four: 50%), and a two-pass union of both (no gain, slower).

**Blur check:** a contrast-weighted Crete blur score at capture resolution flags clearly blurry
photos (`BLUR_MAX = 0.28`), offering Retake or "Use this photo". It is calibrated on synthetic
images only and may need tuning on real devices.

**Honest limits:**
- Embossed digits, foil and glossy finishes on real cards read worse than these synthetic images.
- Network and type are often printed as logos rather than text. Network then comes from the
  number's prefix when the number was read.
- Everything uncertain must be confirmed or corrected by you before saving.
