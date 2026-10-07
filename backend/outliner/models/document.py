"""ORM model for outliner_documents."""
from __future__ import annotations

from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class OutlinerDocument(Base):
    """Stores the full text content and metadata for an outliner document."""

    __tablename__ = "outliner_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # Heavy columns (~500 KB per volume) load only when read, so metadata-only queries stay small.
    content: Mapped[str] = mapped_column(Text, nullable=False, deferred=True)
    filename: Mapped[str | None] = mapped_column(String, nullable=True)
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )

    order: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    category: Mapped[str | None] = mapped_column(String, nullable=True, default="uncategorized")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    status: Mapped[str | None] = mapped_column(String, default="active", nullable=True)
    ai_toc_entries: Mapped[Any | None] = mapped_column(JSON, nullable=True, deferred=True)
    annotator_ai_final_segments: Mapped[Any | None] = mapped_column(
        JSON, nullable=True, deferred=True
    )
    submit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    segments: Mapped[list["OutlinerSegment"]] = relationship(
        "OutlinerSegment",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="OutlinerSegment.segment_index",
    )
    synced_to_bdrc: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    # False when the scan is missing pages at the beginning and/or the end.
    is_complete: Mapped[bool] = mapped_column(Boolean, default=True, nullable=True)
    reviewer_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
