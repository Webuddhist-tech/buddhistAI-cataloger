"""Request/response shapes for the dedup routes.

BDRC's review API validates none of its strings, so the vocabulary is enforced here
(review plan §5 decision / issue, §10 abstention reasons).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

Verdict = Literal["same", "different", "contains", "part_of", "source_dup", "not_sure"]
AbstentionReason = Literal[
    "insufficient_evidence",
    "genuinely_ambiguous",
    "out_of_scope",
    "technical_failure",
    "needs_image_or_metadata",
]
IssueKind = Literal[
    "oversegmented",
    "undersegmented",
    "convention",
    "wrong_author",
    "author_conflict",
    "anthology_suspected",
    "source_dup",
    "other",
]
# `finalized` = decided (BDRC consumes these); `flagged` = issue reported, left undecided.
DecisionStatus = Literal["finalized", "flagged"]


class IssueIn(BaseModel):
    kind: IssueKind
    mw_ids: list[str] = Field(min_length=1)
    note: Optional[str] = None


class DecisionIn(BaseModel):
    """What the review UI sends when an annotator decides or flags an item.

    ``issues`` is the item's full issue list (BDRC replaces the list on every write).
    Leave it out to keep the issues already recorded; the same goes for
    ``partner_payload`` (e.g. ``{"preferred_mw_id": "MW…"}`` for "which copy is better").
    """

    verdict: Optional[Verdict] = None
    abstention_reason: Optional[AbstentionReason] = None
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    issues: Optional[list[IssueIn]] = None
    partner_payload: Optional[dict[str, Any]] = None
    status: Optional[DecisionStatus] = None

    @model_validator(mode="after")
    def _consistent(self) -> "DecisionIn":
        if self.verdict is None and not self.issues:
            raise ValueError("send a verdict, or at least one issue")
        # Plan §5: CHECK ((verdict = 'not_sure') = (abstention_reason IS NOT NULL)).
        if self.verdict == "not_sure" and self.abstention_reason is None:
            raise ValueError("verdict 'not_sure' needs an abstention_reason")
        if self.verdict != "not_sure" and self.abstention_reason is not None:
            raise ValueError("abstention_reason is only allowed with verdict 'not_sure'")
        if self.confidence is not None and self.verdict is None:
            raise ValueError("confidence is only allowed with a verdict")
        if self.status == "finalized" and self.verdict is None:
            raise ValueError("status 'finalized' needs a verdict")
        return self


class AssignmentOut(BaseModel):
    assigned_at: datetime
    first_opened_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ItemOut(BaseModel):
    """A review item as the UI sees it: BDRC's evidence plus this user's latest decision.

    Field names match BDRC's review item so the UI can render either.
    """

    item_id: int
    batch_id: str
    kind: str
    subject: dict[str, Any]
    evidence: dict[str, Any]
    status: str
    verdict: Optional[str] = None
    abstention_reason: Optional[str] = None
    confidence: Optional[int] = None
    issues: Optional[list[dict[str, Any]]] = None
    partner_payload: Optional[dict[str, Any]] = None
    annotator_id: Optional[str] = None
    decided_at: Optional[datetime] = None
    sync_state: Optional[str] = None
    assignment: Optional[AssignmentOut] = None


class BatchOut(BaseModel):
    batch_id: str
    kind: str = "pair"
    n_items: int = 0
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    # BDRC's counts for the whole batch, by status.
    status_counts: dict[str, int] = Field(default_factory=dict)
    my_open: int = 0
    my_done: int = 0


class ClaimOut(BaseModel):
    claimed: int
    """How many new items were handed out by this call (0 if the user still had open ones)."""
    items: list[ItemOut]


class SyncHealthOut(BaseModel):
    counts: dict[str, int]
    failed: list[dict[str, Any]]
