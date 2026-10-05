import type { DiffChunk } from './api/review';

// BDRC's diff is one flat list of chunks; split and unified views need aligned rows.
// Display only: a row ends at a newline both copies share, or at a shad once it is
// long enough. Changed chunks are never split, so no text or highlight changes.

const NEWLINES = /\r?\n/g;

/** A changed chunk's difference type (e.g. punctuation only), if BDRC sent one. */
export function dtypeOf(c: DiffChunk): number | undefined {
  if (c[0] === 0) return undefined;
  return c[0] === 1 ? c[3] : c[2];
}

/** The code BDRC uses for a difference type name, read from the response's legend. */
export function typeCode(types: Record<string, string> | undefined, name: string): number | undefined {
  const hit = Object.entries(types ?? {}).find(([, v]) => v === name);
  return hit ? Number(hit[0]) : undefined;
}

/**
 * BDRC's chunks with every newline removed. OCR keeps the printed page's line breaks,
 * which differ between editions: a newline only one copy has would otherwise count as
 * a change nobody can see, and break the two sides at different places. Tibetan has no
 * spaces between words, so the text on either side of a newline simply joins up.
 * Chunks left empty go, a replace whose sides now match becomes equal, and neighbours
 * of the same kind merge.
 */
export function withoutNewlines(chunks: DiffChunk[]): DiffChunk[] {
  const out: DiffChunk[] = [];
  const push = (c: DiffChunk) => {
    const last = out.at(-1);
    if (last && last[0] === c[0]) {
      // Merged neighbours keep a difference type only if they share it.
      const t = dtypeOf(last) === dtypeOf(c) ? dtypeOf(c) : 0;
      if (last[0] === 1 && c[0] === 1) out[out.length - 1] = [1, last[1] + c[1], last[2] + c[2], t];
      else if (last[0] === 0) out[out.length - 1] = [0, last[1] + c[1]];
      else out[out.length - 1] = [last[0], last[1] + c[1], t] as DiffChunk;
    } else {
      out.push(c);
    }
  };
  for (const c of chunks) {
    if (c[0] === 1) {
      const a = c[1].replace(NEWLINES, '');
      const b = c[2].replace(NEWLINES, '');
      const t = c[3];
      if (a === b) {
        if (a) push([0, a]);
      } else if (!a) push([3, b, t]);
      else if (!b) push([2, a, t]);
      else push([1, a, b, t]);
    } else {
      const text = c[1].replace(NEWLINES, '');
      if (!text) continue;
      push(c[0] === 0 ? [0, text] : ([c[0], text, c[2]] as DiffChunk));
    }
  }
  return out;
}

export type Piece = { text: string; changed: boolean };
export type DiffRow = { a: Piece[]; b: Piece[]; changed: boolean };

const ROW_CHARS = 80;
// Split same-in-both text after a newline, or after a shad (with its trailing space).
const BREAKS = /(\n|།+ *)/;

/**
 * `quiet` is a difference type (e.g. punctuation only) to show as plain text: each
 * side keeps its own text, unmarked, and the row does not count as changed.
 */
export function buildDiffRows(chunks: DiffChunk[], quiet?: number): DiffRow[] {
  const rows: DiffRow[] = [];
  let cur: DiffRow = { a: [], b: [], changed: false };
  let len = 0;

  const flush = () => {
    if (cur.a.length || cur.b.length) rows.push(cur);
    cur = { a: [], b: [], changed: false };
    len = 0;
  };
  const add = (side: 'a' | 'b', text: string, changed: boolean) => {
    if (text) cur[side].push({ text, changed });
  };

  for (const c of chunks) {
    if (c[0] === 0) {
      // Keep each separator with the text before it, then decide whether to break.
      const parts = c[1].split(BREAKS);
      for (let i = 0; i < parts.length; i += 2) {
        const piece = parts[i] + (parts[i + 1] ?? '');
        if (!piece) continue;
        add('a', piece, false);
        add('b', piece, false);
        len += piece.length;
        const sep = parts[i + 1] ?? '';
        if (sep.includes('\n') || (sep && len >= ROW_CHARS)) flush();
      }
    } else {
      const changed = quiet === undefined || dtypeOf(c) !== quiet;
      if (changed) cur.changed = true;
      if (c[0] === 1) {
        add('a', c[1], changed);
        add('b', c[2], changed);
        len += Math.max(c[1].length, c[2].length);
      } else if (c[0] === 2) {
        add('a', c[1], changed);
        len += c[1].length;
      } else {
        add('b', c[1], changed);
        len += c[1].length;
      }
    }
  }
  flush();
  return rows;
}

export type RowBlock =
  | { kind: 'rows'; start: number; rows: DiffRow[] }
  | { kind: 'fold'; start: number; rows: DiffRow[] };

// Runs of unchanged rows longer than this are folded, keeping CONTEXT rows each side.
const FOLD_MIN = 8;
const CONTEXT = 2;

/** `start` is the 0-based row index. */
export function foldRows(rows: DiffRow[]): RowBlock[] {
  const blocks: RowBlock[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].changed) {
      const start = i;
      while (i < rows.length && rows[i].changed) i++;
      blocks.push({ kind: 'rows', start, rows: rows.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < rows.length && !rows[i].changed) i++;
    const run = rows.slice(start, i);
    const head = start === 0 ? 0 : CONTEXT;
    const tail = i === rows.length ? 0 : CONTEXT;
    if (run.length - head - tail >= FOLD_MIN) {
      if (head) blocks.push({ kind: 'rows', start, rows: run.slice(0, head) });
      blocks.push({ kind: 'fold', start: start + head, rows: run.slice(head, run.length - tail) });
      if (tail) blocks.push({ kind: 'rows', start: i - tail, rows: run.slice(run.length - tail) });
    } else {
      blocks.push({ kind: 'rows', start, rows: run });
    }
  }
  return blocks;
}
