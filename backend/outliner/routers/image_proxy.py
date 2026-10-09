"""HTTPS image proxy for the outliner UI (IIIF, reviewer avatars). Host allowlist only.

Optional ``IMAGE_PROXY_BDRC_KEY``: for ``iiif.bdrc.io`` requests, sends
``Authorization: XBdrcKey`` plus the key base64-encoded (same as curl ``echo -n "$KEY" | base64``).
"""

from __future__ import annotations

import base64
import os
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.responses import StreamingResponse

from user.models.user import User

from dedup.deps import require_dedup_access
from outliner.deps import require_outliner_access

router = APIRouter()
_DEFAULT_ALLOWED_HOSTS = (
    "iiif.bdrc.io,googleusercontent.com,avatars.githubusercontent.com"
)
_DEFAULT_MAX_BYTES = 25 * 1024 * 1024
_IIIF_BDRC_HOST_RULES = ("iiif.bdrc.io",)
_DEFAULT_CACHE_SECONDS = 86400


def _bdrc_iiif_authorization_value() -> str | None:
    """Authorization header value for BDRC IIIF (`XBdrcKey` + base64(key)), or None if unset."""
    key = os.getenv("IMAGE_PROXY_BDRC_KEY", "").strip()
    if not key:
        return None
    b64 = base64.b64encode(key.encode("utf-8")).decode("ascii")
    return f"XBdrcKey {b64}"


def _allowed_host_rules() -> list[str]:
    raw = os.getenv("IMAGE_PROXY_ALLOWED_HOSTS", _DEFAULT_ALLOWED_HOSTS)
    return [x.strip().lower().lstrip(".") for x in raw.split(",") if x.strip()]


def _host_matches(hostname: str, rules: list[str]) -> bool:
    h = hostname.lower().rstrip(".")
    for rule in rules:
        if h == rule or h.endswith("." + rule):
            return True
    return False


def _max_bytes() -> int:
    try:
        return int(os.getenv("IMAGE_PROXY_MAX_BYTES", str(_DEFAULT_MAX_BYTES)))
    except ValueError:
        return _DEFAULT_MAX_BYTES


def _is_iiif_info_request(path: str) -> bool:
    """True for IIIF Image API `info.json`, the only non-image response allowed through."""
    return path.rstrip("/").endswith("/info.json")


def _cache_seconds() -> int:
    """Browser cache lifetime for proxied images (0 disables caching)."""
    try:
        return max(
            0, int(os.getenv("IMAGE_PROXY_CACHE_SECONDS", str(_DEFAULT_CACHE_SECONDS)))
        )
    except ValueError:
        return _DEFAULT_CACHE_SECONDS


_image_bearer = HTTPBearer(auto_error=False)


def require_scan_access(
    creds: HTTPAuthorizationCredentials | None = Depends(_image_bearer),
) -> User:
    """Outliner users (image sidebar) or Deduplicator users (scan panel)."""
    try:
        return require_outliner_access(creds)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
    return require_dedup_access(creds)


@router.get("/proxy/image")
async def proxy_external_image(
    url: str = Query(
        ...,
        min_length=8,
        max_length=2048,
        description="Full https URL of an image to fetch",
    ),
    _auth_user: object = Depends(require_scan_access),
):  
    
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(400, detail="Only https URLs are supported")
    host = parsed.hostname
    if not host:
        raise HTTPException(400, detail="Invalid URL")
    netloc_part = url.split("://", 1)[-1].split("/", 1)[0]
    if "@" in netloc_part:
        raise HTTPException(400, detail="Invalid URL")

    rules = _allowed_host_rules()
    if not _host_matches(host, rules):
        raise HTTPException(403, detail="Image host is not allowlisted")

    max_b = _max_bytes()
    headers = {"User-Agent": "CatalogerImageProxy/1.0"}
    auth = _bdrc_iiif_authorization_value()
    if auth and _host_matches(host, list(_IIIF_BDRC_HOST_RULES)):
        headers["Authorization"] = auth

    client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(60.0),
        headers=headers,
    )

    # Not a `with` block: the response must stay open past these checks, so every
    # exit path below closes it and the client explicitly.
    try:
        req = client.build_request("GET", url)
        r = await client.send(req, stream=True)
    except httpx.RequestError as e:
        await client.aclose()
        raise HTTPException(
            status_code=502, detail=f"Could not fetch image: {e!s}"
        ) from e

    async def _fail(status_code: int, detail: str) -> HTTPException:
        await r.aclose()
        await client.aclose()
        return HTTPException(status_code=status_code, detail=detail)

    if r.status_code >= 400:
        raise await _fail(502, "Upstream image request failed")

    cl = r.headers.get("content-length")
    if cl:
        try:
            if int(cl) > max_b:
                raise await _fail(413, "Image too large")
        except ValueError:
            pass

    content_type = r.headers.get("content-type", "image/jpeg")
    ct_main = content_type.split(";")[0].strip().lower()
    # Restricted volumes cannot read info.json from the browser, so it comes through here.
    allows_json = _is_iiif_info_request(parsed.path)
    if ct_main and not (
        ct_main.startswith("image/")
        or ct_main == "application/octet-stream"
        or (allows_json and ct_main == "application/json")
    ):
        raise await _fail(502, "Upstream response is not an image")

    # Read in full before responding: BDRC IIIF usually omits content-length, so the
    # size cap can only be checked while reading. Relaying as bytes arrive would turn
    # an oversize image into a truncated body (a corrupt image) instead of a 413.
    try:
        body_chunks: list[bytes] = []
        body_total = 0
        oversize = False
        async for chunk in r.aiter_bytes():
            body_total += len(chunk)
            if body_total > max_b:
                oversize = True
                break
            body_chunks.append(chunk)
    except httpx.RequestError as e:
        raise await _fail(502, f"Could not fetch image: {e!s}") from e

    if oversize:
        raise await _fail(413, "Image too large")

    await r.aclose()
    await client.aclose()

    async def _iter_body():
        """Emit the validated chunks as-is; avoids b"".join and its second full copy."""
        for chunk in body_chunks:
            yield chunk

    response_headers = {}
    cache_s = _cache_seconds()
    if cache_s > 0:
        # `private`, not `public`: these may be access-restricted upstream and must
        # not land in a shared cache.
        response_headers["Cache-Control"] = f"private, max-age={cache_s}"

    return StreamingResponse(
        _iter_body(),
        media_type=ct_main or "application/octet-stream",
        headers=response_headers,
    )
