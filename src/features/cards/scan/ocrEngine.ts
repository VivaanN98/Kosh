/**
 * On-device OCR (tesseract.js, self-hosted under /ocr). Loaded only when the user chooses Scan.
 * Images never leave the device: recognition runs in a Web Worker in this browser.
 */
import type { Worker } from 'tesseract.js';
import type { WordBox } from './artworkFromImage';

let workerPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  workerPromise ??= (async () => {
    const T = await import('tesseract.js');
    const worker = await T.createWorker('eng', T.OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr',
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status.startsWith('loading')) onProgress?.(m.progress);
      },
    });
    return worker;
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Start downloading the engine early (e.g. while the camera warms up). */
export function warmUpOcr(onProgress?: (p: number) => void) {
  void getWorker(onProgress).catch(() => undefined);
}

export interface OcrResult {
  lines: string[];
  words: WordBox[];
}

/** Rejects if the engine cannot load or read within the limit (slow network, missing assets). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('OCR timed out')), ms))]);
}

export async function recognizeCard(card: HTMLCanvasElement, timeoutMs = 60_000): Promise<OcrResult> {
  const worker = await withTimeout(getWorker(), timeoutMs).catch((err) => {
    workerPromise = null;
    throw err;
  });
  // Evaluation showed raw frames read better than contrast/inverted ones (scripts/ocr-eval), and
  // enlarging small crops lost words ("DEBIT") in testing, so the frame is read as captured.
  try {
    const { data } = await withTimeout(worker.recognize(card, {}, { text: true, blocks: true }), timeoutMs);
    // Boxes are in the recognised image's pixels; normalise by that same image.
    const W = card.width;
    const H = card.height;
    const words: WordBox[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const w of line.words) words.push({ text: w.text, x0: w.bbox.x0 / W, y0: w.bbox.y0 / H, x1: w.bbox.x1 / W, y1: w.bbox.y1 / H, confidence: w.confidence });
        }
      }
    }
    return { lines: data.text.split('\n'), words };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    // Free the worker's memory if no further scans happen soon.
    idleTimer = setTimeout(() => {
      void workerPromise?.then((w) => w.terminate());
      workerPromise = null;
    }, 60_000);
  }
}
