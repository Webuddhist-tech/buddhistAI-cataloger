from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from core.database import get_db
from settings.models.tenant import Tenant

router = APIRouter()


class TenantCreate(BaseModel):
    domain: str
    brand_name: str


class TenantUpdate(BaseModel):
    domain: Optional[str] = None
    brand_name: Optional[str] = None


class TenantResponse(BaseModel):
    id: str
    domain: str
    brand_name: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[TenantResponse])
def get_tenants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all tenants"""
    tenants = db.query(Tenant).offset(skip).limit(limit).all()
    return tenants


class TenantSettingsResponse(BaseModel):
    id: str
    domain: str
    brand_name: str
    created_at: datetime
    settings: Optional[dict] = None  # or you can type this more specifically

    class Config:
        from_attributes = True

@router.get("/by-domain/{domain}", response_model=TenantSettingsResponse)
def get_tenant_by_domain(domain: str, db: Session = Depends(get_db)):
    """Get a tenant by domain, with its settings if exist"""
    tenant = db.query(Tenant).filter(Tenant.domain == domain).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    settings = tenant.settings
    settings_dict = None
    if settings:
        settings_dict = {
            "id": settings.id,
            "tenant_id": settings.tenant_id,
            "brand_icon_url": settings.brand_icon_url,
            "brand_primary_color": settings.brand_primary_color,
            "brand_secondary_color": settings.brand_secondary_color,
        }
    return {
        "id": tenant.id,
        "domain": tenant.domain,
        "brand_name": tenant.brand_name,
        "created_at": tenant.created_at,
        "settings": settings_dict
    }


@router.get("/{tenant_id}", response_model=TenantSettingsResponse)
def get_tenant(tenant_id: str, db: Session = Depends(get_db)):
    """Get a tenant by ID, with its settings if exist"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    settings = tenant.settings
    settings_dict = None
    if settings:
        settings_dict = {
            "id": settings.id,
            "tenant_id": settings.tenant_id,
            "brand_icon_url": settings.brand_icon_url,
            "brand_primary_color": settings.brand_primary_color,
            "brand_secondary_color": settings.brand_secondary_color,
        }
    return {
        "id": tenant.id,
        "domain": tenant.domain,
        "brand_name": tenant.brand_name,
        "created_at": tenant.created_at,
        "settings": settings_dict
    }


@router.post("", response_model=TenantResponse, status_code=201)
def create_tenant(tenant: TenantCreate, db: Session = Depends(get_db)):
    """Create a new tenant"""
    # Check if domain already exists
    existing = db.query(Tenant).filter(Tenant.domain == tenant.domain).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant with this domain already exists")
    
    db_tenant = Tenant(
        id=str(uuid.uuid4()),
        domain=tenant.domain,
        brand_name=tenant.brand_name,
        created_at=datetime.utcnow()
    )
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.put("/{tenant_id}", response_model=TenantResponse)
def update_tenant(tenant_id: str, tenant: TenantUpdate, db: Session = Depends(get_db)):
    """Update a tenant"""
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Check if domain is being updated and if it conflicts
    if tenant.domain and tenant.domain != db_tenant.domain:
        existing = db.query(Tenant).filter(Tenant.domain == tenant.domain).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tenant with this domain already exists")
        db_tenant.domain = tenant.domain
    
    if tenant.brand_name is not None:
        db_tenant.brand_name = tenant.brand_name
    
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.delete("/{tenant_id}", status_code=204)
def delete_tenant(tenant_id: str, db: Session = Depends(get_db)):
    """Delete a tenant"""
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    db.delete(db_tenant)
    db.commit()
    return None
