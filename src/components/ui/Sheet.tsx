import { AnimatePresence, m, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { springs } from '@/motion/springs';
import { project } from '@/motion/gesture';
import { useMediaQuery } from '@/lib/useMediaQuery';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  initialFocus?: string;
  testId?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet(props: SheetProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence>{props.open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>, document.body);
}

function SheetPanel({ onClose, title, hideTitle, children, footer, width = 480, initialFocus, testId }: SheetProps) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useDragControls();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const wanted = initialFocus ? panel?.querySelector<HTMLElement>(initialFocus) : null;
    const target = wanted && !(wanted as HTMLButtonElement).disabled ? wanted : panel;
    target?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose, initialFocus]);

  const y = useMotionValue(0);
  const scrimOpacity = useTransform(y, (v) => (typeof v === 'number' ? Math.max(0.15, 1 - Math.max(0, v) / 480) : 1));

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    if (info.offset.y + project(info.velocity.y, 0.99) > 140) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" data-testid={testId}>
      <m.div className="absolute inset-0" style={{ opacity: scrimOpacity }} aria-hidden="true">
        <m.div
          className="absolute inset-0"
          style={{ background: 'var(--overlay)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        />
      </m.div>
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass glass-strong relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] shadow-3 outline-none md:max-h-[86dvh] md:rounded-[28px]"
        style={{ maxWidth: desktop ? width : undefined, touchAction: dragging ? 'none' : undefined, y }}
        initial={desktop ? { opacity: 0, scale: 0.96, y: 12 } : { opacity: 0.6, y: '100%' }}
        animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, y: 0 }}
        exit={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { opacity: 0.6, y: '100%' }}
        transition={springs.sheet}
        drag={desktop ? false : 'y'}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={onDragEnd}
      >
        <div
          className="relative shrink-0 cursor-grab touch-none px-5 pt-2.5 active:cursor-grabbing md:cursor-default md:pt-5"
          onPointerDown={(e) => !desktop && drag.start(e)}
        >
          <div className="mx-auto mb-2 h-[5px] w-10 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <h2 id={titleId} className={hideTitle ? 'sr-only' : 'text-[17px] font-semibold tracking-[-0.01em]'}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="tap -mr-2 ml-auto inline-flex items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <X size={20} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="shrink-0 px-5 pb-[calc(16px+var(--safe-bottom))] pt-2">{footer}</div>}
        {!footer && <div className="h-[var(--safe-bottom)] shrink-0" />}
      </m.div>
    </div>
  );
}
