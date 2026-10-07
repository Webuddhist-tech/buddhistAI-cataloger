from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Union, Literal
import requests
import os
from fast_antx.core import transfer
from dotenv import load_dotenv

load_dotenv(override=True)

router = APIRouter()

API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")


class Span(BaseModel):
    start: int
    end: int


class AlignmentAnnotationItem(BaseModel):
    id: str
    span: Span
    index: int
    alignment_index: List[int]


class TargetAnnotationItem(BaseModel):
    id: str
    span: Span
    index: int


class SegmentationAnnotationItem(BaseModel):
    id: str
    span: Span
    reference: Optional[str] = None


class AlignmentAnnotationData(BaseModel):
    alignment_annotation: List[AlignmentAnnotationItem]
    target_annotation: List[TargetAnnotationItem]


class UpdateAlignmentAnnotationItem(BaseModel):
    span: Span
    index: int
    alignment_index: List[int]


class UpdateTargetAnnotationItem(BaseModel):
    span: Span
    index: int


class UpdateAlignmentAnnotationData(BaseModel):
    alignment_annotation: List[UpdateAlignmentAnnotationItem]
    target_annotation: List[UpdateTargetAnnotationItem]


class UpdateSegmentationAnnotationItem(BaseModel):
    span: Span


class UpdateSegmentationAnnotationData(BaseModel):
    annotations: List[UpdateSegmentationAnnotationItem]


class UpdateAnnotation(BaseModel):
    type: str
    data: Union[UpdateAlignmentAnnotationData, UpdateSegmentationAnnotationData]


# Models for POST (create annotation)
class CreateAlignmentTargetAnnotationItem(BaseModel):
    span: Span
    index: int


class CreateAlignmentAnnotationItem(BaseModel):
    span: Span
    index: int
    alignment_index: List[int]


class CreateAlignmentAnnotation(BaseModel):
    type: Literal["alignment"]
    target_manifestation_id: str
    target_annotation: List[CreateAlignmentTargetAnnotationItem]
    alignment_annotation: List[CreateAlignmentAnnotationItem]


class CreateSegmentationAnnotationItem(BaseModel):
    span: Span


class CreateSegmentationAnnotation(BaseModel):
    type: Literal["segmentation"]
    annotation: List[CreateSegmentationAnnotationItem]


class CreateTableOfContentsAnnotationItem(BaseModel):
    title: str
    segments: List[str]


class CreateTableOfContentsAnnotation(BaseModel):
    type: Literal["table_of_contents"]
    annotation: List[CreateTableOfContentsAnnotationItem]

class CleanAnnotationRequest(BaseModel):
    text: str
    sample_text: str

CreateAnnotation = Union[CreateAlignmentAnnotation, CreateSegmentationAnnotation, CreateTableOfContentsAnnotation]


class AnnotationResponse(BaseModel):
    id: str
    type: str
    data: Union[AlignmentAnnotationData, List[SegmentationAnnotationItem], None] = None


@router.get("/{annotation_id}")
def get_annotation(annotation_id: str):
    """Get annotation by ID"""
    response = requests.get(f"{API_ENDPOINT}/annotations/{annotation_id}")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()




@router.put("/{annotation_id}/annotation")
def update_annotation(annotation_id: str, annotation: UpdateAnnotation):
    """Update an annotation by ID"""
    response = requests.put(
        f"{API_ENDPOINT}/annotations/{annotation_id}/annotation", 
        json=annotation.dict()
    )
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()

@router.post("/{instance_id}/annotation")
def create_annotation(instance_id: str, annotation: CreateAnnotation):
    """Create an annotation for a specific instance"""
    response = requests.post(
        f"{API_ENDPOINT}/annotations/{instance_id}/annotation", 
        json=annotation.dict()
    )
    if response.status_code != 201:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()



@router.post("/clean-annotation",  status_code=201)
def clean_annotation(request: CleanAnnotationRequest):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        #  function takes text, samplet text
        annotation_list = []
        text_content = request.text.replace('\n', '')
        #  use the annotation from sample text to generate the annotation for the new text 
        # sample text is the text thats being used to get the line breaks, base text is the text thats being annotated
        try:
            annotation_list = generate_clean_annotation(text_content, request.sample_text)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error generating clean annotation: {str(e)}"
            )
        #  return the annoation list
        return annotation_list
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


def generate_clean_annotation(base_text: str, sample_text: str):
    #  function takes text, samplet text
    #  use the annotation from sample text to generate the annotation for the new text
    #  return the annoation list
    patterns = [
        ["newlines", r"(\n)"],  # Transfer newlines from sample_text to text
    ]
    annotated_text = transfer(sample_text, patterns, base_text, "txt")
    return annotated_text
