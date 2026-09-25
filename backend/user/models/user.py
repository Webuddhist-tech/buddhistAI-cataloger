from enum import Enum
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from core.database import Base


class UserRole(Enum):
    USER = "user"
    ANNOTATOR = "annotator"
    Reviewer = "reviewer"
    ADMIN = "admin"

class Permissions(Enum):
    Outliner = "outliner"
    Cataloger = "cataloger"
    Dedup = "dedup"

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None]
    picture: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    role: Mapped[str | None] = mapped_column(String, nullable=True,default='user')
    permissions: Mapped[list[Permissions]] = mapped_column(String, nullable=True)
    memberships = relationship("TenantMembership", back_populates="user")



