"""Tag existing outliner documents with the group whose batch they belong to.

Documents assigned before groups existed have no ``group_id``, so any reviewer can review
them. For each group linked to a batch, this lists the batch's volumes from BDRC and sets
``group_id``/``batch_id`` on documents whose filename (BDRC volume id) is in it. Documents
that already have a group are left alone. Run again after linking a group to a batch that
already has documents (e.g. imported ones).

    cd backend
    python -m scripts.backfill_document_groups            # dry run: counts only
    python -m scripts.backfill_document_groups --apply
"""

import argparse
import asyncio
from typing import List

from bdrc.volume import aclose_http_client, get_volumes
from core.database import SessionLocal
from outliner.models.document import OutlinerDocument
from outliner.repository import group as group_repo

# Load every model the User mapper refers to; run standalone, nothing else imports them.
import settings.models.membership  # noqa: F401
import settings.models.permission  # noqa: F401
import settings.models.role  # noqa: F401
import settings.models.tenant  # noqa: F401
import settings.models.tenant_settings  # noqa: F401
import outliner.models.outliner  # noqa: F401

STATUSES = ("active", "in_progress", "in_review", "reviewed", "skipped")
PAGE = 200


async def batch_volume_ids(batch_id: str) -> List[str]:
    ids: List[str] = []
    for status in STATUSES:
        offset = 0
        while True:
            page = await get_volumes(status=status, batch_id=batch_id, offset=offset, limit=PAGE)
            items = page.get("items") or []
            ids.extend(v["id"] for v in items)
            offset += len(items)
            if not items or offset >= (page.get("total") or 0):
                break
    return ids


async def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        for group in group_repo.list_groups(db):
            if not group.batch_id:
                print(f"{group.name}: no batch, skipped")
                continue
            volume_ids = await batch_volume_ids(group.batch_id)
            untagged = (
                db.query(OutlinerDocument)
                .filter(OutlinerDocument.filename.in_(volume_ids), OutlinerDocument.group_id.is_(None))
                .count()
                if volume_ids
                else 0
            )
            print(f"{group.name} ({group.batch_id}): {len(volume_ids)} volumes, {untagged} untagged documents")
            if apply:
                group_repo.tag_documents_with_group(db, group, volume_ids)
        if apply:
            db.commit()
            print("Applied.")
        else:
            print("Dry run; pass --apply to write.")
    finally:
        db.close()
        await aclose_http_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    asyncio.run(main(parser.parse_args().apply))
