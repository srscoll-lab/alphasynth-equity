from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .materiality import calculate_materiality
from .models import ChangeRecord
from .qualitative_change import QualitativeChange


def create_qualitative_change_record(
    db: Session,
    *,
    company_id: int,
    qualitative_change: QualitativeChange,
    category: str,
    magnitude_score: float,
    persistence_score: float,
    economic_importance_score: float,
    novelty_score: float,
    raw_item_id: int | None = None,
) -> ChangeRecord:
    """
    Convert a structured qualitative change into a ChangeRecord
    and save it in the common Change Repository.
    """

    materiality = calculate_materiality(
        magnitude=magnitude_score,
        persistence=persistence_score,
        economic_importance=economic_importance_score,
        novelty=novelty_score,
    )

    record = ChangeRecord(
        company_id=company_id,
        raw_item_id=raw_item_id,
        change_type="qualitative",
        category=category,
        metric_or_topic=qualitative_change.topic,
        previous_value=qualitative_change.previous_statement,
        current_value=qualitative_change.current_statement,
        change_value=qualitative_change.summary,
        direction=qualitative_change.direction,
        magnitude_score=Decimal(str(materiality.magnitude)),
        persistence_score=Decimal(str(materiality.persistence)),
        economic_importance_score=Decimal(
            str(materiality.economic_importance)
        ),
        novelty_score=Decimal(str(materiality.novelty)),
        materiality_score=Decimal(
            str(materiality.materiality_score)
        ),
        materiality_band=materiality.materiality_band,
        materiality_model_version=materiality.model_version,
        confidence=Decimal(
            str(qualitative_change.confidence)
        ),
        comparison_type="qualitative_comparison",
        previous_period=qualitative_change.previous_period,
        current_period=qualitative_change.current_period,
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return record