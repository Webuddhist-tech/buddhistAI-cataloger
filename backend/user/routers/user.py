from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from core.auth0_access_token import (
    email_from_access_token_claims,
    subject_from_access_token_claims,
    verify_auth0_access_token,
)
from datetime import datetime
import uuid
import json

from core.database import get_db
from core.redis import (
    get_user_by_email_from_cache,
    invalidate_user_by_email_cache,
    set_user_by_email_in_cache,
)
from user.models.user import User

router = APIRouter()

_settings_users_bearer = HTTPBearer(auto_error=False)


def require_access_token_payload(
    creds: HTTPAuthorizationCredentials | None = Depends(_settings_users_bearer),
) -> dict:
    if (
        not creds
        or creds.scheme.lower() != "bearer"
        or not (creds.credentials or "").strip()
    ):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    return verify_auth0_access_token(creds.credentials.strip())


class UserSelfCreate(BaseModel):
    """First-time profile from the client; id and email come from the access token."""

    name: Optional[str] = None
    picture: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    picture: Optional[str]
    created_at: datetime
    role: Optional[str]
    permissions: Optional[List[str]] = None

    class Config:
        from_attributes = True


class PaginatedUserResponse(BaseModel):
    items: List[UserResponse]
    total: int
    skip: int
    limit: int


@router.get("", response_model=PaginatedUserResponse)
def get_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    permission: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all users with pagination, optionally filtered by role, permission, and name/email search."""
    query = db.query(User)

    if role:
        query = query.filter(User.role == role)

    if permission:
        query = query.filter(User.permissions.contains(permission))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.name.ilike(term),
                User.email.ilike(term),
            )
        )

    total = query.count()

    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    # Convert permissions from string to list if needed
    user_responses = []
    for user in users:
        permissions = None
        if user.permissions:
            try:
                # Try to parse as JSON first
                permissions = json.loads(user.permissions) if isinstance(user.permissions, str) else user.permissions
            except (json.JSONDecodeError, TypeError):
                # If not JSON, try comma-separated string
                if isinstance(user.permissions, str):
                    permissions = [p.strip() for p in user.permissions.split(',') if p.strip()]
                else:
                    permissions = user.permissions
        
        user_responses.append(UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture,
            created_at=user.created_at,
            role=user.role,
            permissions=permissions
        ))
    
    return PaginatedUserResponse(
        items=user_responses,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/me", response_model=UserResponse)
def get_current_user(
    payload: dict = Depends(require_access_token_payload),
    db: Session = Depends(get_db),
):
    """Current user from DB; email is taken from the Auth0 access token (must include an email claim)."""
    email = email_from_access_token_claims(payload)
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Token is missing an email claim (add email to the access token via an Auth0 Action if needed)",
        )

    cached = get_user_by_email_from_cache(email)
    if cached is not None:
        return UserResponse(**cached)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    permissions = None
    if user.permissions:
        try:
            permissions = json.loads(user.permissions) if isinstance(user.permissions, str) else user.permissions
        except (json.JSONDecodeError, TypeError):
            if isinstance(user.permissions, str):
                permissions = [p.strip() for p in user.permissions.split(",") if p.strip()]
            else:
                permissions = user.permissions

    response = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        created_at=user.created_at,
        role=user.role,
        permissions=permissions,
    )
    set_user_by_email_in_cache(user.email, response.model_dump(mode="json"))
    return response


@router.get("/by-email/{email}", response_model=UserResponse)
def get_user_by_email(email: str, db: Session = Depends(get_db)):
    """Get a user by email (cached in Redis for 20 days when Redis is available)."""
    cached = get_user_by_email_from_cache(email)
    if cached is not None:
        return UserResponse(**cached)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    permissions = None
    if user.permissions:
        try:
            permissions = json.loads(user.permissions) if isinstance(user.permissions, str) else user.permissions
        except (json.JSONDecodeError, TypeError):
            if isinstance(user.permissions, str):
                permissions = [p.strip() for p in user.permissions.split(',') if p.strip()]
            else:
                permissions = user.permissions

    response = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        created_at=user.created_at,
        role=user.role,
        permissions=permissions,
    )
    set_user_by_email_in_cache(user.email, response.model_dump(mode="json"))
    return response


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    """Get a user by ID"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert permissions from string to list if needed
    permissions = None
    if user.permissions:
        try:
            permissions = json.loads(user.permissions) if isinstance(user.permissions, str) else user.permissions
        except (json.JSONDecodeError, TypeError):
            if isinstance(user.permissions, str):
                permissions = [p.strip() for p in user.permissions.split(',') if p.strip()]
            else:
                permissions = user.permissions
    
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        created_at=user.created_at,
        role=user.role,
        permissions=permissions
    )


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    user: UserSelfCreate,
    payload: dict = Depends(require_access_token_payload),
    db: Session = Depends(get_db),
):
    """Create a new user; email and id are taken from the access token."""
    email = email_from_access_token_claims(payload)
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Token is missing an email claim (add email to the access token via an Auth0 Action if needed)",
        )
    sub = subject_from_access_token_claims(payload)
    if not sub:
        raise HTTPException(status_code=401, detail="Token is missing sub claim")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    existing_id = db.query(User).filter(User.id == sub).first()
    if existing_id:
        raise HTTPException(status_code=400, detail="User already exists")

    permissions_str = None
    if user.permissions:
        permissions_str = json.dumps(user.permissions)

    db_user = User(
        id=sub,
        email=email,
        name=user.name,
        picture=user.picture,
        role=user.role or "user",
        permissions=permissions_str,
        created_at=datetime.utcnow(),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Convert permissions back to list for response
    permissions = None
    if db_user.permissions:
        try:
            permissions = json.loads(db_user.permissions) if isinstance(db_user.permissions, str) else db_user.permissions
        except (json.JSONDecodeError, TypeError):
            if isinstance(db_user.permissions, str):
                permissions = [p.strip() for p in db_user.permissions.split(',') if p.strip()]
            else:
                permissions = db_user.permissions
    
    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        name=db_user.name,
        picture=db_user.picture,
        created_at=db_user.created_at,
        role=db_user.role,
        permissions=permissions
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user: UserUpdate, db: Session = Depends(get_db)):
    """Update a user"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    previous_email = db_user.email

    # Check if email is being updated and if it conflicts
    if user.email and user.email != db_user.email:
        existing = db.query(User).filter(User.email == user.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        db_user.email = user.email
    
    if user.name is not None:
        db_user.name = user.name
    
    if user.picture is not None:
        db_user.picture = user.picture
    
    if user.role is not None:
        db_user.role = user.role
    
    if user.permissions is not None:
        # Store permissions as JSON string
        db_user.permissions = json.dumps(user.permissions) if user.permissions else None
    
    db.commit()
    db.refresh(db_user)

    invalidate_user_by_email_cache(previous_email)
    if db_user.email != previous_email:
        invalidate_user_by_email_cache(db_user.email)

    # Convert permissions back to list for response
    permissions = None
    if db_user.permissions:
        try:
            permissions = json.loads(db_user.permissions) if isinstance(db_user.permissions, str) else db_user.permissions
        except (json.JSONDecodeError, TypeError):
            if isinstance(db_user.permissions, str):
                permissions = [p.strip() for p in db_user.permissions.split(',') if p.strip()]
            else:
                permissions = db_user.permissions

    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        name=db_user.name,
        picture=db_user.picture,
        created_at=db_user.created_at,
        role=db_user.role,
        permissions=permissions,
    )


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db)):
    """Delete a user"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    invalidate_user_by_email_cache(db_user.email)

    db.delete(db_user)
    db.commit()
    return None
