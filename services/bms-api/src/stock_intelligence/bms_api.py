import math
import os
import sqlite3
from pathlib import Path

import pandas as pd
from fastapi import FastAPI

from .factor_analysis import load_factor_analyses
from .publication_eligibility import assess_publication_eligibility
from .tcs_evidence_mapping import map_evidence_to_tcs_factor
from .thesis_direction_rules import infer_thesis_direction

app = FastAPI(
    title="Business Momentum Score API",
    version="1.1.0",
)

# BMS data location.
# Local development uses the repository's final_validation directory.
# Containers / Cloud Run can override this with BMS_TCS_FILE.
_local_repo_root = Path(__file__).resolve().parents[2]
TCS_FILE = Path(
    os.environ.get(
        "BMS_TCS_FILE",
        str(_local_repo_root / "final_validation" / "tcs_events.csv"),
    )
)

_bms_artifact_root = Path(
    os.environ.get(
        "BMS_ARTIFACT_ROOT",
        "/app" if Path("/app").exists() else str(_local_repo_root),
    )
)

BMS_HISTORY_FILE = Path(
    os.environ.get(
        "BMS_HISTORY_FILE",
        str(_bms_artifact_root / "nifty500_bms_v1_results.csv"),
    )
)

BMS_PRODUCT_FILE = Path(
    os.environ.get(
        "BMS_PRODUCT_FILE",
        str(_bms_artifact_root / "nifty500_bms_v1_product_view_final.csv"),
    )
)

BMS_DB_FILE = Path(
    os.environ.get(
        "BMS_DB_FILE",
        str(_bms_artifact_root / "nifty500_bms_v1_candidate.db"),
    )
)

BMS_SUPPLEMENTAL_EVIDENCE_FILE = Path(
    os.environ.get(
        "BMS_SUPPLEMENTAL_EVIDENCE_FILE",
        str(_bms_artifact_root / "src" / "stock_intelligence" / "bms_launch_factor_evidence.csv"),
    )
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "bms-api",
    }


def _period_rank(period: str) -> int:
    """Convert labels such as Q3 FY26 into a sortable number."""
    quarter, fiscal_year = period.split()
    q = int(quarter[1:])
    fy = int(fiscal_year.replace("FY", ""))
    return fy * 10 + q


def _prepare_history() -> pd.DataFrame:
    """
    Load expanded Nifty 500 BMS history and calculate trajectory fields.

    The deterministic BMS scores are already calculated upstream.
    This function does not recalculate BMS.
    """
    if not BMS_HISTORY_FILE.exists():
        raise FileNotFoundError(f"BMS history file not found: {BMS_HISTORY_FILE}")

    df = pd.read_csv(BMS_HISTORY_FILE)

    # Expanded Nifty 500 output calls the score "bms".
    # Existing API internals historically call the same field "tcs".
    if "tcs" not in df.columns and "bms" in df.columns:
        df = df.rename(columns={"bms": "tcs"})

    required = {
        "symbol",
        "period",
        "tcs",
        "state",
        "evidence_count",
        "earnings",
        "economics",
        "execution",
        "balance_sheet",
        "management_delivery",
    }

    missing = required - set(df.columns)

    if missing:
        raise ValueError("BMS history missing columns: " + ", ".join(sorted(missing)))

    df["symbol"] = df["symbol"].astype(str).str.strip().str.upper()

    df["_period_rank"] = df["period"].map(_period_rank)
    df = df.sort_values(["symbol", "_period_rank"]).copy()

    df["previous_bms"] = df.groupby("symbol")["tcs"].shift(1)
    df["previous2_bms"] = df.groupby("symbol")["tcs"].shift(2)
    df["bms_change"] = df["tcs"] - df["previous_bms"]

    return df


def _improving_streak(group: pd.DataFrame) -> int:
    """Count consecutive improving observations ending at the latest quarter."""
    streak = 0

    for state in reversed(group["state"].tolist()):
        if state == "improving":
            streak += 1
        else:
            break

    return streak


