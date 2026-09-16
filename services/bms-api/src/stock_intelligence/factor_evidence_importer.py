from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from .change_service import create_numeric_change_record
from .evidence_promotion import promote_change_to_evidence
from .models import ChangeRecord, Company, Thesis
from .tcs_evidence_mapping import map_evidence_to_tcs_factor

TRUSTED_SOURCE_TYPES = {
    "company_filing",
    "company_results",
    "company_presentation",
    "company_transcript",
    "nse_filing",
    "bse_filing",
    "audited_financial_statement",
}

REQUIRED_COLUMNS = {
    "symbol",
    "factor",
    "metric_name",
    "previous_period",
    "current_period",
    "previous_value",
    "current_value",
    "source_type",
    "source_ref",
    "source_date",
    "cutoff_date",
    "confidence",
}


@dataclass(frozen=True)
class FactorEvidenceImportResult:
    inserted: int
    duplicates: int
    rejected: int
    rejection_reasons: dict[str, int]


def _date(value: object) -> datetime:
    parsed = pd.to_datetime(value, errors="raise", utc=True)
    return parsed.to_pydatetime()


def import_factor_evidence_csv(db: Session, path: str | Path) -> FactorEvidenceImportResult:
    """Import dated, comparable evidence produced by the research workflow.

    The importer is deliberately strict and idempotent. It accepts only trusted
    official/exchange source classes, rejects post-cutoff evidence, verifies the
    declared factor against the deterministic taxonomy, and never turns an
    absent observation into a neutral score.
    """

    frame = pd.read_csv(path)
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError("Factor evidence CSV missing columns: " + ", ".join(sorted(missing)))

    companies = {
        str(company.nse_symbol or company.symbol).strip().upper(): company
        for company in db.query(Company).all()
    }
    theses = {
        thesis.company_id: thesis
        for thesis in db.query(Thesis).filter(Thesis.status == "active").all()
    }
    inserted = duplicates = rejected = 0
    reasons: dict[str, int] = {}

    def reject(reason: str) -> None:
        nonlocal rejected
        rejected += 1
        reasons[reason] = reasons.get(reason, 0) + 1

    for _, row in frame.iterrows():
        symbol = str(row["symbol"]).strip().upper()
        company = companies.get(symbol)
        thesis = theses.get(company.id) if company else None
        if company is None or thesis is None:
            reject("unknown_company_or_thesis")
            continue

        source_type = str(row["source_type"]).strip().lower()
        if source_type not in TRUSTED_SOURCE_TYPES:
            reject("untrusted_source_type")
            continue
        try:
            source_date = _date(row["source_date"])
            cutoff_date = _date(row["cutoff_date"])
        except (TypeError, ValueError):
            reject("invalid_date")
            continue
        if source_date > cutoff_date:
            reject("post_cutoff_evidence")
            continue

        metric = str(row["metric_name"]).strip().lower().replace(" ", "_")
        mapping = map_evidence_to_tcs_factor(evidence_type=metric)
        declared_factor = str(row["factor"]).strip().lower()
        if mapping is None or mapping.factor_name != declared_factor:
            reject("factor_mapping_mismatch")
            continue
        try:
            previous_value = float(row["previous_value"])
            current_value = float(row["current_value"])
            confidence = float(row["confidence"])
        except (TypeError, ValueError):
            reject("invalid_numeric_value")
            continue
        if not 0 <= confidence <= 1:
            reject("invalid_confidence")
            continue

        previous_period = str(row["previous_period"]).strip()
        current_period = str(row["current_period"]).strip()
        existing = (
            db.query(ChangeRecord)
            .filter(
                ChangeRecord.company_id == company.id,
                ChangeRecord.metric_or_topic == metric,
                ChangeRecord.previous_period == previous_period,
                ChangeRecord.current_period == current_period,
            )
            .first()
        )
        if existing is not None:
            duplicates += 1
            continue

        record = create_numeric_change_record(
            db,
            company_id=company.id,
            metric_or_topic=metric,
            category=declared_factor,
            previous_value=previous_value,
            current_value=current_value,
            source_type=source_type,
            evidence_text=(
                f"{metric} changed from {previous_value} in {previous_period} to "
                f"{current_value} in {current_period}; source {row['source_ref']}."
            ),
            comparison_type="YoY",
            previous_period=previous_period,
            current_period=current_period,
            confidence=confidence,
        )
        record.first_known_at = source_date.astimezone(UTC)
        db.commit()

        evidence = promote_change_to_evidence(
            db,
            thesis_id=thesis.id,
            change_record=record,
            evidence_type=metric,
        )
        if evidence is None:
            reject("below_materiality_threshold")
            continue
        inserted += 1

    return FactorEvidenceImportResult(
        inserted=inserted,
        duplicates=duplicates,
        rejected=rejected,
        rejection_reasons=reasons,
    )
