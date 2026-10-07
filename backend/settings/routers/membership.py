from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from core.database import get_db
from settings.models.membership import TenantMembership
from user.models.user import User
from settings.models.tenant import Tenant
from settings.models.role import Role

router = APIRouter()


class TenantMembershipCreate(BaseModel):
    user_id: str
    tenant_id: str
    role_id: str


class TenantMembershipUpdate(BaseModel):
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    role_id: Optional[str] = None


class TenantMembershipResponse(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    role_id: str
    joined_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[TenantMembershipResponse])
def get_memberships(
    skip: int = 0, 
    limit: int = 100, 
    user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    role_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all memberships, optionally filtered by user_id, tenant_id, or role_id"""
    query = db.query(TenantMembership)
    if user_id:
        query = query.filter(TenantMembership.user_id == user_id)
    if tenant_id:
        query = query.filter(TenantMembership.tenant_id == tenant_id)
    if role_id:
        query = query.filter(TenantMembership.role_id == role_id)
    memberships = query.offset(skip).limit(limit).all()
    return memberships


@router.get("/{membership_id}", response_model=TenantMembershipResponse)
def get_membership(membership_id: str, db: Session = Depends(get_db)):
    """Get a membership by ID"""
    membership = db.query(TenantMembership).filter(TenantMembership.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    return membership


@router.post("", response_model=TenantMembershipResponse, status_code=201)
def create_membership(membership: TenantMembershipCreate, db: Session = Depends(get_db)):
    """Create a new membership"""
    # Verify user exists
    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Verify role exists
    role = db.query(Role).filter(Role.id == membership.role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Verify role belongs to the tenant
    if role.tenant_id != membership.tenant_id:
        raise HTTPException(status_code=400, detail="Role does not belong to the specified tenant")
    
    db_membership = TenantMembership(
        id=str(uuid.uuid4()),
        user_id=membership.user_id,
        tenant_id=membership.tenant_id,
        role_id=membership.role_id,
        joined_at=datetime.utcnow()
    )
    db.add(db_membership)
    db.commit()
    db.refresh(db_membership)
    return db_membership


@router.put("/{membership_id}", response_model=TenantMembershipResponse)
def update_membership(membership_id: str, membership: TenantMembershipUpdate, db: Session = Depends(get_db)):
    """Update a membership"""
    db_membership = db.query(TenantMembership).filter(TenantMembership.id == membership_id).first()
    if not db_membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Verify user exists if being updated
    if membership.user_id and membership.user_id != db_membership.user_id:
        user = db.query(User).filter(User.id == membership.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db_membership.user_id = membership.user_id
    
    # Verify tenant exists if being updated
    if membership.tenant_id and membership.tenant_id != db_membership.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        db_membership.tenant_id = membership.tenant_id
    
    # Verify role exists if being updated
    if membership.role_id and membership.role_id != db_membership.role_id:
        role = db.query(Role).filter(Role.id == membership.role_id).first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        # Verify role belongs to the tenant
        tenant_id = membership.tenant_id if membership.tenant_id else db_membership.tenant_id
        if role.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Role does not belong to the specified tenant")
        db_membership.role_id = membership.role_id
    
    db.commit()
    db.refresh(db_membership)
    return db_membership


@router.delete("/{membership_id}", status_code=204)
def delete_membership(membership_id: str, db: Session = Depends(get_db)):
    """Delete a membership"""
    db_membership = db.query(TenantMembership).filter(TenantMembership.id == membership_id).first()
    if not db_membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    db.delete(db_membership)
    db.commit()
    return None
