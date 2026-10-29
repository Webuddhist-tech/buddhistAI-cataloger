// Turn a work's stored CSV (header + rows) into segments the workspace can edit.
import type { SavedEdit, SpanValues } from './api';
import { toRid } from './checker';

export interface Segment {
  rid: string;
  /** Position in the CSV, for showing the rows around an issue. */
  index: number;
  title: string;
  original: SpanValues;
}

export const PART_TYPES = [
  { code: 'T', label: 'Text' },
  { code: 'C', label: 'Chapter' },
  { code: 'E', label: 'Editorial / TOC' },
  { code: 'S', label: 'Section' },
  { code: 'V', label: 'Volume' },
];

export const SPAN_FIELDS = ['img_start', 'img_end', 'vol_start', 'vol_end'] as const;

const toInt = (raw: string | undefined): number | null => {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function parseSegments(header: string[], rows: string[][]): Segment[] {
  const col = (name: string) => header.indexOf(name);
  const c = {
    rid: col('RID'),
    partType: col('part type'),
    label: col('label'),
    titles: col('titles'),
    imgStart: col('img start'),
    imgEnd: col('img end'),
    volStart: col('vol start'),
    volEnd: col('vol end'),
  };
  const at = (row: string[], i: number) => (i >= 0 ? row[i] ?? '' : '');
  return rows.map((row, index) => ({
    rid: toRid(at(row, c.rid)),
    index,
    title: at(row, c.titles) || at(row, c.label) || '(no title)',
    original: {
      img_start: toInt(at(row, c.imgStart)),
      img_end: toInt(at(row, c.imgEnd)),
      vol_start: toInt(at(row, c.volStart)),
      vol_end: toInt(at(row, c.volEnd)),
      part_type: at(row, c.partType).trim() || null,
    },
  }));
}

/** Current values per RID: the imported values with the saved edits applied. */
export function initialValues(segments: Segment[], edits: SavedEdit[]): Map<string, SpanValues> {
  const values = new Map(segments.map((s) => [s.rid, s.original]));
  for (const e of edits) {
    const rid = toRid(e.rid);
    if (values.has(rid)) {
      values.set(rid, {
        img_start: e.img_start,
        img_end: e.img_end,
        vol_start: e.vol_start,
        vol_end: e.vol_end,
        part_type: e.part_type,
      });
    }
  }
  return values;
}

export const sameValues = (a: SpanValues, b: SpanValues) =>
  a.img_start === b.img_start &&
  a.img_end === b.img_end &&
  a.vol_start === b.vol_start &&
  a.vol_end === b.vol_end &&
  (a.part_type ?? null) === (b.part_type ?? null);
