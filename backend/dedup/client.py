"""HTTP client for BDRC's dedup review API (``/api/v1/review``).

Contract: outline_tool_backend/doc/review_api/README.md. No application auth on that
API (nginx guards it), so requests carry no credentials.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from core.config import BEC_OTAPI_BASE_URL

logger = logging.getLogger(__name__)

_BASE = f"{BEC_OTAPI_BASE_URL.rstrip('/')}/api/v1/review"
_TIMEOUT_S = 30.0
# Full texts and diffs of long works can take a while to fetch and align.
_SLOW_TIMEOUT_S = 90.0

# BDRC caps item listing at 500 per request.
MAX_PAGE = 500


class ReviewApiError(Exception):
    """BDRC review API call failed. ``status_code`` is BDRC's, or None if unreachable."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def _request(method: str, path: str, *, params: dict | None = None, json: Any = None,
             timeout: float = _TIMEOUT_S) -> Any:
    url = f"{_BASE}{path}"
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.request(
                method, url, params=params, json=json, headers={"accept": "application/json"}
            )
    except httpx.HTTPError as exc:
        raise ReviewApiError(f"BDRC review API unreachable: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text[:500]
        try:
            body = response.json()
            if isinstance(body, dict) and body.get("detail"):
                detail = str(body["detail"])
        except ValueError:
            pass
        raise ReviewApiError(f"BDRC {method} {path} -> {response.status_code}: {detail}",
                             status_code=response.status_code)
    try:
        return response.json()
    except ValueError as exc:
        raise ReviewApiError(f"BDRC {method} {path} returned non-JSON") from exc


def list_batches() -> list[dict[str, Any]]:
    return _request("GET", "/batches")


def get_batch(batch_id: str) -> dict[str, Any]:
    return _request("GET", f"/batches/{batch_id}")


def batch_stats() -> dict[str, dict[str, int]]:
    """Per-batch item counts by status."""
    return _request("GET", "/stats/batches")


def list_items(batch_id: str, *, status: str | None = None, offset: int = 0,
               limit: int = MAX_PAGE) -> dict[str, Any]:
    params: dict[str, Any] = {"offset": offset, "limit": min(limit, MAX_PAGE)}
    if status:
        params["status"] = status
    return _request("GET", f"/batches/{batch_id}/items", params=params)


def get_item(item_id: int) -> dict[str, Any]:
    return _request("GET", f"/items/{item_id}")


def put_item(item_id: int, fields: dict[str, Any]) -> dict[str, Any]:
    """Partial update; only the keys present in ``fields`` are written by BDRC."""
    return _request("PUT", f"/items/{item_id}", json=fields)


def get_text(mw_id: str) -> dict[str, Any]:
    return _request("GET", f"/texts/{mw_id}", timeout=_SLOW_TIMEOUT_S)


def get_diff(a: str, b: str, granularity: str = "syllable") -> dict[str, Any]:
    return _request("GET", "/diff", params={"a": a, "b": b, "granularity": granularity},
                    timeout=_SLOW_TIMEOUT_S)
