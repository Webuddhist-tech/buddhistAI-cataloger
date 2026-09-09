/**
 * Briefly highlight a character range inside a segment's rendered text, after navigating
 * to a sanity-check finding.
 *
 * Painted with the CSS Custom Highlight API (`::highlight(sanity-finding-flash)` in
 * index.css) rather than by wrapping the run in an element: the annotator body is
 * contentEditable, so injected nodes are stripped by the browser and by React re-renders.
 * Where that API is missing the range is still scrolled to, just not coloured.
 */

const HIGHLIGHT_NAME = 'sanity-finding-flash'
const DEFAULT_DURATION_MS = 3000
/** The row mounts, expands and settles over several frames; keep retrying until it exists. */
const MAX_ATTEMPTS = 60
const RETRY_MS = 50
/** Gap left above the flagged run, so a little preceding text stays visible. */
const TOP_MARGIN_PX = 80

let clearTimer: number | undefined

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}

/** `CSS.highlights` and `Highlight` are recent additions; treat both as optional. */
function highlightRegistry(): HighlightRegistry | null {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  const ctor = (globalThis as unknown as { Highlight?: unknown }).Highlight
  return registry && typeof ctor === 'function' ? registry : null
}

/** Build a Range spanning [start, end) measured in the container's text content. */
function rangeForOffsets(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  let pos = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0

  let node = walker.nextNode()
  while (node !== null) {
    const length = node.textContent?.length ?? 0
    if (startNode === null && pos + length > start) {
      startNode = node
      startOffset = start - pos
    }
    if (startNode !== null && pos + length >= end) {
      endNode = node
      endOffset = end - pos
      break
    }
    pos += length
    node = walker.nextNode()
  }

  if (!startNode) return null
  // A range reaching past the last text node still highlights to the end of the text.
  if (!endNode) {
    endNode = startNode
    endOffset = startNode.textContent?.length ?? 0
  }

  const range = document.createRange()
  try {
    range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.textContent?.length ?? 0)))
    range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.textContent?.length ?? 0)))
  } catch {
    return null
  }
  return range.collapsed ? null : range
}

/**
 * Scroll every scrollable ancestor so the range sits near the top of the view.
 *
 * Measures the Range, never its parent element: the body renders `whitespace-pre-wrap`, so
 * one text node can span the whole segment and its element box starts far above the flagged
 * run. Walking every ancestor matters because the two views differ — the reviewer's segment
 * body is its own scroll box, while the annotator's renders at full height inside the
 * virtualized list viewport, which is what has to move there.
 */
function scrollRangeIntoView(range: Range, from: Element): void {
  let parent: Element | null = from
  while (parent) {
    const style = getComputedStyle(parent)
    const canScroll =
      parent.scrollHeight > parent.clientHeight + 1 &&
      /auto|scroll|overlay/.test(style.overflowY)
    if (canScroll) {
      const parentBox = parent.getBoundingClientRect()
      const box = range.getBoundingClientRect()
      // A collapsed/hidden range measures as all-zero; scrolling by that is meaningless.
      if (box.height > 0 || box.width > 0) {
        // Near the top of the viewport rather than centred, with room to read what precedes it.
        const delta = box.top - parentBox.top - TOP_MARGIN_PX
        if (Math.abs(delta) > 1) parent.scrollTop += delta
      }
    }
    parent = parent.parentElement
  }
}

/** Remove the flash highlight, if one is showing. */
export function clearSegmentRangeFlash(): void {
  if (clearTimer !== undefined) {
    window.clearTimeout(clearTimer)
    clearTimer = undefined
  }
  highlightRegistry()?.delete(HIGHLIGHT_NAME)
}

/**
 * Scroll a segment's flagged range into view and flash it.
 *
 * `start`/`end` are offsets within the segment's own text. The body may not exist yet (a
 * virtualized row mounts and a collapsed segment expands over several frames), so this
 * retries, calling `bringRowIntoView` until it appears. That stops once the range is
 * found — after which only the range's own position is adjusted, so the two never fight.
 */
export function flashSegmentRange(
  segmentId: string,
  start: number,
  end: number,
  options: { bringRowIntoView?: () => void; durationMs?: number } = {}
): void {
  if (end <= start) return
  const { bringRowIntoView, durationMs = DEFAULT_DURATION_MS } = options

  let attempts = 0
  const attempt = () => {
    const container = document.querySelector<HTMLElement>(
      `[data-segment-body-id="${CSS.escape(segmentId)}"]`
    )
    const range = container ? rangeForOffsets(container, start, end) : null

    if (!range || !container) {
      // Still waiting on the row: keep it mounted so its body can appear.
      bringRowIntoView?.()
      if (++attempts < MAX_ATTEMPTS) window.setTimeout(attempt, RETRY_MS)
      return
    }

    clearSegmentRangeFlash()

    const registry = highlightRegistry()
    if (registry) {
      const HighlightCtor = (globalThis as unknown as {
        Highlight: new (...ranges: Range[]) => unknown
      }).Highlight
      registry.set(HIGHLIGHT_NAME, new HighlightCtor(range))
      clearTimer = window.setTimeout(clearSegmentRangeFlash, durationMs)
    }

    // Expanding the row changes its height, moving the range after the first pass.
    let passes = 0
    const settle = () => {
      scrollRangeIntoView(range, container)
      if (++passes < 8) requestAnimationFrame(settle)
    }
    settle()
  }

  attempt()
}
