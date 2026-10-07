from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import requests
import os
from dotenv import load_dotenv

load_dotenv(override=True)

router = APIRouter()

API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")


class Span(BaseModel):
    start: int
    end: int


class PreparedDataResponse(BaseModel):
    source_text: str
    target_text: str
    has_alignment: bool
    annotation_id: Optional[str] = None
    annotation: Optional[Dict[str, Any]] = None
    source_segmentation: Optional[List[Dict[str, Any]]] = None
    target_segmentation: Optional[List[Dict[str, Any]]] = None


def apply_segmentation(text: str, segmentation_data: List[Dict[str, Any]]) -> str:
    """Apply segmentation to text by inserting newlines at segment boundaries"""
    if not segmentation_data or len(segmentation_data) == 0:
        return text
    
    # Sort annotations by span start position
    sorted_annotations = sorted(
        segmentation_data,
        key=lambda x: x.get("span", {}).get("start", 0)
    )
    
    # Extract each segment and join with newlines
    segments = []
    for annotation in sorted_annotations:
        span = annotation.get("span", {})
        if not span:
            continue
        start = span.get("start", 0)
        end = span.get("end", len(text))
        if start < len(text) and end <= len(text) and start < end:
            segments.append(text[start:end])
    
    return "\n".join(segments) if segments else text


def reconstruct_segments(
    target_annotation: List[Dict[str, Any]],
    alignment_annotation: List[Dict[str, Any]],
    source_text: str,
    target_text: str
) -> tuple[List[str], List[str]]:
    """Reconstruct segments from alignment annotations"""
    # Sort target annotations by index, fallback to span start if index missing
    sorted_target = sorted(
        target_annotation,
        key=lambda x: x.get("index", x.get("span", {}).get("start", 0))
    )
    
    # Sort alignment annotations by index, fallback to span start if index missing
    sorted_alignment = sorted(
        alignment_annotation,
        key=lambda x: x.get("index", x.get("span", {}).get("start", 0))
    )
    
    # Reconstruct source segments from alignment annotations
    source_segments = []
    for align_ann in sorted_alignment:
        span = align_ann.get("span", {})
        if not span:
            continue
        start = span.get("start", 0)
        end = span.get("end", len(source_text))
        if start < len(source_text) and end <= len(source_text) and start < end:
            source_segments.append(source_text[start:end])
    
    # Reconstruct target segments from target annotations
    target_segments = []
    for target_ann in sorted_target:
        span = target_ann.get("span", {})
        if not span:
            continue
        start = span.get("start", 0)
        end = span.get("end", len(target_text))
        if start < len(target_text) and end <= len(target_text) and start < end:
            target_segments.append(target_text[start:end])
    
    return source_segments, target_segments


