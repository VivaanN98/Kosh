import { parseCardText } from '../../src/domain/cards/ocrParse';
import { blurriness, preprocessForOcr } from '../../src/features/cards/scan/preprocess';
import type { CardNetwork, CardType } from '../../src/domain/types';
import type { Worker as TesseractWorker } from 'tesseract.js';

interface Truth {
  issuer: string;
  issuerText: string;
  network: CardNetwork;
  networkText: string;
  cardType: CardType;
  tier: string;
  number: string;
  colors: [string, string];
  ink: string;
}

const luhnComplete = (prefix: string) => {
  for (let x = 0; x < 10; x++) {
    const d = prefix + x;
    let s = 0;
    let b = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let v = Number(d[i]);
      if (b) {
        v *= 2;
        if (v > 9) v -= 9;
      }
      s += v;
      b = !b;
    }
    if (s % 10 === 0) return d;
  }
  throw new Error('unreachable');
};

const CARDS: Truth[] = [
  { issuer: 'State Bank of India', issuerText: 'STATE BANK OF INDIA', network: 'visa', networkText: 'VISA', cardType: 'debit', tier: 'GLOBAL INTERNATIONAL', number: luhnComplete('400012345678901'), colors: ['#1d3f8f', '#4f8be6'], ink: '#ffffff' },
  { issuer: 'Indian Bank', issuerText: 'INDIAN BANK', network: 'rupay', networkText: 'RuPay', cardType: 'debit', tier: 'PLATINUM', number: luhnComplete('607000123456781'), colors: ['#3a3f47', '#b8bec6'], ink: '#ffffff' },
  { issuer: 'HDFC Bank', issuerText: 'HDFC BANK', network: 'mastercard', networkText: 'mastercard', cardType: 'credit', tier: 'MILLENNIA', number: luhnComplete('552200001111222'), colors: ['#0b1d3a', '#24467f'], ink: '#f2f2f2' },
  { issuer: 'ICICI Bank', issuerText: 'ICICI Bank', network: 'visa', networkText: 'VISA', cardType: 'credit', tier: 'CORAL', number: luhnComplete('412345000099887'), colors: ['#7a1f1f', '#d8643f'], ink: '#ffffff' },
  { issuer: 'Axis Bank', issuerText: 'AXIS BANK', network: 'rupay', networkText: 'RuPay', cardType: 'debit', tier: 'SELECT', number: luhnComplete('652100776655443'), colors: ['#e9e4dc', '#c9c0b2'], ink: '#2b1d2a' },
  { issuer: 'Kotak Mahindra Bank', issuerText: 'kotak', network: 'mastercard', networkText: 'mastercard', cardType: 'prepaid', tier: 'TRAVEL', number: luhnComplete('510510105105101'), colors: ['#c8102e', '#e8505b'], ink: '#ffffff' },
];

type Condition = 'clean' | 'embossed' | 'glossy-blur' | 'angled-lowlight';
const CONDITIONS: Condition[] = ['clean', 'embossed', 'glossy-blur', 'angled-lowlight'];

