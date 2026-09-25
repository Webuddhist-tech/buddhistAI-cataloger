import { useCallback, useEffect, useRef } from 'react';
import { addActiveTime } from '../api/review';

// Counts only while the pair is on screen, the tab is in front, and there was mouse,
// keyboard, scroll or touch activity in the last few minutes (long full-text reading
// included). Each visit's time is sent and added up on the server.
//
// A pair that was already answered when the visit began only gets the visit's time if
// the visit ends with a new answer (`commit`); rereading it and leaving adds nothing.
const IDLE_AFTER_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const FLUSH_EVERY_MS = 60 * 1000;
const ACTIVITY = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

export function useActiveTimer(itemId: number | undefined, enabled: boolean, alreadyAnswered: boolean) {
  const counted = useRef(0);
  const lastActivity = useRef(Date.now());
  // Fixed for the visit: answering during the visit does not change how it is counted.
  const holdForAnswer = useRef(false);

  const send = useCallback(
    (keepalive: boolean) => {
      const seconds = Math.floor(counted.current / 1000);
      if (!itemId || seconds < 1) return;
      counted.current -= seconds * 1000;
      addActiveTime(itemId, Math.min(seconds, 3600), keepalive).catch(() => {
        counted.current += seconds * 1000; // try again with the next send
      });
    },
    [itemId],
  );

  // Leaving, tab hidden, or the one-minute save.
  const flush = useCallback(
    (keepalive = false) => {
      if (!holdForAnswer.current) send(keepalive);
    },
    [send],
  );

  /** Call when the annotator saves an answer: this visit's time always counts then. */
  const commit = useCallback(() => {
    send(false);
    holdForAnswer.current = false;
  }, [send]);

  useEffect(() => {
    if (!enabled || !itemId) return;
    counted.current = 0;
    lastActivity.current = Date.now();
    holdForAnswer.current = alreadyAnswered;

    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { capture: true, passive: true }));

    const tick = window.setInterval(() => {
      const inUse =
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        Date.now() - lastActivity.current < IDLE_AFTER_MS;
      if (inUse) counted.current += TICK_MS;
    }, TICK_MS);
    const periodic = window.setInterval(() => flush(), FLUSH_EVERY_MS);

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      window.clearInterval(tick);
      window.clearInterval(periodic);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true); // leaving this pair (next / previous / back); dropped if held
      counted.current = 0;
    };
    // alreadyAnswered is read once per visit on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, itemId, flush]);

  return { flush, commit };
}
