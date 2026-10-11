import { inpaint, maskFromRects, sensitiveRects, STANDARD_SENSITIVE_ZONES, type FaceWord, type Rect } from '@/domain/cards/faceMask';

const FACE_WIDTH = 640;
const MAX_ROUNDS = 2;

type Reader = (canvas: HTMLCanvasElement) => Promise<FaceWord[]>;

function erase(canvas: HTMLCanvasElement, words: readonly FaceWord[], extra: readonly Rect[] = []): boolean {
  const rects = [...extra, ...sensitiveRects(words)];
  if (rects.length === 0) return false;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  inpaint(img.data, canvas.width, canvas.height, maskFromRects(rects, canvas.width, canvas.height));
  ctx.putImageData(img, 0, 0);
  return true;
}

const hasDigits = (words: readonly FaceWord[]) => words.some((w) => /\d/.test(w.text));

export async function cleanCardFace(card: HTMLCanvasElement, words: readonly FaceWord[], read: Reader): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = FACE_WIDTH;
  c.height = Math.round(FACE_WIDTH / 1.586);
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(card, 0, 0, c.width, c.height);
    erase(c, words, STANDARD_SENSITIVE_ZONES);
    let clean = false;
    for (let round = 0; round < MAX_ROUNDS && !clean; round++) {
      const found = await read(c);
      clean = !hasDigits(found);
      if (!clean) erase(c, found);
    }
    if (!clean && hasDigits(await read(c))) return null;
    return await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.88));
  } finally {
    c.width = 0;
  }
}
