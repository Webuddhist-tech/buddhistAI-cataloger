from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import requests
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")

class PersonName(BaseModel):
    en: Optional[str] = None
    bo: Optional[str] = None

class AltNames(BaseModel):
    en: Optional[str] = None
    bo: Optional[str] = None


class Person(BaseModel):
    id: str
    name: PersonName
    alt_names: Optional[List[AltNames]] = []
    bdrc: Optional[str] = None
    wiki: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class PersonResponse(BaseModel):
    results: List[Person]
    count: int
    limit: int
    offset: int

class CreatePerson(BaseModel):
    name: PersonName
    alt_names: List[AltNames] = []
    bdrc: Optional[str] = ""
    wiki: Optional[str] = ""

class CreatePersonResponse(BaseModel):
    message: str
    id: str = Field(alias="_id")
    
    class Config:
        populate_by_name = True


@router.get("", response_model=List[Person])
def get_persons(
    limit: int = 100,
    offset: int = 0,
):
    params = {
        "limit": limit,
        "offset": offset,
    }
    
    response = requests.get(f"{API_ENDPOINT}/persons", params=params)
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()

@router.get("/{id}", response_model=Person)
def get_person(id: str):
    response = requests.get(f"{API_ENDPOINT}/persons/{id}")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()

@router.post("", response_model=CreatePersonResponse, status_code=201)
def create_person(person: CreatePerson):
    # Convert to dict, excluding None values
    payload = person.model_dump(exclude_none=True)
    response = requests.post(f"{API_ENDPOINT}/persons", json=payload)
    if response.status_code != 201:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()