def _lifecycle_stage(row: pd.Series) -> str:
    """
    Lifecycle V1.

    This is deliberately separate from the frozen TCS/BMS state.
    It describes where the company appears to be in its momentum journey.
    """
    tcs = float(row["tcs"])
    previous = row["previous_bms"]
    change = row["bms_change"]
    state = row["state"]
    evidence = int(row["evidence_count"])
    improving_streak = int(row["improving_streak"])

    # ESTABLISHED:
    # Reserved for strong momentum confirmed across at least 3 consecutive
    # improving observations. This is intentionally difficult to achieve.
    if state == "improving" and tcs >= 0.38 and evidence >= 6 and improving_streak >= 3:
        return "ESTABLISHED"

    # BUILDING:
    # Strong BMS plus confirmation from the previous quarter.
    if (
        state == "improving"
        and tcs >= 0.38
        and evidence >= 4
        and pd.notna(previous)
        and float(previous) >= 0.18
    ):
        return "BUILDING"

    # EMERGING:
    # An unusually strong new positive inflection.
    if pd.notna(change) and float(change) >= 0.18 and tcs >= 0.18 and evidence >= 2:
        return "EMERGING"

    # WATCH:
    # Positive evidence is becoming interesting, but confirmation is incomplete.
    if (tcs >= 0.18 and evidence >= 2) or (
        pd.notna(change) and float(change) >= 0.18 and tcs >= 0.00 and evidence >= 3
    ):
        return "WATCH"

    return "OUTSIDE"


def _lifecycle_qualification(row: pd.Series) -> str | None:
    """
    Describe the character of the momentum inside the lifecycle stage.

    Examples:
      BUILDING · ACCELERATING
      BUILDING · PERSISTENT
      BUILDING · MATURE
      BUILDING · DECELERATING
    """
    stage = row["lifecycle_stage"]
    change = row["bms_change"]
    previous = row["previous_bms"]
    previous2 = row["previous2_bms"]
    current = float(row["tcs"])

    if stage == "EMERGING":
        return "ACCELERATING"

    if stage == "WATCH":
        return "EARLY"

    if stage not in {"BUILDING", "ESTABLISHED"}:
        return None

    if pd.notna(change) and float(change) >= 0.10:
        return "ACCELERATING"

    if pd.notna(change) and float(change) <= -0.03:
        return "DECELERATING"

    # Mature means the BMS has remained at a high level for three observations.
    if (
        pd.notna(previous)
        and pd.notna(previous2)
        and min(float(previous2), float(previous), current) >= 0.35
    ):
        return "MATURE"

    return "PERSISTENT"


def _fading_warning(row: pd.Series) -> bool:
    """
    Warning overlay: a previously meaningful positive signal has deteriorated sharply.

    FADING is intentionally a warning, not a mutually exclusive lifecycle stage.
    """
    previous = row["previous_bms"]
    change = row["bms_change"]

    return bool(
        pd.notna(previous)
        and pd.notna(change)
        and float(previous) >= 0.18
        and float(change) <= -0.10
    )


@app.get("/bms/watchlist")
def bms_watchlist():
    df = pd.read_csv(TCS_FILE)

    watchlist = df[df["state"] == "improving"].copy()

    watchlist = watchlist[
        [
            "symbol",
            "period",
            "tcs",
            "state",
            "evidence_count",
            "earnings",
            "economics",
            "execution",
            "balance_sheet",
            "management_delivery",
        ]
    ]

    watchlist = watchlist.rename(
        columns={
            "tcs": "bms",
            "state": "momentum_state",
        }
    )

    watchlist = watchlist.sort_values(
        ["period", "bms"],
        ascending=[False, False],
    )

    return {
        "name": "Business Momentum Score",
        "signal_count": len(watchlist),
        "signals": watchlist.to_dict(orient="records"),
    }


@app.get("/bms/watchlist/current")
def current_bms_watchlist():
    df = pd.read_csv(TCS_FILE)

    df["_period_rank"] = df["period"].map(_period_rank)

    latest = df.sort_values(["symbol", "_period_rank"]).groupby("symbol", as_index=False).tail(1)

    # Frozen qualification rule remains unchanged.
    watchlist = latest[latest["state"] == "improving"].copy()

    watchlist = watchlist[
        [
            "symbol",
            "period",
            "tcs",
            "state",
            "evidence_count",
            "earnings",
            "economics",
            "execution",
            "balance_sheet",
            "management_delivery",
        ]
    ].rename(
        columns={
            "tcs": "bms",
            "state": "momentum_state",
        }
    )

    watchlist = watchlist.sort_values(
        "bms",
        ascending=False,
    )

    return {
        "name": "Business Momentum Score",
        "watchlist_type": "latest_company_state",
        "company_count": len(watchlist),
        "companies": watchlist.to_dict(orient="records"),
    }


