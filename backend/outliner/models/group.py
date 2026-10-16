"""ORM models for outliner work groups.

A group links a set of users (annotators and reviewers) to one BDRC volume batch. Assign
gives annotators volumes from their group's batch, and reviewers completed documents from
their own groups. A user may belong to more than one group.
"""
from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class OutlinerGroup(Base):
    __tablename__ = "outliner_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    # BDRC volume batch new work comes from. None: the group gets no new volumes.
    batch_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    members: Mapped[list["OutlinerGroupMember"]] = relationship(
        "OutlinerGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class OutlinerGroupMember(Base):
    __tablename__ = "outliner_group_members"

    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("outliner_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    group: Mapped[OutlinerGroup] = relationship("OutlinerGroup", back_populates="members")
