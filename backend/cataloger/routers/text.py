from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import requests
import os
from dotenv import load_dotenv


load_dotenv( override=True)

router = APIRouter()

API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")
TRANSLATION_BACKEND_URL = os.getenv("TRANSLATION_BACKEND_URL")

class Contribution(BaseModel):
    person_id: Optional[str] = None
    person_bdrc_id: Optional[str] = None
    person_name: Optional[Dict[str, str]] = None
    ai_id: Optional[str] = None
    role: str

class Text(BaseModel):
    id: str
    type: str
    title: Dict[str, str] = Field(
        ...,
        example={"bo": "དཔེ་མཚོན་ཞིག", "en": "Example Text"},
        description="Title in multiple languages, keyed by language code"
    )
    language: str
    target: Optional[str] = None
    contributions: Optional[List[Contribution]] = None
    date: Optional[str] = None
    bdrc: Optional[str] = None
    wiki: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TextResponse(BaseModel):
    results: List[Text]
    count: int

class CreateTextResponse(BaseModel):
    message: str
    id: str

class CreateText(BaseModel):
    type: str
    title: Dict[str, str] = Field(
        ...,
        example={"bo": "དཔེ་མཚོན་ཞིག", "en": "Example Text"},
        description="Title in multiple languages, keyed by language code"
    )
    language: str
    contributions:List[Contribution] = []
    target: Optional[str] = None
    date: Optional[str] = None
    bdrc: Optional[str] = None
    category_id: Optional[str] = None
    alt_titles: List[Dict[str, str]] = Field(
        default=[],
        example=[{"bo": "མཚན་གཞན", "en": "Alternative Title"}],
        description="Alternative titles in multiple languages"
    )
    copyright: Optional[str] = None
    license: Optional[str] = None


class UpdateText(BaseModel):
    title: Optional[Dict[str, str]] = None
    bdrc: Optional[str] = None
    wiki: Optional[str] = None
    copyright: Optional[str] = None
    license: Optional[str] = None
    contributions: Optional[List[Contribution]] = None
    date: Optional[str] = None
    alt_title: Optional[Dict[str, List[str]]] = None

class Annotation(BaseModel):
    annotation_id: str
    type: str

class BibliographyAnnotation(BaseModel):
    span: Dict[str, int] = Field(
        ...,
        example={"start": 0, "end": 100},
        description="Text span with start and end positions"
    )
    type: str = Field(
        ...,
        example="title",
        description="Annotation type: citation, reference, title, colophon, incipit, person"
    )

class InstanceMetadata(BaseModel):
    id: str
    type: str
    copyright: str
    bdrc: Optional[str] = None
    wiki: Optional[str] = None
    colophon: Optional[str] = None
    incipit_title: Optional[Dict[str, str]] = Field(
        default=None,
        example={"bo": "མགོ་ཚིག", "en": "Incipit Title"},
        description="Incipit title in multiple languages"
    )
    alt_incipit_titles: Optional[List[Dict[str, str]]] = Field(
        default=None,
        example=[{"bo": "མགོ་ཚིག་གཞན", "en": "Alternative Incipit"}],
        description="Alternative incipit titles in multiple languages"
    )

class Instance(BaseModel):
    content: Optional[str] = None
    metadata: Optional[InstanceMetadata] = None
    annotations: Optional[List[Annotation]] = None
    biblography_annotation: Optional[List[BibliographyAnnotation]] = None

class InstanceListItem(BaseModel):
    id: str
    type: str
    source: Optional[str] = None
    bdrc: Optional[str] = None
    wiki: Optional[str] = None
    colophon: Optional[str] = None
    incipit_title: Optional[Dict[str, str]] = Field(
        default=None,
        example={"bo": "མགོ་ཚིག", "en": "Incipit Title"},
        description="Incipit title in multiple languages"
    )
    alt_incipit_titles: Optional[List[Dict[str, str]]] = Field(
        default=None,
        example=[{"bo": "མགོ་ཚིག་གཞན", "en": "Alternative Incipit"}],
        description="Alternative incipit titles in multiple languages"
    )

class CreateInstance(BaseModel):
    metadata: Dict[str, Any]
    annotation: List[Dict[str, Any]]
    biblography_annotation: Optional[List[BibliographyAnnotation]] = None
    content: str
    user: Optional[str] = None
    
class UpdateInstance(BaseModel):
    metadata: Dict[str, Any]
    annotation: List[Dict[str, Any]]
    biblography_annotation: Optional[List[BibliographyAnnotation]] = None
    content: str
    user: Optional[str] = None

class CreateInstanceResponse(BaseModel):
    message: str
    id: str





@router.get("")
def get_texts(
    limit: int = 30,
    offset: int = 0,
    language: Optional[str] = None,
    author: Optional[str] = None,
    type: Optional[Literal["root", "commentary", "translation", "translation_source", "none"]] = Query(
        None,
        description="Filter by text type"
    ),
    title: Optional[str] = None,
):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        params = {
            "limit": limit,
            "offset": offset,
            "language": language,
            "author": author,
            "type": type,
            "title": title,
        }
        params = {k: v for k, v in params.items() if v is not None}
        
        url = f"{API_ENDPOINT}/texts"
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )

@router.post("", status_code=201)
def create_text(text: CreateText):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        # Convert to dict, excluding None values
        payload = text.model_dump(exclude_none=True)
        response = requests.post(f"{API_ENDPOINT}/texts", json=payload)
        
        if response.status_code != 201:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )

@router.get("/{id}", response_model=Text)
def get_text(id: str):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        response = requests.get(f"{API_ENDPOINT}/texts/{id}")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )


@router.put("/{id}")
def update_text(id: str, text: UpdateText):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        response = requests.put(f"{API_ENDPOINT}/texts/{id}", json=text.model_dump(exclude_none=True))
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )

@router.get("/{id}/instances")
def get_instances(id: str):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        url = f"{API_ENDPOINT}/texts/{id}/instances"
        response = requests.get(url)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        
        data = response.json()
        
        # Handle both array and {results: [...], count: ...} formats
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        elif isinstance(data, list):
            return data
        else:
            # If it's neither format, return empty list
            return []
    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )

@router.post("/{id}/instances",  status_code=201)
def create_instance(id: str, instance: CreateInstance):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        payload = instance.model_dump(exclude_none=True)
     
        
        payload.pop("user", None)
        response = requests.post(f"{API_ENDPOINT}/texts/{id}/instances", json=payload,timeout=120)
        
        if response.status_code != 201:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        
    
        
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )


@router.put("/instances/{instance_id}", status_code=200)
def update_instance(instance_id: str, instance: UpdateInstance):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        payload = instance.model_dump(exclude_none=True)
        response = requests.put(f"{API_ENDPOINT}/instances/{instance_id}", json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )

@router.get("/instances/{instance_id}")
def get_instance(instance_id: str, annotation: bool = True):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        params = {"annotation": str(annotation).lower(),"content": True}
        response = requests.get(f"{API_ENDPOINT}/instances/{instance_id}", params=params)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to OpenPecha API: {str(e)}"
        )




