from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from .publication_eligibility import FACTOR_WEIGHTS
from .tcs_evidence_mapping import map_evidence_to_tcs_factor

_REPORTING_PERIOD_EQUIVALENTS = {
    "3M": "Q1",
    "6M": "Q2",
    "H1": "Q2",
    "9M": "Q3",
    "FY": "Q4",
}


def _period_matches_reporting_quarter(reporting_period: str, evidence_period: str) -> bool:
    """Accept a cumulative period only for its matching reporting quarter.

    Companies commonly report Q3 results as nine-month figures. Preserving the
    source label avoids presenting cumulative evidence as a single quarter,
    while the equivalence check still prevents evidence from another reporting
    period from entering the publication gate.
    """

    reporting = re.fullmatch(r"Q([1-4])\s+FY(\d{2,4})", reporting_period.strip().upper())
    evidence = re.fullmatch(r"(3M|6M|9M|H1|FY)\s+FY(\d{2,4})", evidence_period.strip().upper())
    if not reporting or not evidence:
        return reporting_period.strip().upper() == evidence_period.strip().upper()
    return (
        _REPORTING_PERIOD_EQUIVALENTS[evidence.group(1)] == f"Q{reporting.group(1)}"
        and evidence.group(2) == reporting.group(2)
    )


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
    supplemental_evidence_file: Path | None = None,
    official_domains_by_symbol: dict[str, set[str]] | None = None,
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

    grouped: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
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

    # A small launch file may attach manually verified official evidence when an
    # exchange blocks server-side PDF retrieval. It is subject to the same
    # period, taxonomy, source-date and cutoff rules as database evidence.
    trusted_sources = {
        "company_filing", "company_results", "company_presentation",
        "company_transcript", "nse_filing", "bse_filing",
        "audited_financial_statement",
    }
    if supplemental_evidence_file and supplemental_evidence_file.exists():
        with supplemental_evidence_file.open(encoding="utf-8", newline="") as handle:
            for item in csv.DictReader(handle):
                symbol = str(item.get("symbol") or "").strip().upper()
                current_period = periods_by_symbol.get(symbol)
                evidence_current_period = str(item.get("current_period") or "").strip()
                metric = str(item.get("metric_name") or "").strip().lower()
                unit = str(item.get("unit") or "").strip()
                source_ref = str(item.get("source_ref") or "").strip()
                source_refs = list(dict.fromkeys(
                    ref for ref in [
                        str(item.get("previous_source_ref") or "").strip(),
                        str(item.get("current_source_ref") or "").strip(),
                        source_ref,
                    ] if ref
                ))
                source_hosts = [
                    (urlparse(ref).hostname or "").lower() for ref in source_refs
                ]
                approved_domains = (official_domains_by_symbol or {}).get(symbol)
                sources_are_official = bool(source_refs) and (
                    approved_domains is None or all(
                        any(host == domain or host.endswith(f".{domain}")
                            for domain in approved_domains)
                        for host in source_hosts
                    )
                )
                mapping = map_evidence_to_tcs_factor(evidence_type=metric)
                try:
                    source_date = date.fromisoformat(str(item.get("source_date") or ""))
                    cutoff_date = date.fromisoformat(str(item.get("cutoff_date") or ""))
                    previous_value = float(str(item.get("previous_value") or ""))
                    current_value = float(str(item.get("current_value") or ""))
                    confidence = float(str(item.get("confidence") or ""))
                except (TypeError, ValueError):
                    continue
                if (
                    not current_period
                    or not _period_matches_reporting_quarter(
                        current_period, evidence_current_period
                    )
                    or mapping is None
                    or not unit
                    or not sources_are_official
                    or mapping.factor_name != str(item.get("factor") or "").strip().lower()
                    or str(item.get("source_type") or "").strip().lower() not in trusted_sources
                    or source_date > cutoff_date
                    or not 0 <= confidence <= 1
                ):
                    continue
                grouped[symbol][mapping.factor_name].append({
                    "change_record_id": None,
                    "evidence_refs": source_refs,
                    "metric_or_topic": metric,
                    "unit": unit,
                    "previous_period": str(item.get("previous_period") or "").strip(),
                    "current_period": evidence_current_period,
                    "previous_value": previous_value,
                    "current_value": current_value,
                    "change_value": current_value - previous_value,
                    "change_confidence": confidence,
                })

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
                evidence_refs = (
                    row.get("evidence_refs", [])
                    if isinstance(row, dict)
                    else [f"change-record-{row['change_record_id']}"]
                )
                if not evidence_refs:
                    continue
                metric = str(row["metric_or_topic"])
                unit = row.get("unit") if isinstance(row, dict) else None
                previous_period = previous_period or row["previous_period"]
                current_period = row["current_period"] or current_period
                previous_metrics.append(
                    {
                        "key": metric,
                        "label": metric.replace("_", " "),
                        "value": _number(row["previous_value"]),
                        "unit": unit,
                    }
                )
                current_metrics.append(
                    {
                        "key": metric,
                        "label": metric.replace("_", " "),
                        "value": _number(row["current_value"]),
                        "unit": unit,
                        "change": _number(row["change_value"]),
                    }
                )
                refs.extend(evidence_refs)
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
            factor["evidence_refs"] = list(dict.fromkeys(refs))
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
