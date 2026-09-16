from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .management_delivery_scoring import (
    assess_numeric_target_rule,
)
from .models import (
    ManagementDeliveryAssessment,
    ManagementGuidance,
    ManagementOutcome,
    ThesisEvidence,
)


def create_numeric_management_delivery(
    *,
    db: Session,
    company_id: int,
    thesis_id: int,
    topic: str,
    guidance_text: str,
    target_rule: str = "minimum",
    target_value: float | None = None,
    target_min: float | None = None,
    target_max: float | None = None,
    target_unit: str,
    target_period: str,
    actual_value: float,
    outcome_period: str,
    guidance_confidence: float = 0.95,
    outcome_confidence: float = 0.97,
    raw_guidance_item_id: int | None = None,
    raw_outcome_item_id: int | None = None,
) -> tuple[
    ManagementGuidance,
    ManagementOutcome,
    ManagementDeliveryAssessment,
    ThesisEvidence,
]:
    """
    Create a complete numeric management-delivery chain.

    Supported target rules:
        minimum
        maximum
        range

    The implementation is company-independent.
    """

    normalized_rule = target_rule.strip().lower()

    result = assess_numeric_target_rule(
        actual_value=actual_value,
        target_rule=normalized_rule,
        target_value=target_value,
        target_min=target_min,
        target_max=target_max,
    )

    guidance = ManagementGuidance(
        company_id=company_id,
        raw_item_id=raw_guidance_item_id,
        topic=topic,
        guidance_type="numeric",
        guidance_text=guidance_text,
        target_value=(
            Decimal(str(target_value))
            if target_value is not None
            else None
        ),
        target_rule=normalized_rule,
        target_min=(
            Decimal(str(target_min))
            if target_min is not None
            else None
        ),
        target_max=(
            Decimal(str(target_max))
            if target_max is not None
            else None
        ),
        target_unit=target_unit,
        target_period=target_period,
        confidence=Decimal(
            str(guidance_confidence)
        ),
        status="open",
    )

    db.add(guidance)
    db.flush()

    outcome = ManagementOutcome(
        guidance_id=guidance.id,
        raw_item_id=raw_outcome_item_id,
        actual_value=Decimal(str(actual_value)),
        actual_text=(
            f"Actual {topic} was {actual_value} "
            f"{target_unit} in {outcome_period}."
        ),
        outcome_period=outcome_period,
        confidence=Decimal(
            str(outcome_confidence)
        ),
    )

    db.add(outcome)
    db.flush()

    assessment_confidence = min(
        float(guidance_confidence),
        float(outcome_confidence),
    )

    assessment = ManagementDeliveryAssessment(
        guidance_id=guidance.id,
        outcome_id=outcome.id,
        delivery_status=result.delivery_status,
        direction=result.direction,
        delivery_score=Decimal(
            str(result.delivery_score)
        ),
        rationale=result.rationale,
        confidence=Decimal(
            str(assessment_confidence)
        ),
        model_version=result.model_version,
    )

    db.add(assessment)
    db.flush()

    evidence = ThesisEvidence(
        thesis_id=thesis_id,
        raw_item_id=raw_outcome_item_id,
        change_record_id=None,
        evidence_type="management_delivery",
        direction=result.direction,
        summary=result.rationale,
        confidence=Decimal(
            str(assessment_confidence)
        ),
    )

    db.add(evidence)

    guidance.status = "assessed"

    db.commit()

    db.refresh(guidance)
    db.refresh(outcome)
    db.refresh(assessment)
    db.refresh(evidence)

    return (
        guidance,
        outcome,
        assessment,
        evidence,
    )