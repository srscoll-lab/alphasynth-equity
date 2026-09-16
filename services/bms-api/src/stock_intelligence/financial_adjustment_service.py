from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import FinancialAdjustment, FinancialObservation


def calculate_adjusted_value(
    db: Session,
    *,
    financial_observation_id: int,
) -> Decimal:
    """
    Return the reported financial value after applying
    all stored adjustments.

    adjusted_value =
        reported_value + sum(adjustment_amount)
    """

    observation = db.get(
        FinancialObservation,
        financial_observation_id,
    )

    if observation is None:
        raise ValueError(
            f"FinancialObservation "
            f"{financial_observation_id} not found"
        )

    adjustment_total = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    FinancialAdjustment.adjustment_amount
                ),
                0,
            )
        ).where(
            FinancialAdjustment.financial_observation_id
            == financial_observation_id
        )
    )

    return (
        Decimal(str(observation.metric_value))
        + Decimal(str(adjustment_total))
    )