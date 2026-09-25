"""Auth dependency for dedup routes.

Same checks as ``require_outliner_access``, but gated on its own ``dedup`` permission
so the two tools can be granted independently.
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
_ALLOWED_ROLES = frozenset({"admin", "reviewer", "annotator"})
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
    role = (user.role or "user").strip().lower()
    return role in _ALLOWED_ROLES and DEDUP_PERMISSION in _parse_permissions(user.permissions)


def require_dedup_access(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    """Validate the Auth0 bearer token and ensure the user may use the dedup tool."""
    user = _user_from_token(creds)
    if DEDUP_PERMISSION not in _parse_permissions(user.permissions):
        raise HTTPException(status_code=403, detail="No access to the Deduplicator")
    if (user.role or "user").strip().lower() not in _ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Unauthorized")
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
