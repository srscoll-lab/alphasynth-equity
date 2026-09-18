import json
import math
import os
import re
import sqlite3
from pathlib import Path

import pandas as pd
from fastapi import FastAPI

from .factor_analysis import load_factor_analyses
from .publication_eligibility import FACTOR_WEIGHTS, assess_publication_eligibility
from .tcs_evidence_mapping import map_evidence_to_tcs_factor
from .tcs_state import classify_tcs_state
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

BMS_LEGACY_FUNDAMENTALS_FILE = Path(
    os.environ.get(
        "BMS_LEGACY_FUNDAMENTALS_FILE",
        str(_bms_artifact_root / "final_validation" / "nifty500_bms_v1_fundamentals.csv"),
    )
)

BMS_LEGACY_SNAPSHOT_DATE = os.environ.get("BMS_LEGACY_SNAPSHOT_DATE", "2026-08-22")

BMS_SUPPLEMENTAL_EVIDENCE_FILE = Path(
    os.environ.get(
        "BMS_SUPPLEMENTAL_EVIDENCE_FILE",
        str(_bms_artifact_root / "src" / "stock_intelligence" / "bms_launch_factor_evidence.csv"),
    )
)

BMS_CONTROLLED_COHORT_FILE = Path(
    os.environ.get(
        "BMS_CONTROLLED_COHORT_FILE",
        str(_bms_artifact_root / "src" / "stock_intelligence" / "bms_controlled_cohort.json"),
    )
)


def _controlled_cohort_domains() -> dict[str, set[str]]:
    if not BMS_CONTROLLED_COHORT_FILE.exists():
        return {}
    payload = json.loads(BMS_CONTROLLED_COHORT_FILE.read_text(encoding="utf-8"))
    return {
        str(company["symbol"]).strip().upper(): {
            *(str(domain).strip().lower() for domain in company.get("officialDomains", [])),
            "nseindia.com",
            "bseindia.com",
        }
        for company in payload.get("companies", [])
    }

BMS_DISPLAY_RANGE = 0.75


def _four_factor_score(row: pd.Series) -> float:
    """Calculate the BMS V1.1 score from the four core factors."""
    return round(sum(float(row[factor]) * weight for factor, weight in FACTOR_WEIGHTS.items()), 4)


def bms_display_score(value: float | None) -> int:
    """Match the 0-100 display conversion used by every AlphaSynth surface."""
    raw = float(value or 0)
    displayed = math.floor(50 + (raw / BMS_DISPLAY_RANGE) * 50 + 0.50000001)
    return max(0, min(100, displayed))


def bms_display_change_points(value: float | None) -> int:
    """Convert raw BMS movement into the same display-point scale as the UI."""
    raw = float(value or 0)
    displayed = math.floor((raw / BMS_DISPLAY_RANGE) * 50 + 0.50000001)
    return max(-50, min(50, displayed))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "bms-api",
    }