function drawCard(t: Truth, cond: Condition): HTMLCanvasElement {
  const W = 1000;
  const H = 630;
  const card = document.createElement('canvas');
  card.width = W;
  card.height = H;
  const c = card.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.colors[0]);
  g.addColorStop(1, t.colors[1]);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, 0, W, H, 40);
  c.fill();
  c.fillStyle = t.ink;
  c.font = 'bold 52px Arial';
  c.fillText(t.issuerText, 60, 105);
  c.font = '600 30px Arial';
  c.fillText(t.tier, 60, 160);
  c.font = 'bold 30px Arial';
  c.textAlign = 'right';
  c.fillText(t.cardType.toUpperCase(), W - 60, 100);
  c.textAlign = 'left';
  c.fillStyle = '#d9b56a';
  c.fillRect(70, 230, 110, 82);
  const groups = t.number.match(/.{1,4}/g)!.join('  ');
  c.font = 'bold 64px "Courier New", monospace';
  if (cond === 'embossed') {
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillText(groups, 63, 413);
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillText(groups, 58, 408);
    c.fillStyle = 'rgba(200,200,200,0.85)';
    c.fillText(groups, 60, 410);
  } else {
    c.fillStyle = t.ink;
    c.fillText(groups, 60, 410);
  }
  c.font = '24px Arial';
  c.fillStyle = t.ink;
  c.fillText('VALID THRU 12/30', 60, 470);
  c.fillText('CARDHOLDER NAME', 60, 560);
  c.font = t.networkText === 'VISA' ? 'italic 900 78px Arial' : t.networkText === 'RuPay' ? 'italic 800 56px Arial' : '600 44px Arial';
  c.textAlign = 'right';
  c.fillText(t.networkText, W - 60, 570);
  c.textAlign = 'left';

  const photo = document.createElement('canvas');
  photo.width = 1100;
  photo.height = 730;
  const p = photo.getContext('2d')!;
  p.fillStyle = cond === 'angled-lowlight' ? '#2a2622' : '#5b544c';
  p.fillRect(0, 0, photo.width, photo.height);
  p.save();
  if (cond === 'glossy-blur') p.filter = 'blur(1.6px)';
  if (cond === 'angled-lowlight') {
    p.translate(550, 365);
    p.transform(1, 0.04, -0.06, 0.97, 0, 0);
    p.rotate((-4 * Math.PI) / 180);
    p.translate(-500, -315);
    p.filter = 'brightness(0.55) contrast(0.8)';
  } else {
    p.translate(50, 50);
  }
  p.drawImage(card, 0, 0);
  p.restore();
  if (cond === 'glossy-blur') {
    const glare = p.createRadialGradient(650, 300, 20, 650, 300, 330);
    glare.addColorStop(0, 'rgba(255,255,255,0.75)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    p.fillStyle = glare;
    p.fillRect(0, 0, photo.width, photo.height);
  }
  if (cond === 'angled-lowlight') {
    const img = p.getImageData(0, 0, photo.width, photo.height);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = ((seed / 2147483647) - 0.5) * 36;
      img.data[i]! += n;
      img.data[i + 1]! += n;
      img.data[i + 2]! += n;
    }
    p.putImageData(img, 0, 0);
  }
  return photo;
}

interface Engine {
  name: string;
  init: () => Promise<void>;
  run: (canvas: HTMLCanvasElement) => Promise<string[]>;
}

const tesseractEngine = (): Engine => {
  let worker: TesseractWorker;
  return {
    name: 'tesseract.js 7 (eng best_int)',
    async init() {
      const T = await import('tesseract.js');
      worker = await T.createWorker('eng', 1, {
        workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
        corePath: '/node_modules/tesseract.js-core',
        langPath: '/node_modules/@tesseract.js-data/eng/4.0.0_best_int',
        gzip: true,
      });
    },
    async run(canvas) {
      const { data } = await worker.recognize(canvas);
      return data.text.split('\n');
    },
  };
};

const tesseractPreEngine = (): Engine => {
  let worker: TesseractWorker;
  return {
    name: 'tesseract 2-pass (plain, then contrast/invert if fields missing)',
    async init() {
      const T = await import('tesseract.js');
      worker = await T.createWorker('eng', 1, {
        workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
        corePath: '/node_modules/tesseract.js-core',
        langPath: '/node_modules/@tesseract.js-data/eng/4.0.0_best_int',
        gzip: true,
      });
    },
    async run(canvas) {
      const first = (await worker.recognize(canvas)).data.text.split(/\r?\n/);
      const p = parseCardText(first);
      if (p.issuer && p.network && p.cardType && p.last4 && p.uncertain.length === 0) return first;
      const second = (await worker.recognize(preprocessForOcr(canvas))).data.text.split(/\r?\n/);
      return [...first, ...second];
    },
  };
};

const paddleEngine = (): Engine => {
  let ocr: { detect: (src: string) => Promise<{ text: string }[]> };
  return {
    name: 'PaddleOCR PP-OCRv4 (@gutenye/ocr-browser + onnxruntime-web)',
    async init() {
      const ortName = 'onnxruntime-web';
      const ort = (await import(/* @vite-ignore */ ortName)) as { env: { wasm: { wasmPaths: string } } };
      ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/';
      const paddleName = '@gutenye/ocr-browser';
      const { default: Ocr } = (await import(/* @vite-ignore */ paddleName)) as { default: { create: (o: unknown) => Promise<unknown> } };
      ocr = (await Ocr.create({
        models: {
          detectionPath: '/node_modules/@gutenye/ocr-models/assets/ch_PP-OCRv4_det_infer.onnx',
          recognitionPath: '/node_modules/@gutenye/ocr-models/assets/ch_PP-OCRv4_rec_infer.onnx',
          dictionaryPath: '/node_modules/@gutenye/ocr-models/assets/ppocr_keys_v1.txt',
        },
      })) as unknown as typeof ocr;
    },
    async run(canvas) {
      const lines = (await ocr.detect(canvas.toDataURL('image/png'))) as unknown;
      (window as unknown as { __PADDLE_RAW__: unknown }).__PADDLE_RAW__ = JSON.stringify(lines).slice(0, 600);
      type Box = { text: string; box: [number, number][] };
      const texts: Box[] = ((lines as { texts?: Box[] }).texts ?? []).slice();
      const cy = (b: Box) => (b.box[0]![1] + b.box[2]![1]) / 2;
      const hh = (b: Box) => Math.abs(b.box[2]![1] - b.box[0]![1]);
      texts.sort((a, b) => cy(a) - cy(b));
      const rows: Box[][] = [];
      for (const t of texts) {
        const row = rows.find((r) => Math.abs(cy(r[0]!) - cy(t)) < hh(t) / 2);
        if (row) row.push(t);
        else rows.push([t]);
      }
      return rows.map((r) => r.sort((a, b) => a.box[0]![0] - b.box[0]![0]).map((b) => b.text).join(' '));
    },
  };
};

