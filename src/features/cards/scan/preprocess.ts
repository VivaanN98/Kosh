/**
 * On-device image preparation for OCR. Works on a canvas the caller owns and wipes afterwards.
 * Grayscale → percentile contrast stretch → invert to dark text on light → (optional) upscale.
 */
export function preprocessForOcr(source: HTMLCanvasElement, targetWidth = 1400): HTMLCanvasElement {
  const scale = targetWidth / source.width;
  const out = document.createElement('canvas');
  out.width = Math.round(source.width * scale);
  out.height = Math.round(source.height * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
    gray[j] = g;
    hist[gray[j]!]!++;
  }
  const total = gray.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v++) if ((acc += hist[v]!) > total * 0.02) { lo = v; break; }
  for (let acc = 0, v = 255; v >= 0; v--) if ((acc += hist[v]!) > total * 0.02) { hi = v; break; }
  const range = Math.max(1, hi - lo);
  let sum = 0;
  for (let j = 0; j < gray.length; j++) sum += gray[j]!;
  // Card text is usually lighter than the card: invert so text ends up dark on light.
  const invert = sum / gray.length < 128;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((gray[j]! - lo) * 255) / range;
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Blurriness in [0, 1] (higher = blurrier), after Crete et al., "The blur effect: perception and
 * estimation with a new no-reference perceptual blur metric" (2007). The image is re-blurred with a
 * 9-px box filter; a sharp image loses much of its neighbour-to-neighbour variation, a blurry one
 * hardly changes. Largely independent of how much is printed on the card or how bright it is.
 */
export function blurriness(source: HTMLCanvasElement): number {
  const w = 320;
  const h = Math.round((source.height / source.width) * w);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  c.width = 0;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
  const k = 9;
  const half = Math.floor(k / 2);
  const bh = new Float32Array(w * h);
  const bv = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sh = 0;
      let sv = 0;
      for (let t = -half; t <= half; t++) {
        sh += g[y * w + Math.min(w - 1, Math.max(0, x + t))]!;
        sv += g[Math.min(h - 1, Math.max(0, y + t)) * w + x]!;
      }
      bh[y * w + x] = sh / k;
      bv[y * w + x] = sv / k;
    }
  }
  let sFh = 0;
  let sVh = 0;
  let sFv = 0;
  let sVv = 0;
  for (let y = 1; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const i = y * w + x;
      const dFh = Math.abs(g[i]! - g[i - 1]!);
      const dFv = Math.abs(g[i]! - g[i - w]!);
      const dBh = Math.abs(bh[i]! - bh[i - 1]!);
      const dBv = Math.abs(bv[i]! - bv[i - w]!);
      sFh += dFh;
      sFv += dFv;
      sVh += Math.max(0, dFh - dBh);
      sVv += Math.max(0, dFv - dBv);
    }
  }
  // Weight each direction by how much detail it has (a striped card has none along the stripes).
  const total = sFh + sFv;
  return total > 0 ? (sFh - sVh + (sFv - sVv)) / total : 1;
}