@app.get("/bms/provenance-repair/{symbol}")
def bms_provenance_repair(symbol: str):
    """Expose stored comparisons as anchors for official-source recovery.

    This endpoint never makes a company publishable and never changes its
    score.  It returns the exact values already used by BMS so a separate
    research worker can find the dated official document that supports them.
    """
    symbol = symbol.strip().upper()
    connection = sqlite3.connect(str(BMS_DB_FILE))
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT
                cr.id AS change_record_id,
                cr.metric_or_topic AS metric_name,
                cr.previous_period,
                cr.current_period,
                cr.previous_value,
                cr.current_value,
                cr.change_value,
                cr.confidence,
                COALESCE(current_observation.unit, previous_observation.unit) AS unit,
                previous_observation.period_end_date AS previous_period_end_date,
                current_observation.period_end_date AS current_period_end_date,
                COALESCE(current_observation.source_type, previous_observation.source_type) AS legacy_source_type
            FROM change_records cr
            JOIN companies c ON c.id = cr.company_id
            LEFT JOIN financial_observations previous_observation ON
                previous_observation.id = (
                    SELECT fo.id FROM financial_observations fo
                    WHERE fo.company_id = cr.company_id
                      AND LOWER(REPLACE(fo.metric_name, ' ', '_')) = LOWER(REPLACE(cr.metric_or_topic, ' ', '_'))
                      AND fo.period_label = cr.previous_period
                    ORDER BY fo.id DESC LIMIT 1
                )
            LEFT JOIN financial_observations current_observation ON
                current_observation.id = (
                    SELECT fo.id FROM financial_observations fo
                    WHERE fo.company_id = cr.company_id
                      AND LOWER(REPLACE(fo.metric_name, ' ', '_')) = LOWER(REPLACE(cr.metric_or_topic, ' ', '_'))
                      AND fo.period_label = cr.current_period
                    ORDER BY fo.id DESC LIMIT 1
                )
            WHERE UPPER(COALESCE(c.nse_symbol, c.symbol)) = ?
            ORDER BY cr.id DESC
            """,
            (symbol,),
        ).fetchall()
        observation_rows = connection.execute(
            """
            SELECT
                fo.id AS observation_id,
                fo.metric_name,
                fo.metric_value,
                fo.unit,
                fo.period_label,
                fo.period_end_date,
                fo.source_type,
                fo.confidence
            FROM financial_observations fo
            JOIN companies c ON c.id = fo.company_id
            WHERE UPPER(COALESCE(c.nse_symbol, c.symbol)) = ?
            ORDER BY fo.id DESC
            """,
            (symbol,),
        ).fetchall()
    except sqlite3.Error as error:
        return {"symbol": symbol, "found": False, "error": str(error), "candidates": []}
    finally:
        connection.close()

    candidates = []
    seen = set()
    for row in rows:
        mapping = map_evidence_to_tcs_factor(evidence_type=str(row["metric_name"] or ""))
        if mapping is None or mapping.factor_name not in FACTOR_WEIGHTS:
            continue
        key = (
            mapping.factor_name,
            str(row["metric_name"] or "").strip().lower(),
            str(row["previous_period"] or ""),
            str(row["current_period"] or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        candidates.append({
            "change_record_id": row["change_record_id"],
            "factor": mapping.factor_name,
            "metric_name": row["metric_name"],
            "previous_period": row["previous_period"],
            "current_period": row["current_period"],
            "previous_value": row["previous_value"],
            "current_value": row["current_value"],
            "change_value": row["change_value"],
            "unit": row["unit"],
            "previous_period_end_date": row["previous_period_end_date"],
            "current_period_end_date": row["current_period_end_date"],
            "legacy_source_type": row["legacy_source_type"],
            "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
        })

    # Some legacy imports created observations without ChangeRecords. Pair the
    # stored values deterministically for the latest reporting period so the
    # provenance worker can recover their official documents as well.
    current_period = next(
        (str(row["current_period"] or "").strip() for row in rows if row["current_period"]),
        "",
    )
    match = re.fullmatch(r"Q([1-4])\s+FY(\d{2,4})", current_period.upper())
    previous_period = (
        f"Q{match.group(1)} FY{int(match.group(2)) - 1:0{len(match.group(2))}d}"
        if match else ""
    )
    observations_by_metric_and_period = {
        (
            str(row["metric_name"] or "").strip().lower().replace(" ", "_"),
            str(row["period_label"] or "").strip().upper(),
        ): row
        for row in observation_rows
    }
    for row in observation_rows:
        metric_name = str(row["metric_name"] or "").strip()
        normalized_metric = metric_name.lower().replace(" ", "_")
        if str(row["period_label"] or "").strip().upper() != current_period.upper():
            continue
        prior = observations_by_metric_and_period.get((normalized_metric, previous_period.upper()))
        mapping = map_evidence_to_tcs_factor(evidence_type=metric_name)
        key = (mapping.factor_name if mapping else None, normalized_metric, previous_period, current_period)
        if mapping is None or mapping.factor_name not in FACTOR_WEIGHTS or prior is None or key in seen:
            continue
        seen.add(key)
        candidates.append({
            "change_record_id": None,
            "factor": mapping.factor_name,
            "metric_name": metric_name,
            "previous_period": previous_period,
            "current_period": current_period,
            "previous_value": prior["metric_value"],
            "current_value": row["metric_value"],
            "change_value": None,
            "unit": row["unit"] or prior["unit"],
            "previous_period_end_date": prior["period_end_date"],
            "current_period_end_date": row["period_end_date"],
            "legacy_source_type": row["source_type"] or prior["source_type"],
            "confidence": min(
                float(value) for value in (row["confidence"], prior["confidence"])
                if value is not None
            ) if row["confidence"] is not None or prior["confidence"] is not None else None,
        })
    known_official_sources = []
    if BMS_SUPPLEMENTAL_EVIDENCE_FILE.exists():
        try:
            supplemental = pd.read_csv(BMS_SUPPLEMENTAL_EVIDENCE_FILE).fillna("")
            supplemental = supplemental[
                supplemental["symbol"].astype(str).str.strip().str.upper() == symbol
            ]
            seen_sources = set()
            for _, item in supplemental.iterrows():
                for column in ("source_ref", "previous_source_ref", "current_source_ref"):
                    url = str(item.get(column, "")).strip()
                    if not url.startswith(("https://", "http://")) or url in seen_sources:
                        continue
                    seen_sources.add(url)
                    known_official_sources.append({
                        "url": url,
                        "published_at": str(item.get("source_date", "")).strip(),
                        "source_type": str(item.get("source_type", "")).strip(),
                    })
        except (KeyError, ValueError, pd.errors.ParserError):
            known_official_sources = []
    return {
        "symbol": symbol,
        "found": bool(candidates),
        "candidates": candidates,
        "known_official_sources": known_official_sources,
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

    Historical artifacts may contain the retired five-factor score. Recalculate
    the release score from the four compulsory core factors at the API boundary
    so every endpoint applies the same BMS V1.1 methodology.
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
    }

    missing = required - set(df.columns)

    if missing:
        raise ValueError("BMS history missing columns: " + ", ".join(sorted(missing)))

    df["symbol"] = df["symbol"].astype(str).str.strip().str.upper()
    df["tcs"] = df.apply(_four_factor_score, axis=1)
    df["state"] = df["tcs"].map(lambda score: classify_tcs_state(tcs_score=float(score)))

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
    df = _prepare_history()

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
    df = _prepare_history()

    latest = df.sort_values(["symbol", "_period_rank"]).groupby("symbol", as_index=False).tail(1)

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

    Lifecycle interpretation is recalculated from the four-factor BMS V1.1
    history so retired Management Delivery values cannot affect publication.
    """

    if not BMS_PRODUCT_FILE.exists():
        raise FileNotFoundError(f"BMS product file not found: {BMS_PRODUCT_FILE}")

    product = pd.read_csv(BMS_PRODUCT_FILE)
    history = _prepare_history()

    product["symbol"] = product["symbol"].astype(str).str.strip().str.upper()

    latest_history = history.sort_values(["symbol", "_period_rank"]).groupby("symbol", as_index=False).tail(1)
    latest_by_symbol = latest_history.set_index("symbol")
    product["bms"] = product["symbol"].map(latest_by_symbol["tcs"])
    product["state"] = product["symbol"].map(latest_by_symbol["state"])
    product["previous_bms"] = product["symbol"].map(latest_by_symbol["previous_bms"])
    product["q1_fy26_bms"] = product["symbol"].map(latest_by_symbol["previous2_bms"])
    product["bms_change_vs_previous_quarter"] = (
        product["bms"] - product["previous_bms"]
    ).round(4)
    product["bms_change_display"] = product["bms_change_vs_previous_quarter"]

    def four_factor_lifecycle(row):
        current = float(row["bms"])
        previous = row["previous_bms"]
        earlier = row["q1_fy26_bms"]
        change = row["bms_change_vs_previous_quarter"]
        evidence = int(row["evidence_count"])
        if pd.notna(change) and float(change) <= -0.10:
            return "Fading"
        if (pd.notna(previous) and pd.notna(earlier) and current >= 0.38
                and float(previous) >= 0.38 and float(earlier) >= 0.18
                and evidence >= 6 and float(change) >= -0.03):
            return "Established"
        if (pd.notna(previous) and current >= 0.38 and float(previous) >= 0.18
                and evidence >= 4 and float(change) > 0):
            return "Building"
        if pd.notna(change) and current >= 0.18 and float(change) >= 0.18 and evidence >= 2:
            return "Emerging"
        return "Watch"

    product["lifecycle_state"] = product.apply(four_factor_lifecycle, axis=1)
    product["reversal_warning"] = product["bms_change_vs_previous_quarter"].map(
        lambda change: "High" if change <= -0.12 else "Moderate" if change <= -0.06 else "None"
    )

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
            ]
        }
        for _, row in product.iterrows()
    }
    analyses = load_factor_analyses(
        BMS_DB_FILE,
        periods_by_symbol=periods_by_symbol,
        scores_by_symbol=scores_by_symbol,
        supplemental_evidence_file=BMS_SUPPLEMENTAL_EVIDENCE_FILE,
        official_domains_by_symbol=_controlled_cohort_domains(),
        legacy_fundamentals_file=BMS_LEGACY_FUNDAMENTALS_FILE,
        legacy_snapshot_date=BMS_LEGACY_SNAPSHOT_DATE,
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
    eligible_eligibilities = output["publication_eligibility"].tolist()
    monitored_eligibilities = monitored_output["publication_eligibility"].tolist()
    factor_ids = list(FACTOR_WEIGHTS)
    qualified_factor_counts = {
        factor: sum(
            factor in eligibility.get("completeFactorIds", [])
            for eligibility in eligible_eligibilities
        )
        for factor in factor_ids
    }
    monitored_factor_counts = {
        factor: sum(
            factor in eligibility.get("completeFactorIds", [])
            for eligibility in monitored_eligibilities
        )
        for factor in factor_ids
    }
    missing_factor_counts = {
        factor: int(
            repair_output["publication_eligibility"]
            .map(
                lambda eligibility, factor_id=factor: factor_id
                in eligibility.get("missingFactorIds", [])
            )
            .sum()
        )
        for factor in FACTOR_WEIGHTS
    }

    safe_output = output.astype(object).where(pd.notna(output), None)
    monitored_companies = [
        {
            "symbol": row["symbol"],
            "company_name": row.get("company_name") or row["symbol"],
            "publication_eligibility": row["publication_eligibility"],
        }
        for _, row in monitored_output.iterrows()
    ]

    return {
        "name": "Business Momentum",
        "methodology": "Business Momentum Score (BMS)",
        "version": "nifty500-bms-v1.1-four-factor",
        "company_count": len(output),
        "monitored_company_count": len(monitored_output),
        "excluded_company_count": len(repair_output),
        "monitored_companies": monitored_companies,
        "publication_policy": {
            "minimumCompleteFactors": 4,
            "minimumCoverageWeight": 1.0,
            "mandatoryFactors": list(FACTOR_WEIGHTS),
            "targetCompleteFactors": 4,
            "targetCoverageWeight": 1.0,
        },
        "coverage_summary": {
            "fourFactorCompleteCompanies": len(output),
            "qualifiedFactorCounts": qualified_factor_counts,
            "monitoredFactorCounts": monitored_factor_counts,
            "target": "All four sourced, comparable core factors for every published company.",
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
            "bms_display": bms_display_score(company_signal.get("bms")),
            "previous_bms_raw": company_signal.get("previous_bms"),
            "previous2_bms_raw": company_signal.get("previous2_bms"),
            "bms_change_raw": company_signal.get("bms_change"),
            "bms_change_points": bms_display_change_points(
                company_signal.get("bms_change")
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
        },
        # Preserve the same sourced factor record used by the publication gate.
        # Consumers must not reconstruct a narrower view from promoted drivers
        # and accidentally drop admitted supplemental official evidence.
        "factor_analysis": company_signal.get("factor_analysis"),
        "publication_eligibility": company_signal.get("publication_eligibility"),
        "fresh_drivers": fresh_drivers,
        "agent_instructions": {
            "purpose": "Investigate why the deterministic BMS signal changed.",
            "must_not": "Recalculate, override or alter BMS.",
            "research_focus": "Verify the fresh drivers using official evidence, explain why they changed, identify contradictory evidence and state what the next result should confirm.",
        },
        "source": "business-momentum-engine",
    }