def prepare_data(source_instance_id: str, target_instance_id: str) -> Dict[str, Any]:
    """Prepare data by fetching instances, checking related instances first for alignment,
    then falling back to segmentation annotations if no alignment exists"""
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500,
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        # Fetch source instance
        source_response = requests.get(
            f"{API_ENDPOINT}/instances/{source_instance_id}",
            params={"annotation": "true", "content": "true"},
            timeout=30
        )
        if source_response.status_code != 200:
            raise HTTPException(
                status_code=source_response.status_code,
                detail=f"Error fetching source instance: {source_response.text}"
            )
        source_instance = source_response.json()
        
        # Fetch target instance
        target_response = requests.get(
            f"{API_ENDPOINT}/instances/{target_instance_id}",
            params={"annotation": "true", "content": "true"},
            timeout=30
        )
        if target_response.status_code != 200:
            raise HTTPException(
                status_code=target_response.status_code,
                detail=f"Error fetching target instance: {target_response.text}"
            )
        target_instance = target_response.json()
        
        source_text = source_instance.get("content", "")
        target_text = target_instance.get("content", "")
        
        has_alignment = False
        annotation_data = None
        
        # Step 1: Check for related instance relationship first
        # Check if target is in source's related instances (or vice versa)
        related_response = requests.get(
            f"{API_ENDPOINT}/instances/{source_instance_id}/related",
            timeout=30
        )
        
        alignment_ann_id = None
        if related_response.status_code == 200:
            related_instances = related_response.json()
            # Handle both list and dict with results key
            if isinstance(related_instances, dict) and "results" in related_instances:
                related_instances = related_instances["results"]
            
            # Check if target_instance_id is in related instances and has annotation
            for related in related_instances:
                if isinstance(related, dict):
                    related_id = related.get("instance_id")
                    if related_id == target_instance_id:
                        # Found relationship, check for annotation
                        alignment_ann_id = related.get("annotation")
                        if alignment_ann_id:
                            break
        
        # Step 2: If no annotation from related check, check alignment_targets field
        if not alignment_ann_id:
            alignment_targets = source_instance.get("alignment_targets", [])
            if isinstance(alignment_targets, list) and target_instance_id in alignment_targets:
                # Check source annotations for alignment type
                source_annotations = source_instance.get("annotations", [])
                for ann in source_annotations:
                    if ann.get("type") == "alignment":
                        alignment_ann_id = ann.get("annotation_id")
                        break
        
        # Step 3: If still no alignment annotation ID, check annotations directly
        if not alignment_ann_id:
            source_annotations = source_instance.get("annotations", [])
            for ann in source_annotations:
                if ann.get("type") == "alignment":
                    alignment_ann_id = ann.get("annotation_id")
                    break
        
        # Step 4: Fetch alignment annotation if found
        if alignment_ann_id:
            alignment_response = requests.get(
                f"{API_ENDPOINT}/annotations/{alignment_ann_id}",
                timeout=30
            )
            if alignment_response.status_code == 200:
                alignment_data = alignment_response.json()
                annotation_data = alignment_data.get("data")
                if (
                    annotation_data
                    and isinstance(annotation_data.get("target_annotation"), list)
                    and isinstance(annotation_data.get("alignment_annotation"), list)
                    and len(annotation_data.get("target_annotation", [])) > 0
                    and len(annotation_data.get("alignment_annotation", [])) > 0
                ):
                    has_alignment = True
        
        # Step 5: Fetch segmentation annotations if no alignment exists
        source_segmentation_data = None
        target_segmentation_data = None
        
        if not has_alignment:
            # Find segmentation annotation for source
            source_annotations = source_instance.get("annotations", [])
            source_seg_ann_ref = None
            for ann in source_annotations:
                if ann.get("type") == "segmentation":
                    source_seg_ann_ref = ann
                    break
            
            if source_seg_ann_ref:
                source_seg_ann_id = source_seg_ann_ref.get("annotation_id")
                if source_seg_ann_id:
                    source_seg_response = requests.get(
                        f"{API_ENDPOINT}/annotations/{source_seg_ann_id}",
                        timeout=30
                    )
                    if source_seg_response.status_code == 200:
                        source_seg_data = source_seg_response.json()
                        source_segmentation_data = source_seg_data.get("data")
            
            # Find segmentation annotation for target
            target_annotations = target_instance.get("annotations", [])
            target_seg_ann_ref = None
            for ann in target_annotations:
                if ann.get("type") == "segmentation":
                    target_seg_ann_ref = ann
                    break
            
            if target_seg_ann_ref:
                target_seg_ann_id = target_seg_ann_ref.get("annotation_id")
                if target_seg_ann_id:
                    target_seg_response = requests.get(
                        f"{API_ENDPOINT}/annotations/{target_seg_ann_id}",
                        timeout=30
                    )
                    if target_seg_response.status_code == 200:
                        target_seg_data = target_seg_response.json()
                        target_segmentation_data = target_seg_data.get("data")
        
        return {
            "source_text": source_text,
            "target_text": target_text,
            "has_alignment": has_alignment,
            "annotation_id": alignment_ann_id,
            "annotation": annotation_data,
            "source_segmentation_data": source_segmentation_data,
            "target_segmentation_data": target_segmentation_data,
        }
    
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


@router.get("/prepare-alignment-data/{source_instance_id}/{target_instance_id}")
def prepare_alignment_data(
    source_instance_id: str,
    target_instance_id: str
) -> PreparedDataResponse:
    """
    Prepare alignment data by loading texts, checking for alignments,
    and applying segmentation or reconstructing segments.
    
    This endpoint replicates the logic from the frontend useEffect hook that loads
    texts from URL parameters and prepares them for display.
    """
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500,
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try:
        # Prepare data (fetch instances, annotations, etc.)
        prepared_data = prepare_data(source_instance_id, target_instance_id)
        
        source_text = prepared_data["source_text"]
        target_text = prepared_data["target_text"]
        has_alignment = prepared_data["has_alignment"]
        annotation_id = prepared_data.get("annotation_id")
        annotation_data = prepared_data.get("annotation")
        
        
        if has_alignment and annotation_data:
            # Reconstruct segments from alignment annotations
            target_annotation = annotation_data.get("target_annotation", [])
            alignment_annotation = annotation_data.get("alignment_annotation", [])
            
            if (
                target_annotation
                and isinstance(target_annotation, list)
                and alignment_annotation
                and isinstance(alignment_annotation, list)
            ):
                source_segments, target_segments = reconstruct_segments(
                    target_annotation,
                    alignment_annotation,
                    source_text,
                    target_text
                )
                segmented_source_text = "\n".join(source_segments)
                segmented_target_text = "\n".join(target_segments)
        else:
            # Apply segmentation
            source_segmentation = prepared_data.get("source_segmentation_data")
            target_segmentation = prepared_data.get("target_segmentation_data")
            
            if (
                source_segmentation
                and isinstance(source_segmentation, list)
                and len(source_segmentation) > 0
            ):
                segmented_source_text = apply_segmentation(source_text, source_segmentation)
            
            if (
                target_segmentation
                and isinstance(target_segmentation, list)
                and len(target_segmentation) > 0
            ):
                segmented_target_text = apply_segmentation(target_text, target_segmentation)
        
        # Get segmentation data for response
        source_segmentation = None
        target_segmentation = None
        
        if not has_alignment or not annotation_data:
            # If no alignment annotation, return segmentation annotations
            source_segmentation = prepared_data.get("source_segmentation_data")
            target_segmentation = prepared_data.get("target_segmentation_data")
        
        return PreparedDataResponse(
            source_text=source_text,
            target_text=target_text,
            has_alignment=has_alignment,
            annotation_id=annotation_id,
            annotation=annotation_data,
            source_segmentation=source_segmentation,
            target_segmentation=target_segmentation
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error preparing alignment data: {str(e)}"
        )