const ocradEngine = (): Engine => ({
  name: 'ocrad.js',
  async init() {},
  async run(canvas) {
    const fn = (window as unknown as { OCRAD: (c: HTMLCanvasElement) => string }).OCRAD;
    return fn(canvas).split('\n');
  },
});

async function main() {
  const status = document.getElementById('status')!;
  const gallery = document.getElementById('gallery')!;
  const samples = CARDS.flatMap((t) => CONDITIONS.map((cond) => ({ t, cond, canvas: drawCard(t, cond) })));
  for (const s of samples.slice(0, 8)) {
    const img = new Image();
    img.src = s.canvas.toDataURL('image/jpeg', 0.7);
    img.width = 220;
    gallery.appendChild(img);
  }
  const only = new URLSearchParams(location.search).get('engine');
  const engines = [tesseractEngine(), tesseractPreEngine(), paddleEngine(), ocradEngine()].filter((e) => !only || e.name.toLowerCase().startsWith(only));
  const results = [];
  for (const engine of engines) {
    status.textContent = `init ${engine.name}`;
    const t0 = performance.now();
    try {
      await engine.init();
    } catch (err) {
      results.push({ engine: engine.name, error: String(err) });
      continue;
    }
    const initMs = performance.now() - t0;
    const rows = [];
    for (const s of samples) {
      status.textContent = `${engine.name}: ${s.t.issuer} / ${s.cond}`;
      const r0 = performance.now();
      let lines: string[];
      try {
        lines = await engine.run(s.canvas);
      } catch {
        lines = [];
      }
      const ms = performance.now() - r0;
      const parsed = parseCardText(lines);
      rows.push({
        card: s.t.issuer,
        cond: s.cond,
        blur: Math.round(blurriness(s.canvas) * 1000) / 1000,
        ms: Math.round(ms),
        issuer: parsed.issuer === s.t.issuer,
        network: parsed.network === s.t.network,
        cardType: parsed.cardType === s.t.cardType,
        last4: parsed.last4 === s.t.number.slice(-4),
        sample: rows.length === 0 ? lines.slice(0, 12) : undefined,
        flaggedWrong: (['issuer', 'network', 'cardType', 'last4'] as const).filter((f) => {
          const ok = f === 'issuer' ? parsed.issuer === s.t.issuer : f === 'network' ? parsed.network === s.t.network : f === 'cardType' ? parsed.cardType === s.t.cardType : parsed.last4 === s.t.number.slice(-4);
          const value = f === 'issuer' ? parsed.issuer : f === 'network' ? parsed.network : f === 'cardType' ? parsed.cardType : parsed.last4;
          return !ok && value !== null && !parsed.uncertain.includes(f);
        }),
      });
    }
    results.push({ engine: engine.name, initMs: Math.round(initMs), rows });
  }
  const bytes = performance
    .getEntriesByType('resource')
    .map((e) => e as PerformanceResourceTiming)
    .reduce<Record<string, number>>((acc, e) => {
      const key = /tesseract|eng\.traineddata/.test(e.name) ? 'tesseract' : /onnx|ort-|ocr-models|ppocr/.test(e.name) ? 'paddle' : /ocrad/.test(e.name) ? 'ocrad' : 'other';
      acc[key] = (acc[key] ?? 0) + (e.encodedBodySize || e.transferSize || 0);
      return acc;
    }, {});
  (window as unknown as { __OCR_RESULTS__: unknown }).__OCR_RESULTS__ = { results, bytes };
  status.textContent = 'done';
}

void main();
