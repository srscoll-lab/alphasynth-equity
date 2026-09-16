from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from .change_service import create_numeric_change_record
from .financial_adjustment_service import calculate_adjusted_value
from .financial_metrics import normalize_metric_name
from .models import FinancialObservation
from .period_comparison import expected_previous_period


def create_financial_observation(
    db: Session,
    *,
    company_id: int,
    metric_name: str,
    metric_value: float,
    period_label: str,
    period_type: str,
    unit: str | None = None,
    period_end_date: date | None = None,
    source_type: str | None = None,
    raw_item_id: int | None = None,
    confidence: float | None = None,
) -> FinancialObservation:
    """
    Store one financial metric observation for one company and period.
    """

    canonical_metric_name = normalize_metric_name(
        metric_name
    )

    observation = FinancialObservation(
        company_id=company_id,
        raw_item_id=raw_item_id,
        metric_name=canonical_metric_name,
        metric_value=Decimal(str(metric_value)),
        unit=unit,
        period_label=period_label,
        period_type=period_type,
        period_end_date=period_end_date,
        source_type=source_type,
        confidence=(
            Decimal(str(confidence))
            if confidence is not None
            else None
        ),
    )

    db.add(observation)
    db.commit()
    db.refresh(observation)

    return observation


def find_comparable_observation(
    db: Session,
    *,
    company_id: int,
    metric_name: str,
    current_period_label: str,
    period_type: str,
    comparison_type: str,
) -> FinancialObservation | None:
    """
    Find the correct earlier observation for YoY or QoQ.
    """

    canonical_metric_name = normalize_metric_name(
        metric_name
    )

    previous_period_label = expected_previous_period(
        period_label=current_period_label,
        period_type=period_type,
        comparison_type=comparison_type,
    )

    return (
        db.query(FinancialObservation)
        .filter(
            FinancialObservation.company_id == company_id,
            FinancialObservation.metric_name
            == canonical_metric_name,
            FinancialObservation.period_type
            == period_type,
            FinancialObservation.period_label
            == previous_period_label,
        )
        .order_by(FinancialObservation.id.desc())
        .first()
    )


def create_observation_with_change(
    db: Session,
    *,
    company_id: int,
    metric_name: str,
    metric_value: float,
    period_label: str,
    period_type: str,
    period_end_date: date,
    category: str,
    comparison_type: str,
    unit: str | None = None,
    source_type: str | None = None,
    raw_item_id: int | None = None,
    confidence: float | None = None,
    magnitude_score: float | None = None,
    persistence_score: float | None = None,
    economic_importance_score: float | None = None,
    novelty_score: float | None = None,
    evidence_strength_score: float | None = None,
    specificity_score: float | None = None,
) -> tuple[FinancialObservation, object | None]:
    """
    Store a financial observation and create a comparable
    ChangeRecord when historical data exists.

    By default the quantitative intelligence layer now
    calculates automatically:

    - magnitude
    - persistence
    - economic importance
    - novelty
    - specificity
    - evidence strength
    - materiality
    - CSS

    Manual overrides remain temporarily supported.

    EBITDA and PAT use adjusted values where FinancialAdjustment
    rows exist; otherwise reported values are used.
    """

    canonical_metric_name = normalize_metric_name(
        metric_name
    )

    previous = find_comparable_observation(
        db,
        company_id=company_id,
        metric_name=canonical_metric_name,
        current_period_label=period_label,
        period_type=period_type,
        comparison_type=comparison_type,
    )

    current = create_financial_observation(
        db,
        company_id=company_id,
        metric_name=canonical_metric_name,
        metric_value=metric_value,
        period_label=period_label,
        period_type=period_type,
        unit=unit,
        period_end_date=period_end_date,
        source_type=source_type,
        raw_item_id=raw_item_id,
        confidence=confidence,
    )

    if previous is None:
        return current, None

    previous_value_for_change = float(
        previous.metric_value
    )

    current_value_for_change = float(
        current.metric_value
    )

    if canonical_metric_name in {
        "ebitda",
        "pat",
    }:
        previous_value_for_change = float(
            calculate_adjusted_value(
                db,
                financial_observation_id=previous.id,
            )
        )

        current_value_for_change = float(
            calculate_adjusted_value(
                db,
                financial_observation_id=current.id,
            )
        )

    evidence_text = (
        f"{canonical_metric_name} changed from "
        f"{previous_value_for_change} to "
        f"{current_value_for_change} "
        f"from {previous.period_label} "
        f"to {current.period_label}."
    )

    change_record = create_numeric_change_record(
        db,
        company_id=company_id,
        metric_or_topic=canonical_metric_name,
        category=category,
        previous_value=previous_value_for_change,
        current_value=current_value_for_change,

        magnitude_score=magnitude_score,
        persistence_score=persistence_score,
        economic_importance_score=(
            economic_importance_score
        ),
        novelty_score=novelty_score,
        evidence_strength_score=(
            evidence_strength_score
        ),
        specificity_score=specificity_score,

        source_type=source_type,
        evidence_text=evidence_text,

        comparison_type=comparison_type,
        previous_period=previous.period_label,
        current_period=current.period_label,
        raw_item_id=raw_item_id,
        confidence=confidence,
    )

    return current, change_record