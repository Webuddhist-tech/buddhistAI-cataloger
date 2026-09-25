import type { DiffChunk } from './api/review';

// BDRC's diff is one flat list of chunks; split and unified views need aligned rows.
// Display only: a row ends at a newline both copies share, or at a shad once it is
// long enough. Changed chunks are never split, so no text or highlight changes.

export type Piece = { text: string; changed: boolean };
export type DiffRow = { a: Piece[]; b: Piece[]; changed: boolean };

const ROW_CHARS = 80;
// Split same-in-both text after a newline, or after a shad (with its trailing space).
const BREAKS = /(\n|།+ *)/;

export function buildDiffRows(chunks: DiffChunk[]): DiffRow[] {
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
      cur.changed = true;
      if (c[0] === 1) {
        add('a', c[1], true);
        add('b', c[2], true);
        len += Math.max(c[1].length, c[2].length);
      } else if (c[0] === 2) {
        add('a', c[1], true);
        len += c[1].length;
      } else {
        add('b', c[1], true);
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
