"""
Build AlphaSynth-facing Nifty 500 BMS V1 product dataset.

IMPORTANT
---------
This script applies the BMS V1.1 four-factor release weights.

It converts deterministic BMS history into:
- rank
- BMS Change vs Previous Quarter
- lifecycle state
- evidence strength
- reversal warning

Lifecycle is a presentation / interpretation layer.
"""

from pathlib import Path
import pandas as pd


CORE_FACTOR_WEIGHTS = {
    "earnings": 0.2778,
    "economics": 0.2778,
    "execution": 0.2778,
    "balance_sheet": 0.1666,
}


BASE = Path(__file__).resolve().parent

SOURCE = (
    BASE / "nifty500_bms_v1_results.csv"
)

OUTPUT = (
    BASE / "nifty500_bms_v1_product_view.csv"
)


def evidence_strength(count):

    if count >= 7:
        return "High"

    if count >= 4:
        return "Moderate"

    if count >= 2:
        return "Limited"

    return "Very Limited"


def lifecycle(row):

    current = float(row["bms"])
    previous = float(row["previous_bms"])
    q1 = float(row["q1_fy26_bms"])
    change = float(row["bms_change_vs_previous_quarter"])
    evidence = int(row["evidence_count"])

    # Clear deterioration from the immediately previous quarter.
    if change <= -0.10:
        return "Fading"

    # Strong momentum sustained across the recent history.
    if (
        current >= 0.38
        and previous >= 0.38
        and q1 >= 0.18
        and evidence >= 6
        and change >= -0.03
    ):
        return "Established"

    # Strong signal with meaningful previous-quarter confirmation.
    if (
        current >= 0.38
        and previous >= 0.18
        and evidence >= 4
        and change > 0
    ):
        return "Building"

    # New meaningful acceleration in business momentum.
    if (
        current >= 0.18
        and change >= 0.18
        and evidence >= 2
    ):
        return "Emerging"

    return "Watch"


def reversal_warning(row):

    change = row["bms_change_vs_previous_quarter"]

    if change <= -0.12:
        return "High"

    if change <= -0.06:
        return "Moderate"

    if (
        row["state"] == "weakening"
        and change < 0
    ):
        return "Early"

    return "None"


def main():

    df = pd.read_csv(SOURCE)

    required = {
        "symbol",
        "company_name",
        "period",
        "bms",
        "state",
        "evidence_count",
        "earnings",
        "economics",
        "execution",
        "balance_sheet",
    }

    missing = required - set(df.columns)

    if missing:
        raise SystemExit(
            "Missing columns: "
            + ", ".join(sorted(missing))
        )

    # BMS V1.1 excludes the experimental Management Delivery dimension and
    # renormalizes the four core factors to 100% before rebuilding lifecycle.
    df["bms"] = sum(
        df[factor].astype(float) * weight
        for factor, weight in CORE_FACTOR_WEIGHTS.items()
    ).round(4)
    df["state"] = df["bms"].map(
        lambda score: "strongly_strengthening" if score >= 1.0
        else "improving" if score >= 0.4
        else "mixed" if score > -0.4
        else "weakening" if score > -1.0
        else "strongly_weakening"
    )

    # --------------------------------------------------------
    # Pivot BMS history
    # --------------------------------------------------------

    history = (
        df.pivot(
            index="symbol",
            columns="period",
            values="bms",
        )
        .reset_index()
    )

    latest = (
        df[
            df["period"] == "Q3 FY26"
        ]
        .copy()
    )

    previous = history[
        [
            "symbol",
            "Q2 FY26",
        ]
    ].rename(
        columns={
            "Q2 FY26":
                "previous_bms"
        }
    )

    earlier = history[
        [
            "symbol",
            "Q1 FY26",
        ]
    ].rename(
        columns={
            "Q1 FY26":
                "q1_fy26_bms"
        }
    )

    latest = (
        latest
        .merge(
            previous,
            on="symbol",
            how="left",
        )
        .merge(
            earlier,
            on="symbol",
            how="left",
        )
    )

    latest[
        "bms_change_vs_previous_quarter"
    ] = (
        latest["bms"]
        - latest["previous_bms"]
    ).round(4)

    latest[
        "previous_quarter_change"
    ] = (
        latest["previous_bms"]
        - latest["q1_fy26_bms"]
    ).round(4)

    # --------------------------------------------------------
    # Evidence interpretation
    # --------------------------------------------------------

    latest["evidence_strength"] = (
        latest["evidence_count"]
        .apply(evidence_strength)
    )

    # --------------------------------------------------------
    # Lifecycle
    # --------------------------------------------------------

    latest["lifecycle_state"] = (
        latest.apply(
            lifecycle,
            axis=1,
        )
    )

    latest["reversal_warning"] = (
        latest.apply(
            reversal_warning,
            axis=1,
        )
    )

    # --------------------------------------------------------
    # Ranking
    #
    # BMS remains the primary ranking variable.
    # Evidence only breaks exact BMS ties.
    # --------------------------------------------------------

    latest = latest.sort_values(
        [
            "bms",
            "evidence_count",
        ],
        ascending=[
            False,
            False,
        ],
    ).reset_index(drop=True)

    latest["bms_rank"] = (
        range(
            1,
            len(latest) + 1,
        )
    )

    latest["bms_change_rank"] = (
        latest[
            "bms_change_vs_previous_quarter"
        ]
        .rank(
            method="min",
            ascending=False,
        )
        .astype(int)
    )

    # --------------------------------------------------------
    # Friendly column names / ordering
    # --------------------------------------------------------

    output = latest[
        [
            "bms_rank",
            "symbol",
            "company_name",
            "period",
            "bms",
            "previous_bms",
            "q1_fy26_bms",
            "bms_change_vs_previous_quarter",
            "bms_change_rank",
            "lifecycle_state",
            "state",
            "reversal_warning",
            "evidence_count",
            "evidence_strength",
            "earnings",
            "economics",
            "execution",
            "balance_sheet",
        ]
    ].copy()

    output.to_csv(
        OUTPUT,
        index=False,
    )

    print("=" * 78)
    print("NIFTY 500 BMS V1 — PRODUCT VIEW")
    print("=" * 78)

    print()
    print("Companies:", len(output))

    print()
    print("LIFECYCLE DISTRIBUTION")
    print(
        output[
            "lifecycle_state"
        ]
        .value_counts()
        .to_string()
    )

    print()
    print("EVIDENCE STRENGTH")
    print(
        output[
            "evidence_strength"
        ]
        .value_counts()
        .to_string()
    )

    print()
    print("REVERSAL WARNINGS")
    print(
        output[
            "reversal_warning"
        ]
        .value_counts()
        .to_string()
    )

    print()
    print("TOP 25 PRODUCT VIEW")

    print(
        output[
            [
                "bms_rank",
                "symbol",
                "bms",
                "bms_change_vs_previous_quarter",
                "lifecycle_state",
                "evidence_strength",
                "evidence_count",
                "reversal_warning",
            ]
        ]
        .head(25)
        .to_string(index=False)
    )

    print()
    print("Saved:", OUTPUT)


if __name__ == "__main__":
    main()
