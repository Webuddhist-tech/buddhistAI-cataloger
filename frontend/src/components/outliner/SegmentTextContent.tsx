import React, { useMemo, useRef } from 'react'
import type { SegmentTextContentProps } from './types'
import Highlighter from "react-highlight-words";
import { normalizeSearchQuery } from '@/features/outliner';

/** `marks` are body-relative and assumed sorted/non-overlapping (the API stores them that way). */
function markedRuns(text: string, marks: { start: number; end: number }[]) {
  const runs: { text: string; marked: boolean; offset: number }[] = [];
  let cursor = 0;
  for (const mark of marks) {
    const start = Math.max(0, Math.min(mark.start, text.length));
    const end = Math.max(start, Math.min(mark.end, text.length));
    if (end <= cursor) continue;
    if (start > cursor) runs.push({ text: text.slice(cursor, start), marked: false, offset: cursor });
    runs.push({ text: text.slice(start, end), marked: true, offset: start });
    cursor = end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), marked: false, offset: cursor });
  return runs;
}

export const SegmentTextContent = React.forwardRef<HTMLDivElement, SegmentTextContentProps>(
  (
    {
      segmentId,
      text,
      title,
      author,
      segmentSearchQuery,
      markedSpans,
      onCursorChange,
      onActivate,
      onInput,
      onKeyDown,
    },
    ref
  ) => {
    const contentRef = useRef<HTMLDivElement>(null);

    const normalized = normalizeSearchQuery(segmentSearchQuery)
    const searchWords = normalized ? [normalized] : []
    const runs = useMemo(
      () => (markedSpans?.length ? markedRuns(text, markedSpans) : null),
      [text, markedSpans]
    )
    return (
      <div
        ref={contentRef}
        data-segment-id={segmentId}
        data-segment-body-id={segmentId}
        className="segment-text-content cursor-text font-monlam text-gray-900 whitespace-pre-wrap wrap-break-word select-text relative outline-none"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onKeyDown={onKeyDown}
        onSelect={() => {
          if (contentRef.current) {
            onCursorChange(segmentId, contentRef.current)
          }
        }}
        onClick={() => {
          // Caret updates are handled in onSelect; calling onCursorChange here too doubled
          // Range#toString work and React updates (major click/mouseup handler cost).
          onActivate()
        }}
      >
        {runs ? (
          runs.map((run) =>
            run.marked ? (
              <mark
                key={`rm-${run.offset}`}
                data-rejection-mark="true"
                data-mark-offset={run.offset}
                className="segment-rejection-mark rounded-sm bg-red-200/90 box-decoration-clone transition-shadow"
              >
                <Highlighter
                  highlightClassName="highlighter"
                  searchWords={searchWords}
                  autoEscape={true}
                  textToHighlight={run.text}
                />
              </mark>
            ) : (
              <Highlighter
                key={`rt-${run.offset}`}
                highlightClassName="highlighter"
                searchWords={searchWords}
                autoEscape={true}
                textToHighlight={run.text}
              />
            )
          )
        ) : (
          <Highlighter
            highlightClassName="highlighter"
            searchWords={searchWords}
            autoEscape={true}
            textToHighlight={text}
          />
        )}
        </div>
    )
  }
)

SegmentTextContent.displayName = 'SegmentTextContent'
