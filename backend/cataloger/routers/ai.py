"""
AI router for text analysis and detection endpoints.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, List
from cataloger.controller.ai import (
    generate_title_author,
)

router = APIRouter()


class TextEndingDetectionRequest(BaseModel):
    content: str = Field(..., description="The text content to analyze for text endings")
    segment_id: str = Field(..., description="The segment ID to associate segments with")


class ContentRequest(BaseModel):
    content: str = Field(..., description="The text content to analyze for title and author")


class TitleAuthorResponse(BaseModel):
    title: Optional[str] = Field(None, description="Extracted title from the content if explicitly mentioned")
    suggested_title: Optional[str] = Field(None, description="Suggested title if not found in content, in the same language as the content")
    author: Optional[str] = Field(None, description="Extracted author name from the content if explicitly mentioned")
    suggested_author: Optional[str] = Field(None, description="Suggested author name if not found in content, in the same language as the content")


class TitleOnlyResponse(BaseModel):
    title: Optional[str] = Field(None, description="Extracted title from the start of the text")
    suggested_title: Optional[str] = Field(None, description="Suggested title from the opening lines")


class AuthorOnlyResponse(BaseModel):
    author: Optional[str] = Field(None, description="Extracted author from the end of the text")
    suggested_author: Optional[str] = Field(None, description="Suggested author from closing lines / colophon")


class TextEndingDetectionResponse(BaseModel):
    starting_positions: List[int] = Field(..., description="List of character positions where each text segment starts (after detected endings)")
    total_segments: int = Field(..., description="Total number of detected text segments")


class ParseTocResponse(BaseModel):
    is_toc: bool = Field(..., description="Whether the text is recognized as a table of contents")
    entries: List[str] = Field(default_factory=list, description="TOC lines/items when is_toc is true")


class ParseTocRequest(BaseModel):
    content: str = Field(..., description="Text to analyze as a possible table of contents")
    document_id: Optional[str] = Field(
        None,
        description="If set, persist entries on this outliner document (clear when not a TOC)",
    )


class SegmentCreationResponse(BaseModel):
    message: str = Field(..., description="Success message")
    segments_created: int = Field(..., description="Number of segments created")
    segment_ids: List[str] = Field(..., description="List of created segment IDs")




@router.post("/generate-title-author", response_model=TitleAuthorResponse)
def generate_title_author_route(request: ContentRequest):
    """
    Generate or extract title and author from text content.
    
    Analyzes the beginning and end of the content to extract or suggest
    title and author information in the same language as the content.
    """
    result = generate_title_author(request.content, TitleAuthorResponse)
    # Handle both dict and TitleAuthorResponse instance returns
    if isinstance(result, TitleAuthorResponse):
        return result
    return TitleAuthorResponse(**result)





