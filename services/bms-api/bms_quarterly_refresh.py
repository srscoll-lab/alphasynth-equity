"""
BMS V1 safe quarterly refresh runner.

PURPOSE
-------
Orchestrates a BMS quarterly calculation without modifying the
production BMS dataset.

SAFETY
------
- Never writes to final_validation/tcs_events.csv
- Uses an isolated temporary SQLite database
- Produces a candidate output only
- Validates inputs before calculation
- Does not change BMS/TCS methodology
"""

from pathlib import Path
import argparse
import os
import shutil
import subprocess
import sys


BASE = Path(__file__).resolve().parent

PRODUCTION_TCS = (
    BASE / "final_validation" / "tcs_events.csv"
)

VALIDATED_IMPORT = (
    BASE / "final_validation" / "validated_import.csv"
)

RECONSTRUCTION_SCRIPT = (
    BASE / "reconstruct_bms_database.py"
)


def stop(message: str) -> None:
    raise SystemExit(f"\nSTOP: {message}\n")


def main() -> None:

    parser = argparse.ArgumentParser(
        description="Safe BMS V1 quarterly refresh"
    )

    parser.add_argument(
        "--quarter",
        required=True,
        help='Quarter to validate, for example "Q3 FY26"',
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform preflight validation only",
    )

    args = parser.parse_args()

    quarter = args.quarter.strip().upper()

    # Import only after repository path is established.
    from stock_intelligence.bms_quarter_config import (
        get_quarter,
    )

    try:
        quarter_config = get_quarter(quarter)
    except ValueError as exc:
        stop(str(exc))

    print("=" * 70)
    print("BMS V1 SAFE QUARTERLY REFRESH")
    print("=" * 70)

    print()
    print("Quarter:", quarter_config.label)
    print("Period end:", quarter_config.period_end_date)
    print("Mode:", "DRY RUN" if args.dry_run else "CANDIDATE")
    print()

    # --------------------------------------------------------
    # FILE PREFLIGHT
    # --------------------------------------------------------

    required = [
        PRODUCTION_TCS,
        VALIDATED_IMPORT,
        RECONSTRUCTION_SCRIPT,
    ]

    for path in required:
        if not path.exists():
            stop(f"Required file missing: {path}")

    print("✓ Required files exist")

    # --------------------------------------------------------
    # INPUT VALIDATION
    # --------------------------------------------------------

    import pandas as pd

    source = pd.read_csv(VALIDATED_IMPORT)

    required_columns = {
        "symbol",
        "metric_name",
        "metric_value",
        "period_label",
        "period_type",
        "comparison_type",
        "period_end_date",
        "unit",
        "source_type",
    }

    missing = required_columns - set(source.columns)

    if missing:
        stop(
            "Validated import is missing columns: "
            + ", ".join(sorted(missing))
        )

    print("✓ Required financial columns present")

    quarter_rows = source[
        source["period_label"]
        .astype(str)
        .str.strip()
        .str.upper()
        == quarter
    ].copy()

    if quarter_rows.empty:
        stop(f"No financial observations found for {quarter}")

    company_count = quarter_rows["symbol"].nunique()

    print(
        f"✓ {quarter}: "
        f"{len(quarter_rows)} financial observations"
    )
    print(
        f"✓ {quarter}: "
        f"{company_count} companies"
    )

    # Current BMS V1 universe is frozen at 154 companies.
    if company_count != 154:
        stop(
            f"Expected 154 companies, found {company_count}"
        )

    duplicate_count = quarter_rows.duplicated(
        subset=[
            "symbol",
            "period_label",
            "metric_name",
        ]
    ).sum()

    if duplicate_count:
        stop(
            f"Found {duplicate_count} duplicate "
            "symbol/period/metric observations"
        )

    print("✓ No duplicate company/period/metric rows")

    invalid_values = quarter_rows[
        "metric_value"
    ].isna().sum()

    if invalid_values:
        stop(
            f"Found {invalid_values} missing metric values"
        )

    print("✓ No missing metric values")

    configured_date = quarter_config.period_end_date

    actual_dates = set(
        quarter_rows["period_end_date"]
        .astype(str)
        .str[:10]
        .unique()
    )

    if actual_dates != {configured_date}:
        stop(
            f"Period-end mismatch. "
            f"Expected {configured_date}; "
            f"found {sorted(actual_dates)}"
        )

    print("✓ Period-end date matches central configuration")

    comparison_types = set(
        quarter_rows["comparison_type"]
        .astype(str)
        .str.strip()
    )

    if comparison_types != {"YoY"}:
        stop(
            "BMS V1 expects YoY comparisons; "
            f"found {sorted(comparison_types)}"
        )

    print("✓ Comparison type is YoY")

    # --------------------------------------------------------
    # PRODUCTION REFERENCE SAFETY
    # --------------------------------------------------------

    production = pd.read_csv(PRODUCTION_TCS)

    if production["symbol"].nunique() != 154:
        stop(
            "Production BMS reference does not contain "
            "154 companies"
        )

    print("✓ Production reference contains 154 companies")
    print(
        f"✓ Production reference contains "
        f"{len(production)} observations"
    )

    print()
    print("=" * 70)
    print("PREFLIGHT PASSED")
    print("=" * 70)

    if args.dry_run:
        print()
        print("No calculation performed.")
        print("No production files modified.")
        return

    # --------------------------------------------------------
    # STAGE 2 — ISOLATED CANDIDATE CALCULATION
    # --------------------------------------------------------

    import hashlib

    candidate_file = (
        BASE / "bms_quarterly_candidate.csv"
    )

    reconstruction_db = (
        BASE / "bms_quarterly_candidate.db"
    )

    # Preserve production reference hash before calculation.
    production_hash_before = hashlib.sha256(
        PRODUCTION_TCS.read_bytes()
    ).hexdigest()

    # Candidate artifacts must start clean.
    for path in [
        candidate_file,
        reconstruction_db,
    ]:
        if path.exists():
            path.unlink()

    print()
    print("=" * 70)
    print("BUILDING ISOLATED BMS V1 CANDIDATE")
    print("=" * 70)
    print()

    # --------------------------------------------------------
    # Rebuild the historically proven isolated database.
    #
    # The reconstruction script has already been independently
    # validated to reproduce BMS V1 exactly.
    # --------------------------------------------------------

    env = os.environ.copy()
    env["PYTHONPATH"] = str(BASE / "src")

    result = subprocess.run(
        [
            str(BASE / ".venv" / "bin" / "python"),
            str(RECONSTRUCTION_SCRIPT),
        ],
        cwd=BASE,
        env=env,
    )

    if result.returncode != 0:
        stop(
            "Historical reconstruction failed. "
            "Production BMS was not modified."
        )

    generated_db = BASE / "bms_reconstruction.db"

    if not generated_db.exists():
        stop(
            "Reconstruction database was not created."
        )

    # Keep the operational candidate under its own name.
    shutil.move(
        generated_db,
        reconstruction_db,
    )

    # --------------------------------------------------------
    # STAGE 3 — COMPLETE INDEPENDENT BMS V1 CALCULATION
    # --------------------------------------------------------

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from stock_intelligence.financial_csv_importer import (
        import_financial_csv,
    )
    from stock_intelligence.models import (
        Company,
        Thesis,
        FinancialObservation,
        ChangeRecord,
        ThesisEvidence,
    )
    from stock_intelligence.evidence_promotion import (
        promote_change_to_evidence,
    )
    from stock_intelligence.tcs_from_evidence import (
        calculate_tcs_from_thesis_evidence,
    )
    from stock_intelligence.tcs_state import classify_tcs_state

    engine = create_engine(
        f"sqlite:///{reconstruction_db}",
        connect_args={"check_same_thread": False},
    )

    Session = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    db = Session()

    try:
        # ----------------------------------------------------
        # IMPORT VALIDATED HISTORICAL FINANCIAL OBSERVATIONS
        # ----------------------------------------------------

        if db.query(Company).count() != 154:
            stop(
                "Candidate database does not contain "
                "154 companies."
            )

        if db.query(Thesis).count() != 154:
            stop(
                "Candidate database does not contain "
                "154 theses."
            )

        if db.query(FinancialObservation).count() != 0:
            stop(
                "Candidate database already contains "
                "financial observations."
            )

        if db.query(ChangeRecord).count() != 0:
            stop(
                "Candidate database already contains "
                "ChangeRecords."
            )

        print()
        print("Importing validated financial observations...")

        import_result = import_financial_csv(
            db,
            VALIDATED_IMPORT,
        )

        observation_count = (
            db.query(FinancialObservation).count()
        )

        change_count = (
            db.query(ChangeRecord).count()
        )

        if import_result["inserted"] != 2628:
            stop(
                "Expected 2628 imported observations; "
                f"got {import_result['inserted']}."
            )

        if import_result["skipped"] != 0:
            stop(
                f"Financial import skipped "
                f"{import_result['skipped']} rows."
            )

        if import_result["errors"] != 0:
            stop(
                f"Financial import produced "
                f"{import_result['errors']} errors."
            )

        if observation_count != 2628:
            stop(
                f"Expected 2628 stored observations; "
                f"got {observation_count}."
            )

        if change_count != 1314:
            stop(
                f"Expected 1314 ChangeRecords; "
                f"got {change_count}."
            )

        print("✓ Financial observations: 2628")
        print("✓ ChangeRecords: 1314")

        # ----------------------------------------------------
        # INDEPENDENT TCS CALCULATION
        # ----------------------------------------------------

        periods = [
            "Q1 FY26",
            "Q2 FY26",
            "Q3 FY26",
        ]

        identity = (
            production[
                [
                    "company_id",
                    "symbol",
                    "thesis_id",
                ]
            ]
            .drop_duplicates()
            .sort_values("thesis_id")
        )

        output_rows = []

        print()
        print("Calculating BMS V1 TCS independently...")

        for _, pair in identity.iterrows():

            company_id = int(pair["company_id"])
            symbol = str(pair["symbol"])
            thesis_id = int(pair["thesis_id"])

            thesis = db.get(Thesis, thesis_id)

            if thesis is None:
                stop(
                    f"Missing reconstructed thesis "
                    f"{thesis_id} for {symbol}."
                )

            if thesis.company_id != company_id:
                stop(
                    f"Thesis/company mismatch for {symbol}."
                )

            for period in periods:

                changes = (
                    db.query(ChangeRecord)
                    .filter(
                        ChangeRecord.company_id == company_id,
                        ChangeRecord.current_period == period,
                    )
                    .order_by(ChangeRecord.id.asc())
                    .all()
                )

                for change in changes:

                    existing = (
                        db.query(ThesisEvidence)
                        .filter(
                            ThesisEvidence.thesis_id
                            == thesis_id,
                            ThesisEvidence.change_record_id
                            == change.id,
                        )
                        .first()
                    )

                    if existing is None:
                        promote_change_to_evidence(
                            db,
                            thesis_id=thesis_id,
                            change_record=change,
                        )

                result = calculate_tcs_from_thesis_evidence(
                    db=db,
                    thesis_id=thesis_id,
                )

                factors = {
                    factor.name: factor.current_score
                    for factor in result.factors
                }

                evidence_count = (
                    db.query(ThesisEvidence)
                    .filter(
                        ThesisEvidence.thesis_id
                        == thesis_id
                    )
                    .count()
                )

                output_rows.append(
                    {
                        "company_id": company_id,
                        "symbol": symbol,
                        "period": period,
                        "thesis_id": thesis_id,
                        "tcs": result.current_tcs,
                        "state": classify_tcs_state(
                            tcs_score=result.current_tcs
                        ),
                        "evidence_count": evidence_count,
                        "earnings": factors.get(
                            "earnings", 0.0
                        ),
                        "economics": factors.get(
                            "economics", 0.0
                        ),
                        "execution": factors.get(
                            "execution", 0.0
                        ),
                        "balance_sheet": factors.get(
                            "balance_sheet", 0.0
                        ),
                        "management_delivery": factors.get(
                            "management_delivery", 0.0
                        ),
                    }
                )

        candidate = pd.DataFrame(output_rows)

        candidate.to_csv(
            candidate_file,
            index=False,
        )

        evidence_count = (
            db.query(ThesisEvidence).count()
        )

        if evidence_count != 792:
            stop(
                f"Expected 792 promoted evidence rows; "
                f"got {evidence_count}."
            )

        print("✓ ThesisEvidence: 792")
        print(
            f"✓ Independently calculated "
            f"{len(candidate)} TCS observations"
        )

    finally:
        db.close()

    candidate = pd.read_csv(candidate_file)

    # --------------------------------------------------------
    # CANDIDATE ACCEPTANCE TESTS
    # --------------------------------------------------------

    if candidate["symbol"].nunique() != 154:
        stop(
            "Candidate does not contain 154 companies."
        )

    if len(candidate) != len(production):
        stop(
            "Candidate observation count differs from "
            "production reference."
        )

    required_output_columns = list(production.columns)

    if list(candidate.columns) != required_output_columns:
        stop(
            "Candidate output columns differ from "
            "production reference."
        )

    print(
        f"✓ Candidate contains "
        f"{candidate['symbol'].nunique()} companies"
    )
    print(
        f"✓ Candidate contains "
        f"{len(candidate)} observations"
    )
    print("✓ Candidate schema matches production")

    # --------------------------------------------------------
    # EXACT REPRODUCIBILITY CHECK
    # --------------------------------------------------------

    production_bytes = PRODUCTION_TCS.read_bytes()
    candidate_bytes = candidate_file.read_bytes()

    exact_match = (
        production_bytes == candidate_bytes
    )

    if quarter == "Q3 FY26" and not exact_match:
        stop(
            "Q3 FY26 acceptance candidate is not "
            "byte-for-byte identical to frozen BMS V1."
        )

    if exact_match:
        print(
            "✓ Candidate is byte-for-byte identical "
            "to frozen BMS V1"
        )
    else:
        print(
            "✓ Candidate generated successfully; "
            "quarter contains new information"
        )

    # --------------------------------------------------------
    # PRODUCTION IMMUTABILITY CHECK
    # --------------------------------------------------------

    production_hash_after = hashlib.sha256(
        PRODUCTION_TCS.read_bytes()
    ).hexdigest()

    if production_hash_before != production_hash_after:
        stop(
            "Production BMS hash changed during candidate "
            "calculation."
        )

    print("✓ Production BMS hash unchanged")

    print()
    print("=" * 70)
    print("CANDIDATE ACCEPTED")
    print("=" * 70)
    print()
    print("Candidate:")
    print(f"  {candidate_file}")
    print()
    print("Production:")
    print(f"  {PRODUCTION_TCS}")
    print()
    print("Production file was NOT replaced.")
    print("Explicit publication remains a separate step.")


if __name__ == "__main__":
    main()
