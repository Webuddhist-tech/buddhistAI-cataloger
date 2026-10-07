from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from core.database import get_db
from settings.models.role import Role
from settings.models.tenant import Tenant

router = APIRouter()


class RoleCreate(BaseModel):
    name: str
    tenant_id: str


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    tenant_id: Optional[str] = None


class RoleResponse(BaseModel):
    id: str
    name: str
    tenant_id: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[RoleResponse])
def get_roles(skip: int = 0, limit: int = 100, tenant_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all roles, optionally filtered by tenant_id"""
    query = db.query(Role)
    if tenant_id:
        query = query.filter(Role.tenant_id == tenant_id)
    roles = query.offset(skip).limit(limit).all()
    return roles


@router.get("/{role_id}", response_model=RoleResponse)
def get_role(role_id: str, db: Session = Depends(get_db)):
    """Get a role by ID"""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("", response_model=RoleResponse, status_code=201)
def create_role(role: RoleCreate, db: Session = Depends(get_db)):
    """Create a new role"""
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == role.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    db_role = Role(
        id=str(uuid.uuid4()),
        name=role.name,
        tenant_id=role.tenant_id
    )
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(role_id: str, role: RoleUpdate, db: Session = Depends(get_db)):
    """Update a role"""
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Verify tenant exists if being updated
    if role.tenant_id and role.tenant_id != db_role.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == role.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        db_role.tenant_id = role.tenant_id
    
    if role.name is not None:
        db_role.name = role.name
    
    db.commit()
    db.refresh(db_role)
    return db_role


@router.delete("/{role_id}", status_code=204)
def delete_role(role_id: str, db: Session = Depends(get_db)):
    """Delete a role"""
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    db.delete(db_role)
    db.commit()
    return None
