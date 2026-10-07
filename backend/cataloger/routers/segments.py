from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import os
from dotenv import load_dotenv

load_dotenv(override=True)

router = APIRouter()

API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")


class UpdateSegmentContentRequest(BaseModel):
    content: str


@router.put("/{segment_id}/content")
def update_segment_content(segment_id: str, request: UpdateSegmentContentRequest):
    """Update segment content by segment ID"""
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500,
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    url = f"{API_ENDPOINT}/segments/{segment_id}/content"
    headers = {
        "accept": "application/json",
        "Content-Type": "application/json"
    }
    try:
        response = requests.put(
            url,
            headers=headers,
            json={"content": request.content},
            timeout=30
        )
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
