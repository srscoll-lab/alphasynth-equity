from __future__ import annotations

from pathlib import Path

import pandas as pd

from stock_intelligence.db import SessionLocal
from stock_intelligence.models import FinancialObservation
from stock_intelligence.financial_csv_importer import (
    import_financial_csv,
)


PROJECT_ROOT = Path(".")

STAGING_FILE = (
    PROJECT_ROOT
    / "wave1_fundamentals_staging.csv"
)

TEMP_IMPORT_FILE = (
    PROJECT_ROOT
    / "wave1_generic_validated_import.csv"
)


PERIOD_END_DATES = {
    "Q1 FY25": "2024-06-30",
    "Q2 FY25": "2024-09-30",
    "Q3 FY25": "2024-12-31",
    "Q1 FY26": "2025-06-30",
    "Q2 FY26": "2025-09-30",
    "Q3 FY26": "2025-12-31",
}


ALLOWED_STATUSES = {
    "candidate_batch",
    "candidate_official",
}


def main() -> None:
    if not STAGING_FILE.exists():
        raise FileNotFoundError(
            "wave1_fundamentals_staging.csv "
            "was not found."
        )

    staging = pd.read_csv(
        STAGING_FILE
    )

    candidates = staging[
        staging["validation_status"].isin(
            ALLOWED_STATUSES
        )
    ].copy()

    if candidates.empty:
        print()
        print(
            "No candidate rows are available "
            "for import."
        )
        return

    db = SessionLocal()

    try:
        existing = (
            db.query(
                FinancialObservation
            )
            .all()
        )

        existing_keys = {
            (
                int(row.company_id),
                str(row.period_label),
                str(row.metric_name),
            )
            for row in existing
        }

        import_rows = []

        skipped_existing = []

        for _, row in candidates.iterrows():
            company_id = int(
                row["company_id"]
            )

            symbol = str(
                row["symbol"]
            )

            period = str(
                row["period"]
            )

            metric_name = str(
                row["metric_name"]
            )

            key = (
                company_id,
                period,
                metric_name,
            )

            if key in existing_keys:
                skipped_existing.append(
                    key
                )
                continue

            if period not in PERIOD_END_DATES:
                raise ValueError(
                    "Unsupported period: "
                    f"{period}"
                )

            value = float(
                row["value"]
            )

            unit = (
                ""
                if pd.isna(
                    row["unit"]
                )
                else str(
                    row["unit"]
                )
            )

            source_type = (
                "batch_validated"
                if pd.isna(
                    row["source_type"]
                )
                else str(
                    row["source_type"]
                )
            )

            import_rows.append(
                {
                    "symbol": symbol,
                    "metric_name": (
                        metric_name
                    ),
                    "metric_value": value,
                    "period_label": (
                        period
                    ),
                    "period_type": (
                        "quarterly"
                    ),
                    "comparison_type": (
                        "YoY"
                    ),
                    "period_end_date": (
                        PERIOD_END_DATES[
                            period
                        ]
                    ),
                    "unit": unit,
                    "source_type": (
                        source_type
                    ),
                }
            )

        if not import_rows:
            print()
            print(
                "All candidate rows already "
                "exist in the database."
            )
            print(
                f"Existing rows skipped: "
                f"{len(skipped_existing)}"
            )
            return

        import_df = pd.DataFrame(
            import_rows
        )

        import_df.to_csv(
            TEMP_IMPORT_FILE,
            index=False,
        )

        print()
        print(
            "========================================"
        )
        print(
            "WAVE 1 GENERIC STAGING IMPORT"
        )
        print(
            "========================================"
        )

        print(
            f"Candidate rows found: "
            f"{len(candidates)}"
        )

        print(
            f"Existing rows skipped: "
            f"{len(skipped_existing)}"
        )

        print(
            f"Prepared new rows: "
            f"{len(import_df)}"
        )

        print(
            f"Temporary import file: "
            f"{TEMP_IMPORT_FILE}"
        )

        print()

        result = import_financial_csv(
            db,
            str(TEMP_IMPORT_FILE),
        )

        print(
            "Import result:"
        )
        print(
            result
        )

        print(
            "========================================"
        )

    finally:
        db.close()


if __name__ == "__main__":
    main()