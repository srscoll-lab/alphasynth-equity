from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ChangeRecord
from .persistence_scoring import calculate_persistence_score


def calculate_persistence_from_history(
    db: Session,
    *,
    company_id: int,
    metric_or_topic: str,
    comparison_type: str | None,
    current_percentage_change: float | None,
    current_period: str | None = None,
    max_periods: int = 3,
) -> float:
    """
    Calculate persistence using the current financial change
    plus recent historical ChangeRecords for the same company,
    metric and comparison type.

    V1 normally uses up to three observations:
        current change
        + two previous comparable changes.

    Quarterly and annual histories are kept separate.
    """

    if current_percentage_change is None:
        return 0.0

    query = (
        select(ChangeRecord)
        .where(
            ChangeRecord.company_id == company_id,
            ChangeRecord.change_type == "numeric",
            ChangeRecord.metric_or_topic == metric_or_topic,
        )
        .order_by(ChangeRecord.id.desc())
    )

    if comparison_type is not None:
        query = query.where(
            ChangeRecord.comparison_type == comparison_type
        )

    previous_records = db.scalars(query).all()

    previous_changes: list[float] = []

    current_is_quarterly = (
        current_period is not None
        and current_period.strip().upper().startswith("Q")
    )

    current_is_annual = (
        current_period is not None
        and current_period.strip().upper().startswith("FY")
    )

    for record in previous_records:
        if len(previous_changes) >= max_periods - 1:
            break

        record_period = (
            record.current_period.strip().upper()
            if record.current_period
            else ""
        )

        if current_is_quarterly and not record_period.startswith("Q"):
            continue

        if current_is_annual and not record_period.startswith("FY"):
            continue

        if record.change_value is None:
            continue

        try:
            value = float(record.change_value)
        except (TypeError, ValueError):
            continue

        previous_changes.append(value)

    previous_changes.reverse()

    changes = previous_changes + [
        float(current_percentage_change)
    ]

    return calculate_persistence_score(
        recent_percentage_changes=changes
    )