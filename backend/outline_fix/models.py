"""ORM models for the Outline Fixer: correcting BDRC outline span issues, one work at a time.

* ``outline_fix_works``  one row per BDRC work (W id): its outline.csv and issue.json as
                         imported, and who is fixing it
* ``outline_fix_edits``  one row per outline segment an annotator changed

The imported CSV is never modified. The fixed CSV is rebuilt on export by applying the
edits to it, so every change stays traceable to who made it. Whether an issue is resolved
is not stored: the workspace re-checks it from the current values (same rules as the
original fixer, ``issue-checker.js``).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base

# Work statuses. pending = unassigned; in_progress = assigned (claimed or handed out);
# skipped = the annotator could not fix it and left a note.
STATUS_PENDING = "pending"
STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
STATUS_SKIPPED = "skipped"
STATUSES = (STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_SKIPPED)


def _uuid() -> str:
    return str(uuid.uuid4())


class OutlineFixWork(Base):
    """One BDRC work to fix: the outline.csv + issue.json pair, and its assignment."""

    __tablename__ = "outline_fix_works"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    w_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    batch_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # outline.csv as imported. The header is kept as a list because BDRC's CSV repeats
    # column names (five "Position" columns), which a dict would collapse.
    outline_header: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    outline_rows: Mapped[list[list[str]]] = mapped_column(JSON, nullable=False)
    # issue.json's ``issues`` array, as is; the rest of the file is in issue_meta.
    issues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    issue_meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[str] = mapped_column(String, nullable=False, default=STATUS_PENDING, index=True)
    assigned_to: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    assigned_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Why a work was skipped, or anything the annotator wants the admin to know.
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class OutlineFixEdit(Base):
    """The corrected values of one outline segment (CSV row) in a work.

    Holds all five editable fields, not only the changed one, so export just writes them
    over the original row. Saving the same segment again updates this row; reverting it to
    the original values deletes it.
    """

    __tablename__ = "outline_fix_edits"
    __table_args__ = (UniqueConstraint("work_id", "rid", name="uq_outline_fix_edits_work_rid"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    work_id: Mapped[str] = mapped_column(
        String, ForeignKey("outline_fix_works.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Segment RID with the bdr: prefix, as in the CSV's RID column.
    rid: Mapped[str] = mapped_column(String, nullable=False)
    img_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    img_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vol_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vol_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    part_type: Mapped[str | None] = mapped_column(String, nullable=True)
    edited_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
