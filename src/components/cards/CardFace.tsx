/**
 * A payment card rendered from its scanned face picture (number, expiry and name already removed,
 * stored on this device only) or, without one, from its sanitized artwork template. No numbers
 * beyond the optional last four. Used by every wallet variant and the Add Card preview.
 */
import { memo, type CSSProperties } from 'react';
import type { CardArtwork, CardNetwork, CardType } from '@/domain/types';
import { useCardFace } from '@/data/cardFaces';
import { NetworkMark } from './NetworkMark';

export interface CardFaceData {
  /** A saved card's id: its stored face picture is shown when this device has one. */
  id?: string;
  /** Explicit face picture URL (Add Card preview); null forces the template. */
  face?: string | null;
  issuer: string;
  displayName: string | null;
  network: CardNetwork;
  cardType: CardType;
  last4: string | null;
  artwork: CardArtwork;
}

function background(a: CardArtwork): string {
  const [c0, c1, c2 = c1] = a.colors;
  switch (a.template) {
    case 'solid':
      return `linear-gradient(180deg, color-mix(in srgb, ${c0} 88%, white) 0%, ${c0} 55%, color-mix(in srgb, ${c0} 82%, black) 100%)`;
    case 'metal':
      return `linear-gradient(118deg, ${c0} 0%, ${c1} 38%, ${c2} 52%, ${c1} 66%, ${c0} 100%)`;
    case 'mesh':
      return `radial-gradient(120% 90% at 0% 0%, ${c1} 0%, transparent 55%), radial-gradient(90% 90% at 100% 100%, ${c2} 0%, transparent 60%), ${c0}`;
    case 'gradient':
    default:
      return `linear-gradient(135deg, ${c0} 0%, ${c1} 60%, ${c2} 100%)`;
  }
}

function Pattern({ kind, tone }: { kind: CardArtwork['pattern']; tone: 'light' | 'dark' }) {
  if (kind === 'none') return null;
  const stroke = tone === 'light' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)';
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
      {kind === 'waves' &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M-10 ${120 + i * 16} C 80 ${80 + i * 16}, 200 ${170 + i * 16}, 350 ${100 + i * 16}`} fill="none" stroke={stroke} strokeWidth="1.2" />
        ))}
      {kind === 'arcs' && [40, 70, 100, 130, 160].map((r) => <circle key={r} cx="300" cy="200" r={r} fill="none" stroke={stroke} strokeWidth="1.2" />)}
      {kind === 'grid' && (
        <>
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="214" stroke={stroke} strokeWidth="0.8" />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 30} x2="340" y2={i * 30} stroke={stroke} strokeWidth="0.8" />
          ))}
        </>
      )}
      {kind === 'dots' &&
        Array.from({ length: 70 }, (_, i) => <circle key={i} cx={(i % 14) * 25 + 12} cy={Math.floor(i / 14) * 25 + 110} r="1.6" fill={stroke} />)}
    </svg>
  );
}

function Chip({ style }: { style: 'gold' | 'silver' }) {
  const [a, b] = style === 'gold' ? ['#f3d58e', '#b98a3e'] : ['#eef0f3', '#9aa1ab'];
  return (
    <svg width="42" height="32" viewBox="0 0 42 32" aria-hidden="true">
      <defs>
        <linearGradient id={`chip-${style}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="41" height="31" rx="6" fill={`url(#chip-${style})`} stroke="rgba(0,0,0,0.25)" />
      <path d="M14 1v30M28 1v30M1 11h13M28 11h13M1 21h13M28 21h13M14 16h14" stroke="rgba(0,0,0,0.28)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function Contactless({ color }: { color: string }) {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7.5a5 5 0 0 1 0 7" />
      <path d="M8 4.5a10 10 0 0 1 0 13" />
      <path d="M12 1.8a14 14 0 0 1 0 18.4" />
    </svg>
  );
}

export const CardFace = memo(function CardFace({
  card,
  className = '',
  style,
  compact = false,
}: {
  card: CardFaceData;
  className?: string;
  style?: CSSProperties;
  /** Hide secondary text (stacked/peeking states). */
  compact?: boolean;
}) {
  const stored = useCardFace(card.face === undefined ? card.id : undefined);
  const face = card.face === undefined ? stored : card.face;
  const a = card.artwork;
  const light = a.textTone === 'light';
  const ink = light ? '#ffffff' : '#14161a';
  const soft = light ? 'rgba(255,255,255,0.72)' : 'rgba(20,22,26,0.66)';
  if (face) {
    return (
      <div
        className={`relative aspect-[1.586] w-full select-none overflow-hidden rounded-[18px] ${className}`}
        style={{
          background: `center / cover no-repeat url("${face}"), ${background(a)}`,
          boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 0 0 1px rgba(0,0,0,0.18) inset, 0 18px 40px -18px rgba(0,0,0,0.55)',
          ...style,
        }}
        data-testid="card-face-photo"
      >
        {card.last4 && !compact && (
          <p
            className="num absolute bottom-[7%] left-[6.5%] text-[13px] tracking-[0.18em]"
            style={{ color: ink, textShadow: light ? '0 1px 3px rgba(0,0,0,0.55)' : '0 1px 3px rgba(255,255,255,0.6)' }}
            aria-label={`ending ${card.last4}`}
          >
            •••• {card.last4}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-[1.586] w-full select-none overflow-hidden rounded-[18px] [container-type:inline-size] ${className}`}
      style={{
        background: background(a),
        color: ink,
        boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 0 0 1px rgba(0,0,0,0.18) inset, 0 18px 40px -18px rgba(0,0,0,0.55)',
        ...style,
      }}
    >
      {a.template === 'metal' && (
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 3px)' }}
          aria-hidden="true"
        />
      )}
      <Pattern kind={a.pattern} tone={a.textTone} />
      {a.finish === 'gloss' && (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 32%, transparent 48%)' }} aria-hidden="true" />
      )}

      <div className="absolute inset-0 flex flex-col p-[6.5%]">
        <div className={`flex items-start ${a.issuerPosition === 'top-right' ? 'flex-row-reverse' : ''} justify-between gap-3`}>
          <span className="truncate text-[clamp(11px,3.6cqw,14px)] font-semibold uppercase tracking-[0.12em]" style={{ color: ink }}>
            {card.issuer}
          </span>
          {a.networkPosition === 'top-right' && <NetworkMark network={card.network} tone={a.textTone} height={22} />}
          {a.networkPosition !== 'top-right' && <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: soft }}>{card.cardType}</span>}
        </div>

        {!compact && (
          <div className={`mt-[9%] flex items-center gap-3 ${a.chip === 'right' ? 'flex-row-reverse justify-start' : ''}`}>
            {a.chip !== 'none' && <Chip style={a.chipStyle} />}
            {a.contactless && <Contactless color={soft} />}
          </div>
        )}

        <div className={`mt-auto flex items-end gap-3 ${a.networkPosition === 'bottom-left' ? 'flex-row-reverse' : ''} justify-between`}>
          <div className="min-w-0">
            {card.last4 && (
              <p className="num mb-1 text-[13px] tracking-[0.18em]" style={{ color: soft }} aria-label={`ending ${card.last4}`}>
                •••• {card.last4}
              </p>
            )}
            <p className="truncate text-[14px] font-medium" style={{ color: ink }}>
              {card.displayName ?? card.issuer}
            </p>
          </div>
          {a.networkPosition !== 'top-right' && (
            <span className="shrink-0">
              <NetworkMark network={card.network} tone={a.textTone} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
