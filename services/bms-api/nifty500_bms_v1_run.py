"""
Nifty 500 BMS V1 parallel calculation.

PURPOSE
-------
Run the existing deterministic YoY BMS methodology on the
expanded Nifty 500 ready universe.

SAFETY
------
- Does NOT modify final_validation/tcs_events.csv
- Does NOT modify validated 154-company BMS
- Uses a separate SQLite database
- Uses only companies marked ready
- Missing observations are never fabricated
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent

FUNDAMENTALS = BASE / "final_validation" / "nifty500_bms_v1_fundamentals.csv"

READINESS = BASE / "final_validation" / "nifty500_bms_v1_final_readiness.csv"

DB_FILE = BASE / "nifty500_bms_v1_candidate.db"

OUTPUT = BASE / "nifty500_bms_v1_results.csv"

FACTOR_EVIDENCE = Path(
    os.environ.get(
        "BMS_FACTOR_EVIDENCE_FILE",
        str(BASE / "final_validation" / "nifty500_bms_factor_evidence.csv"),
    )
)

PERIODS = [
    "Q1 FY25",
    "Q2 FY25",
    "Q3 FY25",
    "Q1 FY26",
    "Q2 FY26",
    "Q3 FY26",
]

PERIOD_END = {
    "Q1 FY25": "2024-06-30",
    "Q2 FY25": "2024-09-30",
    "Q3 FY25": "2024-12-31",
    "Q1 FY26": "2025-06-30",
    "Q2 FY26": "2025-09-30",
    "Q3 FY26": "2025-12-31",
}

SCORE_PERIODS = [
    "Q1 FY26",
    "Q2 FY26",
    "Q3 FY26",
]


def stop(message: str) -> None:
    raise SystemExit(f"\nSTOP: {message}\n")


def metric_category(metric: str) -> str:

    metric = metric.lower().strip()

    if metric in {
        "revenue",
        "pat",
    }:
        return "earnings"

    if metric in {
        "operating_margin",
        "financing_margin",
        "nim",
        "gnpa",
    }:
        return "economics"

    return "execution"


def main() -> None:

    print("=" * 76)
    print("NIFTY 500 BMS V1 PARALLEL RUN")
    print("=" * 76)

    if not FUNDAMENTALS.exists():
        stop(f"Missing fundamentals: {FUNDAMENTALS}")

    if not READINESS.exists():
        stop(f"Missing readiness file: {READINESS}")

    fundamentals = pd.read_csv(FUNDAMENTALS)

    readiness = pd.read_csv(READINESS)

    for df in [
        fundamentals,
        readiness,
    ]:
        df["symbol"] = df["symbol"].astype(str).str.strip().str.upper()

    ready = readiness[readiness["bms_v1_status"] == "ready"].copy()

    ready_symbols = set(ready["symbol"])

    print()
    print(
        "Ready companies:",
        len(ready_symbols),
    )

    if len(ready_symbols) != 477:
        stop(f"Expected 477 ready companies, found {len(ready_symbols)}")

    fundamentals = fundamentals[fundamentals["symbol"].isin(ready_symbols)].copy()

    fundamentals["value"] = pd.to_numeric(
        fundamentals["value"],
        errors="coerce",
    )

    fundamentals = fundamentals[fundamentals["value"].notna()].copy()

    fundamentals = fundamentals[fundamentals["period"].isin(PERIODS)].copy()

    duplicates = fundamentals.duplicated(
        subset=[
            "symbol",
            "period",
            "metric_name",
        ]
    ).sum()

    if duplicates:
        stop(f"Found {duplicates} duplicate symbol/period/metric rows")

    print(
        "Usable observations:",
        len(fundamentals),
    )

    print(
        "Companies represented:",
        fundamentals["symbol"].nunique(),
    )

    print()
    print("Observations by period:")
    print(fundamentals["period"].value_counts().reindex(PERIODS).fillna(0).astype(int).to_string())

    # --------------------------------------------------------
    # CREATE ISOLATED DATABASE
    # --------------------------------------------------------

    if DB_FILE.exists():
        DB_FILE.unlink()

    if OUTPUT.exists():
        OUTPUT.unlink()

    os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE}"

    from sqlalchemy import (
        create_engine,
    )
    from sqlalchemy.orm import (
        sessionmaker,
    )

    from stock_intelligence.evidence_promotion import (
        promote_change_to_evidence,
    )
    from stock_intelligence.factor_evidence_importer import (
        import_factor_evidence_csv,
    )
    from stock_intelligence.financial_observation_service import (
        create_observation_with_change,
    )
    from stock_intelligence.models import (
        Base,
        Company,
        Thesis,
        ThesisEvidence,
    )
    from stock_intelligence.tcs_from_evidence import (
        calculate_tcs_from_thesis_evidence,
    )
    from stock_intelligence.tcs_state import (
        classify_tcs_state,
    )

    engine = create_engine(
        f"sqlite:///{DB_FILE}",
        connect_args={"check_same_thread": False},
    )

    Base.metadata.create_all(engine)

    Session = sessionmaker(bind=engine)

    db = Session()

    try:
        # ----------------------------------------------------
        # COMPANY + THESIS IDENTITIES
        # ----------------------------------------------------

        names = (
            ready[
                [
                    "symbol",
                    "company_name",
                ]
            ]
            .drop_duplicates("symbol")
            .set_index("symbol")["company_name"]
            .to_dict()
        )

        for idx, symbol in enumerate(
            sorted(ready_symbols),
            start=1,
        ):
            company = Company(
                id=idx,
                company_uuid=str(uuid.uuid4()),
                legal_name=names.get(symbol),
                nse_symbol=symbol,
                symbol=symbol,
                exchange="NSE",
                headquarters_country="India",
                listing_status="active",
                is_active=True,
            )

            db.add(company)

        db.commit()

        companies = {company.symbol: company for company in (db.query(Company).all())}

        for symbol in sorted(ready_symbols):
            company = companies[symbol]

            thesis = Thesis(
                company_id=company.id,
                thesis_type="fundamental",
                title=(f"{symbol} Nifty 500 BMS V1 thesis"),
                thesis_text=(
                    "Expanded Nifty 500 BMS V1 deterministic fundamental momentum thesis."
                ),
                status="active",
                model_version=("nifty500-bms-v1"),
            )

            db.add(thesis)

        db.commit()

        theses = {thesis.company_id: thesis for thesis in (db.query(Thesis).all())}

        print()
        print(
            "Companies created:",
            len(companies),
        )

        print(
            "Theses created:",
            len(theses),
        )

        # ----------------------------------------------------
        # IMPORT CHRONOLOGICALLY
        # ----------------------------------------------------

        order = {period: idx for idx, period in enumerate(PERIODS)}

        fundamentals["_order"] = fundamentals["period"].map(order)

        fundamentals = fundamentals.sort_values(
            [
                "_order",
                "symbol",
                "metric_name",
            ]
        )

        results = []

        for period in PERIODS:
            rows = fundamentals[fundamentals["period"] == period]

            changes = []

            print()
            print("-" * 76)
            print(period)
            print("-" * 76)

            for _, row in rows.iterrows():
                symbol = row["symbol"]

                company = companies.get(symbol)

                if company is None:
                    continue

                metric = str(row["metric_name"]).strip().lower()

                _, change = create_observation_with_change(
                    db,
                    company_id=company.id,
                    metric_name=metric,
                    metric_value=float(row["value"]),
                    period_label=period,
                    period_type="quarterly",
                    period_end_date=(pd.to_datetime(PERIOD_END[period]).date()),
                    category=metric_category(metric),
                    comparison_type="YoY",
                    unit=(None if pd.isna(row["unit"]) else str(row["unit"])),
                    source_type=(None if pd.isna(row["source_type"]) else str(row["source_type"])),
                    confidence=0.6,
                )

                if change is not None:
                    changes.append(change)

            print(
                "ChangeRecords:",
                len(changes),
            )

            # FY25 is baseline history.
            if period not in SCORE_PERIODS:
                continue

            if FACTOR_EVIDENCE.exists():
                factor_import = import_factor_evidence_csv(
                    db,
                    FACTOR_EVIDENCE,
                    current_period=period,
                )
                print(
                    "Factor evidence:",
                    f"inserted={factor_import.inserted}",
                    f"promoted={factor_import.promoted}",
                    f"duplicates={factor_import.duplicates}",
                    f"rejected={factor_import.rejected}",
                )
            else:
                print(
                    "Factor evidence: no supplemental file; "
                    "companies with incomplete coverage will not be published."
                )

            for change in changes:
                thesis = theses.get(change.company_id)

                if thesis is None:
                    continue

                promote_change_to_evidence(
                    db,
                    thesis_id=thesis.id,
                    change_record=change,
                )

            scored_this_period = 0

            for symbol in sorted(ready_symbols):
                company = companies[symbol]

                thesis = theses[company.id]

                result = calculate_tcs_from_thesis_evidence(
                    db=db,
                    thesis_id=thesis.id,
                )

                factor_scores = {factor.name: factor.current_score for factor in result.factors}

                evidence_count = (
                    db.query(ThesisEvidence).filter(ThesisEvidence.thesis_id == thesis.id).count()
                )

                state = classify_tcs_state(tcs_score=(result.current_tcs))

                results.append(
                    {
                        "company_id": company.id,
                        "symbol": symbol,
                        "company_name": names.get(symbol),
                        "period": period,
                        "thesis_id": thesis.id,
                        "bms": result.current_tcs,
                        "state": state,
                        "evidence_count": evidence_count,
                        "earnings": factor_scores.get(
                            "earnings",
                            0.0,
                        ),
                        "economics": factor_scores.get(
                            "economics",
                            0.0,
                        ),
                        "execution": factor_scores.get(
                            "execution",
                            0.0,
                        ),
                        "balance_sheet": factor_scores.get(
                            "balance_sheet",
                            0.0,
                        ),
                        "management_delivery": factor_scores.get(
                            "management_delivery",
                            0.0,
                        ),
                    }
                )

                scored_this_period += 1

            print(
                "Companies scored:",
                scored_this_period,
            )

        output = pd.DataFrame(results)

        expected_rows = len(ready_symbols) * len(SCORE_PERIODS)

        if len(output) != expected_rows:
            stop(f"Expected {expected_rows} result rows, found {len(output)}")

        output.to_csv(
            OUTPUT,
            index=False,
        )

        print()
        print("=" * 76)
        print("NIFTY 500 BMS V1 RUN COMPLETE")
        print("=" * 76)

        print()
        print(
            "Output rows:",
            len(output),
        )

        print(
            "Companies:",
            output["symbol"].nunique(),
        )

        print()
        print("Rows by period:")
        print(output["period"].value_counts().sort_index().to_string())

        latest = output[output["period"] == "Q3 FY26"].copy()

        latest = latest.sort_values(
            [
                "bms",
                "evidence_count",
            ],
            ascending=[
                False,
                False,
            ],
        )

        print()
        print("TOP 20 — Q3 FY26")
        print(
            latest[
                [
                    "symbol",
                    "company_name",
                    "bms",
                    "state",
                    "evidence_count",
                ]
            ]
            .head(20)
            .to_string(index=False)
        )

        print()
        print(
            "Saved:",
            OUTPUT,
        )

        print(
            "Database:",
            DB_FILE,
        )

        print()
        print("Existing 154-company production BMS was NOT modified.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
