from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def csv_rows(path: Path) -> int:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def main() -> None:
    manifest = json.loads((ROOT / "bms_artifact_manifest.json").read_text(encoding="utf-8"))
    for relative, expected in manifest["sha256"].items():
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size == 0:
            raise SystemExit(f"Missing or empty BMS artifact: {relative}")
        actual = sha256(path)
        if actual != expected:
            raise SystemExit(f"BMS artifact checksum mismatch: {relative}")

    expected_counts = {
        "nifty500_bms_v1_results.csv": 1431,
        "nifty500_bms_v1_product_view_final.csv": 477,
        "final_validation/nifty500_bms_v1_fundamentals.csv": 8772,
    }
    for relative, expected in expected_counts.items():
        actual = csv_rows(ROOT / relative)
        if actual != expected:
            raise SystemExit(
                f"BMS artifact row-count mismatch: {relative} has {actual}, expected {expected}"
            )

    connection = sqlite3.connect(ROOT / "nifty500_bms_v1_candidate.db")
    try:
        company_count = connection.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        change_count = connection.execute("SELECT COUNT(*) FROM change_records").fetchone()[0]
    finally:
        connection.close()
    if company_count != 477 or change_count != 4058:
        raise SystemExit(
            "BMS database content mismatch: "
            f"companies={company_count}, change_records={change_count}"
        )

    print("BMS artifacts verified: 477 companies and frozen baseline restored.")


if __name__ == "__main__":
    main()