@app.get("/bms/lifecycle/current")
def current_bms_lifecycle():
    """
    Current AlphaSynth Business Momentum product view.

    BMS itself is deterministic and calculated upstream.

    Lifecycle interpretation comes from the frozen
    Nifty 500 BMS V1 product dataset and is NOT recalculated here.
    """

    if not BMS_PRODUCT_FILE.exists():
        raise FileNotFoundError(f"BMS product file not found: {BMS_PRODUCT_FILE}")

    product = pd.read_csv(BMS_PRODUCT_FILE)
    history = _prepare_history()

    product["symbol"] = product["symbol"].astype(str).str.strip().str.upper()

    # --------------------------------------------------------
    # Historical BMS trajectory
    # --------------------------------------------------------

    trajectory_map = {}

    for symbol, group in history.groupby("symbol"):
        trajectory_map[symbol] = [
            {
                "period": str(row["period"]),
                "bms": round(float(row["tcs"]), 4),
                "momentum_state": str(row["state"]),
                "evidence_count": int(row["evidence_count"]),
            }
            for _, row in group.iterrows()
        ]

    streaks = (
        history.groupby("symbol", group_keys=False)
        .apply(_improving_streak, include_groups=False)
        .to_dict()
    )

    # --------------------------------------------------------
    # Translate frozen product lifecycle to existing API shape
    # --------------------------------------------------------

    lifecycle_map = {
        "Watch": "WATCH",
        "Emerging": "EMERGING",
        "Building": "BUILDING",
        "Established": "ESTABLISHED",
        # Existing frontend treats FADING as a warning overlay.
        # Preserve that API contract.
        "Fading": "WATCH",
    }

    product["lifecycle_stage"] = product["lifecycle_state"].map(lifecycle_map).fillna("OUTSIDE")

    product["fading_warning"] = product["lifecycle_state"].eq("Fading")

    def qualification(row):
        lifecycle = str(row["lifecycle_state"])
        reliability = str(row.get("bms_change_reliability", ""))

        change = row.get("bms_change_vs_previous_quarter")

        if lifecycle == "Fading":
            return "DECELERATING"

        if lifecycle == "Emerging":
            if reliability == "New signal":
                return "NEW_SIGNAL"

            if reliability == "Limited history":
                return "LIMITED_HISTORY"

            if pd.notna(change) and float(change) >= 0.03:
                return "ACCELERATING"

            return "EARLY"

        if lifecycle == "Building":
            if pd.notna(change) and float(change) >= 0.10:
                return "ACCELERATING"

            if pd.notna(change) and float(change) <= -0.03:
                return "DECELERATING"

            return "PERSISTENT"

        if lifecycle == "Established":
            if pd.notna(change) and float(change) >= 0.10:
                return "ACCELERATING"

            if pd.notna(change) and float(change) <= -0.03:
                return "DECELERATING"

            return "MATURE"

        if lifecycle == "Watch":
            return "EARLY"

        return None

    product["lifecycle_qualification"] = product.apply(
        qualification,
        axis=1,
    )

    product["improving_streak"] = product["symbol"].map(streaks).fillna(0).astype(int)

    product["bms_trajectory"] = product["symbol"].map(trajectory_map)

    # --------------------------------------------------------
    # Evidence comparability and fail-closed publication
    # --------------------------------------------------------

    periods_by_symbol = product.set_index("symbol")["period"].astype(str).to_dict()
    scores_by_symbol = {
        str(row["symbol"]): {
            factor: (float(row[factor]) if pd.notna(row.get(factor)) else None)
            for factor in [
                "earnings",
                "economics",
                "execution",
                "balance_sheet",
                "management_delivery",
            ]
        }
        for _, row in product.iterrows()
    }
    analyses = load_factor_analyses(
        BMS_DB_FILE,
        periods_by_symbol=periods_by_symbol,
        scores_by_symbol=scores_by_symbol,
        supplemental_evidence_file=BMS_SUPPLEMENTAL_EVIDENCE_FILE,
    )
    product["factor_analysis"] = product["symbol"].map(analyses)
    product["publication_eligibility"] = product["factor_analysis"].map(
        lambda analysis: assess_publication_eligibility(analysis).as_dict()
    )

    # --------------------------------------------------------
    # Existing API field names
    # --------------------------------------------------------

    product["momentum_state"] = product["state"]

    product["previous2_bms"] = product["q1_fy26_bms"]

    product["bms_change"] = product["bms_change_vs_previous_quarter"]

    # --------------------------------------------------------
    # API response
    # --------------------------------------------------------

    columns = [
        "symbol",
        "company_name",
        "period",
        "bms",
        "momentum_state",
        "evidence_count",
        "earnings",
        "economics",
        "execution",
        "balance_sheet",
        "management_delivery",
        "previous_bms",
        "previous2_bms",
        "bms_change",
        "improving_streak",
        "lifecycle_stage",
        "lifecycle_qualification",
        "fading_warning",
        "bms_trajectory",
        "factor_analysis",
        "publication_eligibility",
        # New product fields.
        "evidence_strength",
        "previous_evidence_count",
        "bms_change_reliability",
        "bms_change_display",
        "reversal_warning",
    ]

    monitored_output = product[columns].copy()
    output = monitored_output[
        monitored_output["publication_eligibility"].map(
            lambda eligibility: bool(eligibility.get("scorePublishable"))
        )
    ].copy()

    stage_order = {
        "ESTABLISHED": 0,
        "BUILDING": 1,
        "EMERGING": 2,
        "WATCH": 3,
        "OUTSIDE": 4,
    }

    output["_stage_order"] = output["lifecycle_stage"].map(stage_order).fillna(9)

    output = output.sort_values(
        [
            "fading_warning",
            "_stage_order",
            "bms",
        ],
        ascending=[
            False,
            True,
            False,
        ],
    ).drop(columns=["_stage_order"])

    lifecycle_counts = product.loc[output.index, "lifecycle_state"].value_counts().to_dict()

    repair_output = monitored_output.drop(index=output.index)
    missing_factor_counts = {
        factor: int(
            repair_output["publication_eligibility"]
            .map(
                lambda eligibility, factor_id=factor: factor_id
                in eligibility.get("missingFactorIds", [])
            )
            .sum()
        )
        for factor in [
            "earnings",
            "economics",
            "execution",
            "balance_sheet",
            "management_delivery",
        ]
    }

    safe_output = output.astype(object).where(pd.notna(output), None)

    return {
        "name": "Business Momentum",
        "methodology": "Business Momentum Score (BMS)",
        "version": "nifty500-bms-v1",
        "company_count": len(output),
        "monitored_company_count": len(monitored_output),
        "excluded_company_count": len(repair_output),
        "publication_policy": {
            "minimumCompleteFactors": 4,
            "minimumCoverageWeight": 0.75,
            "mandatoryFactors": ["earnings", "economics"],
        },
        "repair_queue_summary": {
            "company_count": len(repair_output),
            "missing_factor_counts": missing_factor_counts,
        },
        "stage_counts": {
            "watch": int(lifecycle_counts.get("Watch", 0)),
            "emerging": int(lifecycle_counts.get("Emerging", 0)),
            "building": int(lifecycle_counts.get("Building", 0)),
            "established": int(lifecycle_counts.get("Established", 0)),
            "outside": 0,
            "fading_warnings": int(lifecycle_counts.get("Fading", 0)),
        },
        "companies": safe_output.to_dict(orient="records"),
    }


