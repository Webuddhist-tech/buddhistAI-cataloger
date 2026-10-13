"""Auth dependency for dedup routes.

Independent of the Outliner: access is the ``dedup`` permission, and the user's part here
(annotator / adjudicator) is ``users.dedup_role``, not the Outliner ``users.role``. Only
"admin" is shared by both tools.
"""
from __future__ import annotations

import json

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func

from core.auth0_access_token import email_from_access_token_claims, verify_auth0_access_token
from core.database import SessionLocal
from user.models.user import User

DEDUP_PERMISSION = "dedup"
_bearer = HTTPBearer(auto_error=False)


def _parse_permissions(permissions_raw: str | None) -> list[str]:
    if not permissions_raw:
        return []
    try:
        parsed = json.loads(permissions_raw)
        return [p.strip() for p in parsed] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return [p.strip() for p in permissions_raw.split(",") if p.strip()]


def _user_from_token(creds: HTTPAuthorizationCredentials | None) -> User:
    if not creds or creds.scheme.lower() != "bearer" or not (creds.credentials or "").strip():
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization bearer token")

    payload = verify_auth0_access_token(creds.credentials.strip())
    email = email_from_access_token_claims(payload)
    if not email:
        raise HTTPException(status_code=401, detail="Token is missing an email claim")

    # Short-lived session so auth does not hold a pool connection for the whole request.
    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        db.expunge(user)
        return user
    finally:
        db.close()


def has_dedup_access(user: User) -> bool:
    """The `dedup` permission alone, granted from the Deduplicator's Users page. The
    Outliner role (`user.role`) plays no part, so a new sign-up ("user") can be let in
    here without being given an Outliner role."""
    return DEDUP_PERMISSION in _parse_permissions(user.permissions)


def require_logged_in(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    """Any Cataloger account: for read-only pair pages shared as links."""
    return _user_from_token(creds)


def require_dedup_access(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    """Validate the Auth0 bearer token and ensure the user may use the dedup tool."""
    user = _user_from_token(creds)
    if not has_dedup_access(user):
        raise HTTPException(status_code=403, detail="No access to the Deduplicator")
    return user


def require_dedup_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    """Admins manage the dedup work without needing the annotator permission themselves."""
    user = _user_from_token(creds)
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admins only")
    return user


def is_admin(user: User) -> bool:
    return (user.role or "").strip().lower() == "admin"


DEDUP_ROLES = ("annotator", "reviewer")


def dedup_role(user: User) -> str:
    """The user's role in the Deduplicator: "admin", "annotator" or "reviewer" (shown as
    Adjudicator). Set apart from ``user.role`` (the Outliner's), so an Outliner reviewer
    can annotate here; admins are admins in both."""
    if is_admin(user):
        return "admin"
    role = (user.dedup_role or "").strip().lower()
    return role if role in DEDUP_ROLES else "annotator"


def can_annotate(user: User) -> bool:
    """Annotators and admins take annotator slots; adjudicators only adjudicate."""
    return has_dedup_access(user) and dedup_role(user) in ("annotator", "admin")


def can_adjudicate(user: User) -> bool:
    """Adjudicators and admins settle disagreements; never on a pair they annotated
    (checked per item)."""
    return has_dedup_access(user) and dedup_role(user) in ("reviewer", "admin")
