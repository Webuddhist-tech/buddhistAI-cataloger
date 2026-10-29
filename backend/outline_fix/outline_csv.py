"""Read and write BDRC outline.csv files, and apply annotator edits to them.

Mirrors ``csv.js`` in the original fixer (BDRC_outline_csv_fixer): column order and
duplicate column names are kept, and only the five editable columns are ever written.
"""
from __future__ import annotations

import csv
import io
import re
from typing import Iterable

RID_COL = "RID"
PART_TYPE_COL = "part type"
IMG_START = "img start"
IMG_END = "img end"
VOL_START = "vol start"
VOL_END = "vol end"
REQUIRED_COLUMNS = (RID_COL, PART_TYPE_COL, IMG_START, IMG_END)

# Edit field -> CSV column.
EDIT_COLUMNS = {
    "img_start": IMG_START,
    "img_end": IMG_END,
    "vol_start": VOL_START,
    "vol_end": VOL_END,
    "part_type": PART_TYPE_COL,
}
INT_FIELDS = ("img_start", "img_end", "vol_start", "vol_end")


class OutlineCsvError(ValueError):
    pass


def _clean_field_name(name: str) -> str:
    cleaned = (name or "").lstrip("﻿").strip()
    if len(cleaned) >= 2 and cleaned[0] == '"' and cleaned[-1] == '"':
        cleaned = cleaned[1:-1]
    return cleaned


def parse_outline_csv(text: str) -> tuple[list[str], list[list[str]]]:
    """Header and data rows, each row padded to the header's length."""
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    rows = [r for r in rows if any(cell.strip() for cell in r)]
    if not rows:
        raise OutlineCsvError("CSV is empty")
    header = [_clean_field_name(h) for h in rows[0]]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise OutlineCsvError(f"CSV is missing required column(s): {', '.join(missing)}")
    data = [r + [""] * (len(header) - len(r)) for r in rows[1:]]
    return header, data


def serialize_outline_csv(header: list[str], rows: Iterable[list[str]]) -> str:
    """Quote only where needed, newline-terminated, as the original fixer's export does."""
    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue()


def column_index(header: list[str]) -> dict[str, int]:
    """First occurrence of each column name."""
    index: dict[str, int] = {}
    for i, name in enumerate(header):
        index.setdefault(name, i)
    return index


def to_rid(segment_id: str | None) -> str:
    stripped = (segment_id or "").strip()
    if not stripped:
        return ""
    return stripped if stripped.startswith("bdr:") else f"bdr:{stripped}"


def w_id_from_rows(header: list[str], rows: list[list[str]]) -> str | None:
    """The work's W id from its segment RIDs: bdr:MW00EGS1016253_D7E1AD -> W00EGS1016253."""
    rid_i = column_index(header)[RID_COL]
    for row in rows:
        rid = row[rid_i].strip().removeprefix("bdr:")
        match = re.match(r"^M(W[A-Za-z0-9]+)_", rid)
        if match:
            return match.group(1)
    return None


def row_values(header: list[str], row: list[str]) -> dict[str, int | str | None]:
    """The five editable values of one CSV row, typed like an edit."""
    col = column_index(header)
    values: dict[str, int | str | None] = {}
    for field, name in EDIT_COLUMNS.items():
        i = col.get(name)
        raw = row[i].strip() if i is not None and i < len(row) else ""
        if field in INT_FIELDS:
            values[field] = int(raw) if raw.lstrip("-").isdigit() else None
        else:
            values[field] = raw or None
    return values


def apply_edits(header: list[str], rows: list[list[str]], edits: Iterable[dict]) -> list[list[str]]:
    """A copy of ``rows`` with each edit's values written into its segment's row."""
    col = column_index(header)
    by_rid = {to_rid(e["rid"]): e for e in edits}
    out: list[list[str]] = []
    for row in rows:
        new_row = list(row)
        edit = by_rid.get(to_rid(row[col[RID_COL]]))
        if edit:
            for field, name in EDIT_COLUMNS.items():
                i = col.get(name)
                if i is None:
                    continue
                value = edit.get(field)
                new_row[i] = "" if value is None else str(value)
        out.append(new_row)
    return out
