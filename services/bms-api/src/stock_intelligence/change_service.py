from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .change_detection import detect_numeric_change
from .change_strength import calculate_change_strength
from .economic_importance_scoring import (
    calculate_economic_importance_score,
)
from .evidence_strength_scoring import (
    calculate_evidence_strength_score,
)
from .magnitude_scoring import calculate_magnitude_score
from .materiality import calculate_materiality
from .models import ChangeRecord
from .novelty_scoring import calculate_novelty_from_history
from .persistence_history import calculate_persistence_from_history
from .specificity_scoring import calculate_specificity_score


def create_numeric_change_record(
    db: Session,
    *,
    company_id: int,
    metric_or_topic: str,
    category: str,
    previous_value: float,
    current_value: float,
    magnitude_score: float | None = None,
    persistence_score: float | None = None,
    economic_importance_score: float | None = None,
    novelty_score: float | None = None,
    evidence_strength_score: float | None = None,
    specificity_score: float | None = None,
    source_type: str | None = None,
    evidence_text: str | None = None,
    comparison_type: str | None = None,
    previous_period: str | None = None,
    current_period: str | None = None,
    raw_item_id: int | None = None,
    confidence: float | None = None,
) -> ChangeRecord:
    """
    Create one numeric ChangeRecord.

    V1 automatically calculates:
    - magnitude
    - persistence
    - economic importance
    - novelty
    - specificity
    - evidence strength
    - materiality
    - CSS

    Manual overrides remain supported temporarily for
    backward compatibility and testing.
    """

    detected_change = detect_numeric_change(
        previous_value=previous_value,
        current_value=current_value,
        comparison_type=comparison_type,
        previous_period=previous_period,
        current_period=current_period,
    )

    if magnitude_score is None:
        magnitude_score = calculate_magnitude_score(
            metric_name=metric_or_topic,
            previous_value=previous_value,
            current_value=current_value,
            percentage_change=detected_change.percentage_change,
        )

    if persistence_score is None:
        persistence_score = calculate_persistence_from_history(
            db,
            company_id=company_id,
            metric_or_topic=metric_or_topic,
            comparison_type=comparison_type,
            current_percentage_change=detected_change.percentage_change,
            current_period=current_period,
        )

    if economic_importance_score is None:
        economic_importance_score = (
            calculate_economic_importance_score(
                metric_name=metric_or_topic,
            )
        )

    if novelty_score is None:
        novelty_score = calculate_novelty_from_history(
            db,
            company_id=company_id,
            metric_or_topic=metric_or_topic,
            comparison_type=comparison_type,
            current_percentage_change=detected_change.percentage_change,
            current_period=current_period,
        )

    if evidence_text is None:
        percentage_text = (
            f"{detected_change.percentage_change:.2f}%"
            if detected_change.percentage_change is not None
            else "not available"
        )

        evidence_text = (
            f"{metric_or_topic} changed from "
            f"{previous_value} to {current_value}, "
            f"a change of {percentage_text}, "
            f"from {previous_period or 'previous period'} "
            f"to {current_period or 'current period'}."
        )

    if specificity_score is None:
        specificity_score = calculate_specificity_score(
            text=evidence_text,
        )

    if evidence_strength_score is None:
        evidence_strength_score = (
            calculate_evidence_strength_score(
                source_type=source_type,
                specificity_score=specificity_score,
            )
        )

    materiality = calculate_materiality(
        magnitude=magnitude_score,
        persistence=persistence_score,
        economic_importance=economic_importance_score,
        novelty=novelty_score,
    )

    css = calculate_change_strength(
        economic_importance=economic_importance_score,
        magnitude=magnitude_score,
        evidence_strength=evidence_strength_score,
        persistence=persistence_score,
        novelty=novelty_score,
        specificity=specificity_score,
    )

    record = ChangeRecord(
        company_id=company_id,
        raw_item_id=raw_item_id,
        change_type="numeric",
        category=category,
        metric_or_topic=metric_or_topic,
        previous_value=str(previous_value),
        current_value=str(current_value),
        change_value=str(
            detected_change.percentage_change
        ),
        direction=detected_change.direction,

        magnitude_score=Decimal(
            str(materiality.magnitude)
        ),
        persistence_score=Decimal(
            str(materiality.persistence)
        ),
        economic_importance_score=Decimal(
            str(materiality.economic_importance)
        ),
        novelty_score=Decimal(
            str(materiality.novelty)
        ),

        evidence_strength_score=Decimal(
            str(css.evidence_strength)
        ),
        specificity_score=Decimal(
            str(css.specificity)
        ),
        css_score=Decimal(
            str(css.css_score)
        ),
        css_model_version=css.model_version,

        materiality_score=Decimal(
            str(materiality.materiality_score)
        ),
        materiality_band=materiality.materiality_band,
        materiality_model_version=(
            materiality.model_version
        ),

        confidence=(
            Decimal(str(confidence))
            if confidence is not None
            else None
        ),

        comparison_type=comparison_type,
        previous_period=previous_period,
        current_period=current_period,
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return record