@app.get("/bms/research-context/{symbol}")
def bms_research_context(symbol: str):
    """
    Read-only research context for the BMS Research Agent.

    The deterministic BMS engine remains the source of truth.
    This endpoint does not calculate, alter, upgrade or downgrade BMS.
    It exposes the latest BMS signal together with the fresh
    ChangeRecords for the latest period.
    """

    symbol = symbol.strip().upper()

    # 1. Get the latest deterministic BMS/lifecycle signal
    lifecycle = current_bms_lifecycle()
    companies = lifecycle.get("companies", [])

    company_signal = next(
        (company for company in companies if str(company.get("symbol", "")).upper() == symbol),
        None,
    )

    if company_signal is None:
        return {
            "symbol": symbol,
            "found": False,
            "message": "No BMS lifecycle record found for this symbol.",
        }

    period = str(company_signal.get("period"))

    # 2. Read fresh ChangeRecords for the latest BMS period
    connection = sqlite3.connect(str(BMS_DB_FILE))
    connection.row_factory = sqlite3.Row

    try:
        rows = connection.execute(
            """
            SELECT
                cr.id,
                cr.metric_or_topic,
                cr.category,
                cr.change_type,
                cr.previous_period,
                cr.current_period,
                cr.previous_value,
                cr.current_value,
                cr.change_value,
                cr.direction,
                cr.confidence,
                cr.css_score,
                cr.magnitude_score,
                cr.persistence_score,
                cr.economic_importance_score,
                cr.novelty_score,
                cr.evidence_strength_score,
                cr.specificity_score
            FROM change_records cr
            JOIN companies c
                ON c.id = cr.company_id
            WHERE
                (
                    UPPER(COALESCE(c.nse_symbol, '')) = ?
                    OR UPPER(COALESCE(c.symbol, '')) = ?
                )
                AND cr.current_period = ?
            ORDER BY cr.id
            """,
            (symbol, symbol, period),
        ).fetchall()
    finally:
        connection.close()

    # 3. Convert internal records into clean agent drivers
    fresh_drivers = []

    for row in rows:
        metric = str(row["metric_or_topic"] or "").strip()

        factor_mapping = map_evidence_to_tcs_factor(evidence_type=metric)

        thesis_direction = infer_thesis_direction(
            metric_or_topic=metric,
            change_direction=row["direction"],
        )

        fresh_drivers.append(
            {
                "change_record_id": row["id"],
                "metric": metric,
                "factor": (factor_mapping.factor_name if factor_mapping is not None else None),
                "previous_period": row["previous_period"],
                "current_period": row["current_period"],
                "previous_value": row["previous_value"],
                "current_value": row["current_value"],
                "change_value": row["change_value"],
                "raw_direction": row["direction"],
                "thesis_direction": (
                    thesis_direction.direction if thesis_direction is not None else "neutral"
                ),
                "confidence": (float(row["confidence"]) if row["confidence"] is not None else None),
                "css_score": (float(row["css_score"]) if row["css_score"] is not None else None),
                "magnitude_score": (
                    float(row["magnitude_score"]) if row["magnitude_score"] is not None else None
                ),
                "persistence_score": (
                    float(row["persistence_score"])
                    if row["persistence_score"] is not None
                    else None
                ),
                "economic_importance_score": (
                    float(row["economic_importance_score"])
                    if row["economic_importance_score"] is not None
                    else None
                ),
                "novelty_score": (
                    float(row["novelty_score"]) if row["novelty_score"] is not None else None
                ),
                "evidence_strength_score": (
                    float(row["evidence_strength_score"])
                    if row["evidence_strength_score"] is not None
                    else None
                ),
                "specificity_score": (
                    float(row["specificity_score"])
                    if row["specificity_score"] is not None
                    else None
                ),
            }
        )

    return {
        "symbol": symbol,
        "found": True,
        "period": period,
        "bms_signal": {
            "bms_raw": company_signal.get("bms"),
            "bms_display": max(
                0,
                min(
                    100,
                    math.floor(
                        50 + (float(company_signal.get("bms") or 0) / 0.4) * 50 + 0.50000001
                    ),
                ),
            ),
            "previous_bms_raw": company_signal.get("previous_bms"),
            "previous2_bms_raw": company_signal.get("previous2_bms"),
            "bms_change_raw": company_signal.get("bms_change"),
            "bms_change_points": max(
                -50,
                min(
                    50,
                    math.floor(
                        (float(company_signal.get("bms_change") or 0) / 0.4) * 50 + 0.50000001
                    ),
                ),
            ),
            "momentum_state": company_signal.get("momentum_state"),
            "lifecycle_stage": company_signal.get("lifecycle_stage"),
            "lifecycle_qualification": company_signal.get("lifecycle_qualification"),
            "fading_warning": company_signal.get("fading_warning"),
            "evidence_count": company_signal.get("evidence_count"),
        },
        "factor_scores": {
            "earnings": company_signal.get("earnings"),
            "economics": company_signal.get("economics"),
            "execution": company_signal.get("execution"),
            "balance_sheet": company_signal.get("balance_sheet"),
            "management_delivery": company_signal.get("management_delivery"),
        },
        "fresh_drivers": fresh_drivers,
        "agent_instructions": {
            "purpose": "Investigate why the deterministic BMS signal changed.",
            "must_not": "Recalculate, override or alter BMS.",
            "research_focus": "Verify the fresh drivers using official evidence, explain why they changed, identify contradictory evidence and state what the next result should confirm.",
        },
        "source": "business-momentum-engine",
    }
