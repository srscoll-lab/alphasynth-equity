from __future__ import annotations

import sqlite3
from collections import defaultdict
from pathlib import Path

from .publication_eligibility import FACTOR_WEIGHTS
from .tcs_evidence_mapping import map_evidence_to_tcs_factor


def _number(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def _confidence(values: list[float]) -> str:
    if not values:
        return "unavailable"
    mean = sum(values) / len(values)
    if mean >= 0.8:
        return "high"
    if mean >= 0.6:
        return "medium"
    return "low"


def empty_factor_analysis(period: str | None = None) -> dict:
    return {
        "schema_version": "1.0.0",
        "methodology_version": "BMS_V1",
        "comparison_basis": "same-quarter-prior-year",
        "generated_at": None,
        "factors": [
            {
                "id": factor_id,
                "weight": weight,
                "previous": {"period": None, "factor_score": None, "metrics": []},
                "current": {"period": period, "factor_score": None, "metrics": []},
                "evidence_refs": [],
                "availability": "unavailable",
                "confidence": "unavailable",
                "explanation": None,
            }
            for factor_id, weight in FACTOR_WEIGHTS.items()
        ],
    }


def load_factor_analyses(
    db_file: Path,
    *,
    periods_by_symbol: dict[str, str],
    scores_by_symbol: dict[str, dict[str, float | None]],
) -> dict[str, dict]:
    """Build sourced previous/current factor comparisons in one database pass.

    Every admitted comparable ChangeRecord is visible here, including a small
    or neutral change that correctly produced no promoted thesis evidence. This
    distinction prevents an observed neutral factor from being confused with a
    missing factor. Management commentary without a comparable ChangeRecord
    remains partial and cannot qualify a company by itself.
    """

    analyses = {
        symbol: empty_factor_analysis(period) for symbol, period in periods_by_symbol.items()
    }
    if not db_file.exists():
        return analyses

    connection = sqlite3.connect(str(db_file))
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT
                UPPER(COALESCE(c.nse_symbol, c.symbol)) AS symbol,
                cr.id AS change_record_id,
                cr.metric_or_topic,
                cr.previous_period,
                cr.current_period,
                cr.previous_value,
                cr.current_value,
                cr.change_value,
                cr.confidence AS change_confidence
            FROM change_records cr
            JOIN companies c ON c.id = cr.company_id
            ORDER BY c.id, cr.id
            """
        ).fetchall()
    except sqlite3.Error:
        return analyses
    finally:
        connection.close()

    grouped: dict[str, dict[str, list[sqlite3.Row]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        symbol = str(row["symbol"] or "").strip().upper()
        current_period = periods_by_symbol.get(symbol)
        if not current_period or row["current_period"] != current_period:
            continue
        metric = str(row["metric_or_topic"] or "")
        mapping = map_evidence_to_tcs_factor(evidence_type=metric)
        if mapping is None:
            continue
        grouped[symbol][mapping.factor_name].append(row)

    for symbol, factor_rows in grouped.items():
        analysis = analyses[symbol]
        factors = {factor["id"]: factor for factor in analysis["factors"]}
        for factor_id, admitted in factor_rows.items():
            factor = factors[factor_id]
            previous_metrics = []
            current_metrics = []
            refs = []
            confidences = []
            previous_period = None
            current_period = periods_by_symbol[symbol]

            for row in admitted:
                if row["change_record_id"] is None:
                    continue
                metric = str(row["metric_or_topic"])
                previous_period = previous_period or row["previous_period"]
                current_period = row["current_period"] or current_period
                previous_metrics.append(
                    {
                        "key": metric,
                        "label": metric.replace("_", " "),
                        "value": _number(row["previous_value"]),
                    }
                )
                current_metrics.append(
                    {
                        "key": metric,
                        "label": metric.replace("_", " "),
                        "value": _number(row["current_value"]),
                        "change": _number(row["change_value"]),
                    }
                )
                refs.append(f"change-record-{row['change_record_id']}")
                confidence = row["change_confidence"]
                if confidence is not None:
                    confidences.append(float(confidence))

            score = scores_by_symbol.get(symbol, {}).get(factor_id)
            factor["previous"] = {
                "period": previous_period,
                "factor_score": None,
                "metrics": previous_metrics,
            }
            factor["current"] = {
                "period": current_period,
                "factor_score": score if current_metrics else None,
                "metrics": current_metrics,
            }
            factor["evidence_refs"] = refs
            factor["availability"] = (
                "complete"
                if previous_metrics and current_metrics
                else "partial"
                if previous_metrics or current_metrics
                else "unavailable"
            )
            factor["confidence"] = _confidence(confidences)
            factor["explanation"] = (
                f"{len(current_metrics)} sourced comparable measurement"
                f"{'s' if len(current_metrics) != 1 else ''} support this factor."
                if current_metrics
                else None
            )

    return analyses
