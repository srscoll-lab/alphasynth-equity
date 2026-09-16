from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from .models import ChangeRecord, ThesisEvidence
from .tcs import TCSResult, calculate_tcs
from .tcs_evidence_mapping import map_evidence_to_tcs_factor
from .tcs_factor_scoring import calculate_factor_score
from .thesis_engine import evaluate_thesis_impact


def _impact_score_from_css(
    db: Session,
    *,
    evidence: ThesisEvidence,
) -> float:
    """
    Convert Change Strength Score (CSS) from 0-100
    into the 0-10 impact scale used by ThesisImpact.

    Old ThesisEvidence rows may not have a linked ChangeRecord.
    In that case V1 falls back to impact_score = 5.0.
    """

    if evidence.change_record_id is None:
        return 5.0

    change_record = db.get(
        ChangeRecord,
        evidence.change_record_id,
    )

    if change_record is None:
        return 5.0

    if change_record.css_score is None:
        return 5.0

    css_score = float(change_record.css_score)

    impact_score = css_score / 10.0

    if impact_score < 0:
        return 0.0

    if impact_score > 10:
        return 10.0

    return round(impact_score, 2)


def calculate_tcs_from_thesis_evidence(
    *,
    db: Session,
    thesis_id: int,
) -> TCSResult:
    """
    Calculate TCS V1 directly from stored ThesisEvidence.

    Workflow:

        ThesisEvidence
        -> map to one of five TCS factors
        -> retrieve linked ChangeRecord
        -> convert CSS into 0-10 impact score
        -> combine impact with evidence confidence
        -> calculate factor score
        -> calculate overall TCS

    For older evidence without a linked ChangeRecord or CSS,
    impact_score falls back to 5.0.
    """

    evidence_rows = (
        db.query(ThesisEvidence)
        .filter(
            ThesisEvidence.thesis_id == thesis_id
        )
        .order_by(
            ThesisEvidence.observed_at.asc()
        )
        .all()
    )

    impacts_by_factor: dict[str, list] = defaultdict(
        list
    )

    for evidence in evidence_rows:
        mapping = map_evidence_to_tcs_factor(
            evidence_type=evidence.evidence_type
        )

        if mapping is None:
            continue

        direction = evidence.direction.strip().lower()

        if direction not in {
            "strengthens",
            "weakens",
            "neutral",
        }:
            continue

        confidence = (
            float(evidence.confidence)
            if evidence.confidence is not None
            else 0.5
        )

        impact_score = _impact_score_from_css(
            db,
            evidence=evidence,
        )

        impact = evaluate_thesis_impact(
            direction=direction,
            impact_score=impact_score,
            rationale=evidence.summary,
            confidence=confidence,
        )

        impacts_by_factor[
            mapping.factor_name
        ].append(impact)

    earnings = calculate_factor_score(
        impacts_by_factor["earnings"]
    ).score

    economics = calculate_factor_score(
        impacts_by_factor["economics"]
    ).score

    execution = calculate_factor_score(
        impacts_by_factor["execution"]
    ).score

    balance_sheet = calculate_factor_score(
        impacts_by_factor["balance_sheet"]
    ).score

    management_delivery = calculate_factor_score(
        impacts_by_factor["management_delivery"]
    ).score

    return calculate_tcs(
        earnings=earnings,
        economics=economics,
        execution=execution,
        balance_sheet=balance_sheet,
        management_delivery=management_delivery,
    )