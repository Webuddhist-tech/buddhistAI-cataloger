"""Import outline.csv + issue.json pairs into the Outline Fixer from a folder.

Same import as the admin page's upload, for loading batches without the UI. Every .csv,
.json and .zip under the folder is read; pairs are matched by W id, so folder layout and
file names do not matter.

    cd backend
    python scripts/import_outline_fix.py --batch batch-1 /path/to/folder
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(override=True)

from core.database import SessionLocal  # noqa: E402
from outline_fix.service import import_pairs  # noqa: E402

# Load every model the User mapper refers to; run standalone, nothing else imports them.
import settings.models.membership  # noqa: E402,F401
import settings.models.permission  # noqa: E402,F401
import settings.models.role  # noqa: E402,F401
import settings.models.tenant  # noqa: E402,F401
import settings.models.tenant_settings  # noqa: E402,F401
import outliner.models.outliner  # noqa: E402,F401


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--batch", required=True, help="batch id to file the works under")
    args = parser.parse_args()

    files = [
        (str(p.relative_to(args.folder)), p.read_bytes())
        for p in sorted(args.folder.rglob("*"))
        if p.is_file() and p.suffix.lower() in (".csv", ".json", ".zip")
    ]
    db = SessionLocal()
    try:
        result = import_pairs(db, args.batch, files)
    finally:
        db.close()

    print(f"batch {result.batch_id}: {len(result.created)} created, "
          f"{len(result.skipped_existing)} already imported, "
          f"{len(result.ignored)} exported *_outline.csv ignored, {len(result.errors)} errors")
    for w_id in result.skipped_existing:
        print(f"  already imported: {w_id}")
    for error in result.errors:
        print(f"  error: {error}")


if __name__ == "__main__":
    main()
