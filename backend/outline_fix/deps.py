"""Auth dependencies for the Outline Fixer.

Access is the ``outline_fix`` permission; the user's part here (annotator / admin) is
``users.outline_fix_role``. The Outliner's ``users.role`` and the Deduplicator's
``users.dedup_role`` play no part, admin included.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from dedup.deps import _bearer, _parse_permissions, _user_from_token
from user.models.user import User

OUTLINE_FIX_PERMISSION = "outline_fix"
OUTLINE_FIX_ROLES = ("annotator", "admin")


def has_outline_fix_access(user: User) -> bool:
    return OUTLINE_FIX_PERMISSION in _parse_permissions(user.permissions)


def outline_fix_role(user: User) -> str:
    """"annotator" or "admin"; NULL or anything else = annotator."""
    role = (user.outline_fix_role or "").strip().lower()
    return role if role in OUTLINE_FIX_ROLES else "annotator"


def is_outline_fix_admin(user: User) -> bool:
    return has_outline_fix_access(user) and outline_fix_role(user) == "admin"


def require_logged_in(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    return _user_from_token(creds)


def require_outline_fix_access(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    user = _user_from_token(creds)
    if not has_outline_fix_access(user):
        raise HTTPException(status_code=403, detail="No access to the Outline Fixer")
    return user


def require_outline_fix_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    user = _user_from_token(creds)
    if not is_outline_fix_admin(user):
        raise HTTPException(status_code=403, detail="Admins only")
    return user
