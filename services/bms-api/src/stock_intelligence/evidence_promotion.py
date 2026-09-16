from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .models import ChangeRecord, ThesisEvidence
from .thesis_direction_rules import infer_thesis_direction


HARD_EVENT_TYPES = {
    "auditor_resignation",
    "regulatory_restriction",
    "promoter_pledge_event",
    "fraud_or_governance_issue",
    "major_acquisition",
    "major_divestment",
    "ceo_resignation",
    "cfo_resignation",
    "major_plant_shutdown",
    "credit_rating_downgrade",
    "transformative_order",
}


def should_promote_change(
    change_record: ChangeRecord,
    *,
    css_threshold: float = 60.0,
    materiality_threshold: float = 60.0,
) -> bool:
    """
    Decide whether a ChangeRecord is important and credible
    enough to be promoted into ThesisEvidence.

    V2 rule:

        1. Hard events are always promoted.
        2. If CSS exists, use CSS as the primary threshold.
        3. For legacy records without CSS, fall back to
           materiality_score.

    CSS is preferred because it incorporates:
        - economic importance
        - magnitude
        - evidence strength
        - persistence
        - novelty
        - specificity
    """

    if change_record.change_type in HARD_EVENT_TYPES:
        return True

    if change_record.css_score is not None:
        return (
            float(change_record.css_score)
            >= css_threshold
        )

    if change_record.materiality_score is not None:
        return (
            float(change_record.materiality_score)
            >= materiality_threshold
        )

    return False


def promote_change_to_evidence(
    db: Session,
    *,
    thesis_id: int,
    change_record: ChangeRecord,
    evidence_type: str | None = None,
    direction: str | None = None,
) -> ThesisEvidence | None:
    """
    Promote a qualifying ChangeRecord into ThesisEvidence.

    The created ThesisEvidence stores change_record_id,
    preserving the exact link to the underlying ChangeRecord
    and therefore its CSS score.
    """

    if not should_promote_change(change_record):
        return None

    thesis_direction = direction

    if thesis_direction is None:
        inferred = infer_thesis_direction(
            metric_or_topic=change_record.metric_or_topic,
            change_direction=change_record.direction,
        )

        if inferred is not None:
            thesis_direction = inferred.direction
        else:
            thesis_direction = "neutral"

    normalized_direction = (
        thesis_direction.strip().lower()
    )

    if normalized_direction not in {
        "strengthens",
        "weakens",
        "neutral",
    }:
        raise ValueError(
            "direction must be one of: "
            "strengthens, weakens, neutral"
        )

    evidence = ThesisEvidence(
        thesis_id=thesis_id,
        raw_item_id=change_record.raw_item_id,
        change_record_id=change_record.id,
        evidence_type=(
            evidence_type
            or change_record.metric_or_topic
        ),
        direction=normalized_direction,
        summary=(
            change_record.change_value
            or f"{change_record.metric_or_topic} changed"
        ),
        confidence=(
            Decimal(str(change_record.confidence))
            if change_record.confidence is not None
            else None
        ),
        observed_at=change_record.first_known_at,
    )

    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    return evidence