from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from core.database import get_db
from settings.models.tenant_settings import TenantSettings
from settings.models.tenant import Tenant

router = APIRouter()


class TenantSettingsCreate(BaseModel):
    tenant_id: str
    brand_icon_url: Optional[str] = None
    brand_primary_color: Optional[str] = None
    brand_secondary_color: Optional[str] = None


class TenantSettingsUpdate(BaseModel):
    brand_icon_url: Optional[str] = None
    brand_primary_color: Optional[str] = None
    brand_secondary_color: Optional[str] = None


class TenantSettingsResponse(BaseModel):
    id: str
    tenant_id: str
    brand_icon_url: Optional[str]
    brand_primary_color: Optional[str]
    brand_secondary_color: Optional[str]

    class Config:
        from_attributes = True


@router.get("", response_model=List[TenantSettingsResponse])
def get_tenant_settings(skip: int = 0, limit: int = 100, tenant_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all tenant settings, optionally filtered by tenant_id"""
    query = db.query(TenantSettings)
    if tenant_id:
        query = query.filter(TenantSettings.tenant_id == tenant_id)
    settings = query.offset(skip).limit(limit).all()
    return settings


@router.get("/{settings_id}", response_model=TenantSettingsResponse)
def get_tenant_setting(settings_id: str, db: Session = Depends(get_db)):
    """Get tenant settings by ID"""
    settings = db.query(TenantSettings).filter(TenantSettings.id == settings_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Tenant settings not found")
    return settings


@router.get("/tenant/{tenant_id}", response_model=TenantSettingsResponse)
def get_tenant_setting_by_tenant(tenant_id: str, db: Session = Depends(get_db)):
    """Get tenant settings by tenant ID"""
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Tenant settings not found for this tenant")
    return settings


@router.post("", response_model=TenantSettingsResponse, status_code=201)
def create_tenant_settings(settings: TenantSettingsCreate, db: Session = Depends(get_db)):
    """Create new tenant settings"""
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == settings.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Check if settings already exist for this tenant
    existing = db.query(TenantSettings).filter(TenantSettings.tenant_id == settings.tenant_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant settings already exist for this tenant")
    
    db_settings = TenantSettings(
        id=str(uuid.uuid4()),
        tenant_id=settings.tenant_id,
        brand_icon_url=settings.brand_icon_url,
        brand_primary_color=settings.brand_primary_color,
        brand_secondary_color=settings.brand_secondary_color
    )
    db.add(db_settings)
    db.commit()
    db.refresh(db_settings)
    return db_settings


@router.put("/{settings_id}", response_model=TenantSettingsResponse)
def update_tenant_settings(settings_id: str, settings: TenantSettingsUpdate, db: Session = Depends(get_db)):
    """Update tenant settings"""
    db_settings = db.query(TenantSettings).filter(TenantSettings.id == settings_id).first()
    if not db_settings:
        raise HTTPException(status_code=404, detail="Tenant settings not found")
    
    if settings.brand_icon_url is not None:
        db_settings.brand_icon_url = settings.brand_icon_url
    
    if settings.brand_primary_color is not None:
        db_settings.brand_primary_color = settings.brand_primary_color
    
    if settings.brand_secondary_color is not None:
        db_settings.brand_secondary_color = settings.brand_secondary_color
    
    db.commit()
    db.refresh(db_settings)
    return db_settings


@router.delete("/{settings_id}", status_code=204)
def delete_tenant_settings(settings_id: str, db: Session = Depends(get_db)):
    """Delete tenant settings"""
    db_settings = db.query(TenantSettings).filter(TenantSettings.id == settings_id).first()
    if not db_settings:
        raise HTTPException(status_code=404, detail="Tenant settings not found")
    
    db.delete(db_settings)
    db.commit()
    return None
