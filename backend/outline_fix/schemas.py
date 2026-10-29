from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EditIn(BaseModel):
    rid: str
    img_start: int | None = None
    img_end: int | None = None
    vol_start: int | None = None
    vol_end: int | None = None
    part_type: str | None = None


class EditOut(EditIn):
    edited_by: str
    updated_at: datetime


class SaveEditsIn(BaseModel):
    # Every segment whose values differ from the imported CSV; segments left out are
    # back to their original values.
    edits: list[EditIn]


class SkipIn(BaseModel):
    note: str = Field(min_length=1)


class AssignIn(BaseModel):
    user_id: str


class WorkSummary(BaseModel):
    id: str
    w_id: str
    batch_id: str
    status: str
    issue_count: int
    error_types: list[str]
    edit_count: int
    assigned_to: str | None
    assigned_to_name: str | None = None
    assigned_at: datetime | None
    completed_at: datetime | None
    note: str | None
    imported_at: datetime


class WorkDetail(WorkSummary):
    outline_header: list[str]
    outline_rows: list[list[str]]
    issues: list[dict[str, Any]]
    edits: list[EditOut]


class ClaimOut(BaseModel):
    work: WorkSummary | None
    # False when the user still had an unfinished work, which is returned instead.
    claimed: bool


class BatchOut(BaseModel):
    batch_id: str
    total: int
    status_counts: dict[str, int]
    issue_count: int


class ImportOut(BaseModel):
    batch_id: str
    created: list[str]
    skipped_existing: list[str]
    # Exported fixed outlines ({w_id}_outline.csv) found among the files, not imported.
    ignored: list[str]
    errors: list[str]


class UserOut(BaseModel):
    id: str
    name: str | None
    email: str


class MeOut(BaseModel):
    access: bool
    role: Literal["annotator", "admin"]


class MemberOut(BaseModel):
    """A Cataloger account as the Outline Fixer's Users page shows it."""

    id: str
    name: str | None
    email: str
    picture: str | None
    created_at: datetime | None
    access: bool
    role: Literal["annotator", "admin"]


class MemberPageOut(BaseModel):
    users: list[MemberOut]
    has_next: bool


class MemberUpdateIn(BaseModel):
    # Either or both; a field left out is not changed.
    access: bool | None = None
    role: Literal["annotator", "admin"] | None = None
