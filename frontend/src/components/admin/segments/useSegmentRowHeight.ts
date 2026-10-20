import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicRowHeight } from 'react-window';

/** Attribute react-window puts on each row element with its row index. */
const ROW_INDEX_ATTRIBUTE = 'data-react-window-index';

/**
 * Like react-window's `useDynamicRowHeight`, but remembers measured heights by row id instead
 * of row index. A split, merge, or a row leaving a status filter shifts the indexes of the rows
 * after it; keyed by id, every row keeps its own height and the list does not jump.
 */
export function useSegmentRowHeight(rowIds: readonly string[]): DynamicRowHeight {
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  // The resize observer outlives renders; it must resolve indexes against the current rows.
  const rowIdsRef = useRef(rowIds);
  rowIdsRef.current = rowIds;

  const setRowHeight = useCallback((index: number, size: number) => {
    const id = rowIdsRef.current[index];
    if (id === undefined) return;
    setHeights((prev) => {
      if (prev.get(id) === size) return prev;
      const next = new Map(prev);
      next.set(id, size);
      return next;
    });
  }, []);

  const [observer] = useState(
    () =>
      new ResizeObserver((entries) => {
        for (const entry of entries) {
          const index = Number.parseInt(entry.target.getAttribute(ROW_INDEX_ATTRIBUTE) ?? '', 10);
          const size = entry.borderBoxSize[0]?.blockSize;
          if (!Number.isNaN(index) && size) setRowHeight(index, size);
        }
      })
  );
  useEffect(() => () => observer.disconnect(), [observer]);

  const observeRowElements = useCallback(
    (elements: Element[] | NodeListOf<Element>) => {
      elements.forEach((el) => observer.observe(el));
      return () => elements.forEach((el) => observer.unobserve(el));
    },
    [observer]
  );

  return useMemo(() => {
    let total = 0;
    for (const h of heights.values()) total += h;
    // Unmeasured rows are estimated from the measured ones until they render.
    const average = heights.size > 0 ? total / heights.size : 220;
    return {
      getAverageRowHeight: () => average,
      getRowHeight: (index: number) => {
        const id = rowIds[index];
        return id === undefined ? undefined : heights.get(id);
      },
      setRowHeight,
      observeRowElements,
    };
  }, [heights, rowIds, setRowHeight, observeRowElements]);
}
