from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from core.database import get_db
from settings.models.permission import Permission

router = APIRouter()


class PermissionCreate(BaseModel):
    name: str


class PermissionUpdate(BaseModel):
    name: Optional[str] = None


class PermissionResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[PermissionResponse])
def get_permissions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all permissions"""
    permissions = db.query(Permission).offset(skip).limit(limit).all()
    return permissions


@router.get("/{permission_id}", response_model=PermissionResponse)
def get_permission(permission_id: str, db: Session = Depends(get_db)):
    """Get a permission by ID"""
    permission = db.query(Permission).filter(Permission.id == permission_id).first()
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    return permission


@router.post("", response_model=PermissionResponse, status_code=201)
def create_permission(permission: PermissionCreate, db: Session = Depends(get_db)):
    """Create a new permission"""
    # Check if name already exists
    existing = db.query(Permission).filter(Permission.name == permission.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Permission with this name already exists")
    
    db_permission = Permission(
        id=str(uuid.uuid4()),
        name=permission.name
    )
    db.add(db_permission)
    db.commit()
    db.refresh(db_permission)
    return db_permission


@router.put("/{permission_id}", response_model=PermissionResponse)
def update_permission(permission_id: str, permission: PermissionUpdate, db: Session = Depends(get_db)):
    """Update a permission"""
    db_permission = db.query(Permission).filter(Permission.id == permission_id).first()
    if not db_permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    # Check if name is being updated and if it conflicts
    if permission.name and permission.name != db_permission.name:
        existing = db.query(Permission).filter(Permission.name == permission.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Permission with this name already exists")
        db_permission.name = permission.name
    
    db.commit()
    db.refresh(db_permission)
    return db_permission


@router.delete("/{permission_id}", status_code=204)
def delete_permission(permission_id: str, db: Session = Depends(get_db)):
    """Delete a permission"""
    db_permission = db.query(Permission).filter(Permission.id == permission_id).first()
    if not db_permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    db.delete(db_permission)
    db.commit()
    return None
