"""
BMS V1 controlled publication safeguard.

Publication is deliberately separate from calculation.

Safety rules:
- Never calculate BMS here.
- Never publish without explicit --publish.
- Candidate and production schemas must match.
- Candidate must contain the expected company universe.
- Production is backed up before replacement.
- Replacement is atomic.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd


BASE = Path(__file__).resolve().parent

CANDIDATE = BASE / "bms_quarterly_candidate.csv"
PRODUCTION = BASE / "final_validation" / "tcs_events.csv"
BACKUP_DIR = BASE / "final_validation" / "bms_backups"

EXPECTED_COMPANIES = 154


def stop(message: str) -> None:
    print()
    print("STOP:", message)
    print("Production BMS was NOT modified.")
    sys.exit(1)


def validate() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not CANDIDATE.exists():
        stop(f"Candidate does not exist: {CANDIDATE}")

    if not PRODUCTION.exists():
        stop(f"Production file does not exist: {PRODUCTION}")

    candidate = pd.read_csv(CANDIDATE)
    production = pd.read_csv(PRODUCTION)

    if list(candidate.columns) != list(production.columns):
        stop("Candidate schema does not match production.")

    companies = candidate["symbol"].nunique()

    if companies != EXPECTED_COMPANIES:
        stop(
            f"Candidate contains {companies} companies; "
            f"expected {EXPECTED_COMPANIES}."
        )

    if candidate.empty:
        stop("Candidate is empty.")

    print(f"✓ Candidate companies: {companies}")
    print(f"✓ Candidate observations: {len(candidate)}")
    print("✓ Candidate schema matches production")

    return candidate, production


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--publish",
        action="store_true",
        help="Explicitly publish the validated candidate.",
    )

    args = parser.parse_args()

    print("=" * 70)
    print("BMS V1 CONTROLLED PUBLICATION")
    print("=" * 70)
    print()

    candidate, production = validate()

    same = CANDIDATE.read_bytes() == PRODUCTION.read_bytes()

    print(
        "✓ Candidate is byte-for-byte identical to production"
        if same
        else "NOTICE: Candidate differs from current production"
    )

    print()

    if not args.publish:
        print("=" * 70)
        print("VALIDATION ONLY")
        print("=" * 70)
        print()
        print("No publication performed.")
        print()
        print("To publish deliberately, run:")
        print()
        print("  PYTHONPATH=src .venv/bin/python "
              "bms_publish_candidate.py --publish")
        return

    if same:
        print("=" * 70)
        print("NO PUBLICATION REQUIRED")
        print("=" * 70)
        print()
        print("Candidate and production are already identical.")
        print("Production BMS was not modified.")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    backup = (
        BACKUP_DIR
        / f"tcs_events_before_publish_{timestamp}.csv"
    )

    shutil.copy2(PRODUCTION, backup)

    if backup.read_bytes() != PRODUCTION.read_bytes():
        stop("Backup verification failed.")

    print(f"✓ Verified production backup: {backup}")

    temporary = PRODUCTION.with_suffix(".csv.new")

    shutil.copy2(CANDIDATE, temporary)

    if temporary.read_bytes() != CANDIDATE.read_bytes():
        temporary.unlink(missing_ok=True)
        stop("Temporary publication copy failed verification.")

    temporary.replace(PRODUCTION)

    if PRODUCTION.read_bytes() != CANDIDATE.read_bytes():
        stop(
            "Post-publication verification failed. "
            f"Backup remains at {backup}"
        )

    print("✓ Candidate published atomically")
    print("✓ Published file verified against candidate")

    print()
    print("=" * 70)
    print("PUBLICATION COMPLETE")
    print("=" * 70)
    print()
    print("Backup:")
    print(f"  {backup}")
    print()
    print("Production:")
    print(f"  {PRODUCTION}")


if __name__ == "__main__":
    main()
