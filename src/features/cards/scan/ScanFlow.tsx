import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button, Spinner } from '@/components/ui/Button';
import { useReducedMotion } from '@/motion/useMotion';
import { parseCardText, type UncertainField } from '@/domain/cards/ocrParse';
import { DEFAULT_ARTWORK, textToneFor } from '@/domain/cards/artwork';
import type { PaymentCard } from '@/domain/types';
import { CardForm, type CardDraft } from '../CardForm';
import { artworkFromImage } from './artworkFromImage';
import { cleanCardFace } from './cardFaceImage';
import { blurriness } from './preprocess';

type Phase = 'starting' | 'live' | 'blurry' | 'reading' | 'review';

const BLUR_MAX = 0.28;

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'Camera access was blocked. You can allow it in your browser settings later — for now, enter the card details below.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device. Enter the card details below.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy in another app. Close it and try again, or enter the details below.';
  }
  return 'The camera could not start. Enter the card details below.';
}

export default function ScanFlow({
  onDone,
  onFallback,
}: {
  onDone: (card: PaymentCard | null) => void;
  onFallback: (reason: string, draft?: CardDraft) => void;
}) {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [review, setReview] = useState<{ draft: CardDraft; uncertain: UncertainField[] } | null>(null);
  const fallbackRef = useRef(onFallback);
  useEffect(() => {
    fallbackRef.current = onFallback;
  }, [onFallback]);
  const fallback = useCallback((reason: string, draft?: CardDraft) => fallbackRef.current(reason, draft), []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const session = useRef<{ promise: Promise<MediaStream | null>; active: boolean; attached: boolean } | null>(null);
  useEffect(() => {
    if (!session.current) {
      const request = async (): Promise<MediaStream | null> => {
        if (!window.isSecureContext) {
          fallback('Camera access needs a secure (https) connection. Open Kosh over https, or enter the details below.');
          return null;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          fallback('This browser can’t use the camera here. Enter the card details below.');
          return null;
        }
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      };
      session.current = { promise: request(), active: true, attached: false };
    }
    const s = session.current;
    s.active = true;
    s.promise.then(
      async (stream) => {
        if (!stream) return;
        if (!s.active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (s.attached) return;
        s.attached = true;
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setPhase('live');
        void import('./ocrEngine').then((m) => m.warmUpOcr());
      },
      (err) => {
        if (s.active) fallback(cameraErrorMessage(err));
      },
    );
    return () => {
      s.active = false;
      setTimeout(() => {
        if (!s.active) {
          stopCamera();
          void s.promise.then((stream) => stream?.getTracks().forEach((t) => t.stop())).catch(() => undefined);
          if (session.current === s) session.current = null;
        }
      }, 0);
    };
  }, [fallback, stopCamera]);

  const grabFrame = (): HTMLCanvasElement | null => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth) return null;
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
    const offX = (video.videoWidth * scale - vr.width) / 2;
    const offY = (video.videoHeight * scale - vr.height) / 2;
    const sx = (fr.left - vr.left + offX) / scale;
    const sy = (fr.top - vr.top + offY) / scale;
    const sw = fr.width / scale;
    const sh = fr.height / scale;
    const canvas = document.createElement('canvas');
    const outW = Math.round(Math.min(sw, 1600));
    canvas.width = outW;
    canvas.height = Math.round(outW / 1.586);
    canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const pendingRef = useRef<HTMLCanvasElement | null>(null);
  const capture = async () => {
    const canvas = grabFrame();
    if (!canvas) return;
    if (blurriness(canvas) > BLUR_MAX) {
      if (pendingRef.current) pendingRef.current.width = 0;
      pendingRef.current = canvas;
      setPhase('blurry');
      return;
    }
    stopCamera();
    setPhase('reading');
    await read(canvas);
  };
  const acceptBlurry = async () => {
    const canvas = pendingRef.current;
    pendingRef.current = null;
    if (!canvas) return;
    stopCamera();
    setPhase('reading');
    await read(canvas);
  };
  const retake = () => {
    if (pendingRef.current) pendingRef.current.width = 0;
    pendingRef.current = null;
    setPhase('live');
  };

  const read = async (canvas: HTMLCanvasElement) => {
    let artwork = { ...DEFAULT_ARTWORK };
    let face: Blob | null = null;
    try {
      const { recognizeCard } = await import('./ocrEngine');
      let ocr: Awaited<ReturnType<typeof recognizeCard>> | null = await recognizeCard(canvas);
      artwork = artworkFromImage(canvas, ocr.words);
      face = await cleanCardFace(canvas, ocr.words, async (c) => (await recognizeCard(c)).words).catch(() => null);
      const parsed = parseCardText(ocr.lines);
      ocr = null;
      const draft: CardDraft = {
        issuer: parsed.issuer ?? '',
        network: parsed.network ?? 'visa',
        cardType: parsed.cardType ?? 'debit',
        displayName: parsed.displayName ?? '',
        last4: parsed.last4 ?? '',
        accountId: '',
        artwork: { ...artwork, textTone: textToneFor(artwork.colors.filter(Boolean) as string[]) },
        face,
      };
      if (!parsed.issuer && !parsed.network && !parsed.cardType && !parsed.last4) {
        fallback('We couldn’t read any text on that card (embossed or glossy cards are hard). We kept its look — please fill in the details.', draft);
        return;
      }
      setReview({ draft, uncertain: parsed.uncertain });
      setPhase('review');
    } catch {
      fallback('Reading the card failed on this device. Please enter the details — we kept the card’s colours if we could.', { ...emptyDraft(), artwork, face });
    } finally {
      canvas.width = 0;
    }
  };

  if (phase === 'review' && review) {
    return (
      <div>
        <p className="mb-4 flex items-start gap-2 rounded-[12px] bg-mint-soft px-3 py-2 text-[13px]" data-testid="scan-review-note">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-positive" aria-hidden="true" />
          Read on this device. The number, expiry and name were removed from the picture — check it and each field before saving.
        </p>
        <CardForm source="scan" initial={review.draft} uncertain={review.uncertain} onDone={onDone} />
      </div>
    );
  }

  return (
    <div className="pb-2" data-testid="scan-flow">
      <div className="relative mx-auto aspect-[3/4] max-h-[60dvh] w-full overflow-hidden rounded-[22px] bg-black sm:aspect-[4/3]">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted aria-label="Camera preview" data-testid="scan-video" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div ref={frameRef} className="relative aspect-[1.586] w-[86%] rounded-[18px]" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
              <span
                key={k}
                className="absolute h-7 w-7 border-white"
                style={{
                  top: k[0] === 't' ? -2 : undefined,
                  bottom: k[0] === 'b' ? -2 : undefined,
                  left: k[1] === 'l' ? -2 : undefined,
                  right: k[1] === 'r' ? -2 : undefined,
                  borderTopWidth: k[0] === 't' ? 3 : 0,
                  borderBottomWidth: k[0] === 'b' ? 3 : 0,
                  borderLeftWidth: k[1] === 'l' ? 3 : 0,
                  borderRightWidth: k[1] === 'r' ? 3 : 0,
                  borderTopLeftRadius: k === 'tl' ? 18 : 0,
                  borderTopRightRadius: k === 'tr' ? 18 : 0,
                  borderBottomLeftRadius: k === 'bl' ? 18 : 0,
                  borderBottomRightRadius: k === 'br' ? 18 : 0,
                }}
                aria-hidden="true"
              />
            ))}
            {phase === 'live' && !reduced && (
              <m.span
                className="absolute inset-x-3 top-0 h-[2px] rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, var(--mint), transparent)', boxShadow: '0 0 12px var(--mint)' }}
                animate={{ y: ['0%', '5800%', '0%'] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
        {(phase === 'starting' || phase === 'reading') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white" role="status">
            <Spinner size={24} />
            <p className="text-[14px]">{phase === 'starting' ? 'Starting camera…' : 'Reading the card on this device…'}</p>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[13px] text-text-2" aria-live="polite">
        {phase === 'blurry'
          ? 'That photo looks blurry. Hold the phone steady, fill the frame and avoid glare.'
          : 'Fit the card inside the frame, on a dark surface, without glare.'}
      </p>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        {phase === 'blurry' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="lg" icon={<RotateCcw size={18} />} onClick={retake} data-testid="scan-retake">
              Retake
            </Button>
            <Button size="lg" onClick={() => void acceptBlurry()} data-testid="scan-use-anyway">
              Use this photo
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" icon={<Camera size={18} />} disabled={phase !== 'live'} onClick={() => void capture()} data-testid="scan-capture">
            Capture
          </Button>
        )}
        <Button
          size="lg"
          icon={<Keyboard size={18} />}
          onClick={() => {
            if (pendingRef.current) pendingRef.current.width = 0;
            pendingRef.current = null;
            stopCamera();
            fallback(phase === 'blurry' ? 'No problem — enter the details instead.' : 'Scan cancelled — enter the details instead.');
          }}
          data-testid="scan-manual"
        >
          Manual
        </Button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[12px] text-text-3">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Processed only on this device. Only the card’s design is kept, on this device — the full number, CVV and expiry are never saved or sent anywhere.
      </p>
    </div>
  );
}

function emptyDraft(): CardDraft {
  return { issuer: '', network: 'visa', cardType: 'debit', displayName: '', last4: '', accountId: '', artwork: { ...DEFAULT_ARTWORK } };
}
