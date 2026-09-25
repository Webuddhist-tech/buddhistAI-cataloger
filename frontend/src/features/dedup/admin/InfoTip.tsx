import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const WIDTH = 240;
const MARGIN = 8;

/**
 * A small ⓘ that explains a label: shows on hover, and on tap for touch screens.
 * Drawn on top of the page (not inside it), so tables and screen edges never clip it.
 */
export default function InfoTip({ text }: Readonly<{ text: string }>) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);

  const show = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    setPos({ top: r.bottom + 6, left });
  }, []);
  const hide = useCallback(() => {
    pinned.current = false;
    setPos(null);
  }, []);

  useEffect(() => {
    if (!pos) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (!button.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos, hide]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={() => !pinned.current && setPos(null)}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (pinned.current) hide();
          else {
            pinned.current = true;
            show();
          }
        }}
        className="inline-flex shrink-0 cursor-pointer rounded-full p-0.5 align-middle text-gray-400 hover:text-gray-700"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: Math.min(WIDTH, window.innerWidth - 2 * MARGIN) }}
            className="pointer-events-none fixed z-[100] rounded-md bg-gray-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
