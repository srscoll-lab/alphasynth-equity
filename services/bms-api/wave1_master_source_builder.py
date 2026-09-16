from __future__ import annotations

from pathlib import Path

import pandas as pd

from stock_intelligence.db import SessionLocal
from stock_intelligence.models import FinancialObservation


PROJECT_ROOT = Path(".")

STAGING_FILE = (
    PROJECT_ROOT
    / "wave1_fundamentals_staging.csv"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "wave1_master_source_data.csv"
)


OUTPUT_COLUMNS = [
    "company_id",
    "symbol",
    "sector",
    "template",
    "benchmark",
    "period",
    "metric_name",
    "factor",
    "priority",
    "value",
    "unit",
    "source_type",
    "source_reference",
    "validation_note",
    "source_status",
]


def main() -> None:
    if not STAGING_FILE.exists():
        raise FileNotFoundError(
            "wave1_fundamentals_staging.csv "
            "was not found."
        )

    staging = pd.read_csv(
        STAGING_FILE
    )

    db = SessionLocal()

    try:
        existing_observations = (
            db.query(
                FinancialObservation
            )
            .all()
        )

        existing_keys = {
            (
                int(obs.company_id),
                str(obs.period_label),
                str(obs.metric_name),
            )
            for obs in existing_observations
        }

        rows = []

        for _, row in staging.iterrows():
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

            # Already safely inside the database.
            if key in existing_keys:
                continue

            rows.append(
                {
                    "company_id": company_id,
                    "symbol": symbol,
                    "sector": row["sector"],
                    "template": row["template"],
                    "benchmark": row["benchmark"],
                    "period": period,
                    "metric_name": metric_name,
                    "factor": row["factor"],
                    "priority": row["priority"],

                    # To be populated from
                    # historical source material.
                    "value": "",
                    "unit": "",
                    "source_type": "",
                    "source_reference": "",
                    "validation_note": "",

                    "source_status": "needs_source",
                }
            )

        master = pd.DataFrame(
            rows,
            columns=OUTPUT_COLUMNS,
        )

        master.to_csv(
            OUTPUT_FILE,
            index=False,
        )

        print()
        print(
            "========================================"
        )
        print(
            "WAVE 1 MASTER SOURCE BUILD"
        )
        print(
            "========================================"
        )

        print(
            f"Rows still requiring data: "
            f"{len(master)}"
        )

        print(
            f"Companies still requiring data: "
            f"{master['symbol'].nunique()}"
        )

        print()

        if not master.empty:
            summary = (
                master
                .groupby("symbol")
                .size()
                .sort_values(
                    ascending=False
                )
            )

            print(
                "Missing rows by company:"
            )

            for symbol, count in (
                summary.items()
            ):
                print(
                    f"  {symbol}: {count}"
                )

        print()

        print(
            f"Saved to: {OUTPUT_FILE}"
        )

        print(
            "========================================"
        )

    finally:
        db.close()


if __name__ == "__main__":
    main()