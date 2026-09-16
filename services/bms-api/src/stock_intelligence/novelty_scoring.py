from __future__ import annotations

from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ChangeRecord


def _score_novelty_ratio(
    *,
    current_change: float,
    historical_changes: list[float],
) -> float:
    """
    Convert how unusual the current change is versus recent
    history into a 0-100 novelty score.

    The comparison uses absolute percentage changes because
    novelty measures unusualness, not direction.
    """

    if not historical_changes:
        return 50.0

    baseline = median(
        abs(float(value))
        for value in historical_changes
    )

    current = abs(float(current_change))

    if baseline == 0:
        if current == 0:
            return 20.0
        return 95.0

    ratio = current / baseline

    if ratio < 0.75:
        return 20.0

    if ratio < 1.00:
        return 35.0

    if ratio < 1.25:
        return 50.0

    if ratio < 1.75:
        return 70.0

    if ratio < 2.50:
        return 85.0

    return 95.0


def calculate_novelty_from_history(
    db: Session,
    *,
    company_id: int,
    metric_or_topic: str,
    comparison_type: str | None,
    current_percentage_change: float | None,
    current_period: str | None = None,
    max_history: int = 6,
) -> float:
    """
    Calculate Novelty Score V1 from historical ChangeRecords.

    Uses up to six previous comparable changes for the same
    company and metric.

    YoY and QoQ histories remain separate.
    Quarterly and annual histories remain separate.
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

    records = db.scalars(query).all()

    historical_changes: list[float] = []

    current_is_quarterly = (
        current_period is not None
        and current_period.strip().upper().startswith("Q")
    )

    current_is_annual = (
        current_period is not None
        and current_period.strip().upper().startswith("FY")
    )

    for record in records:
        if len(historical_changes) >= max_history:
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

        historical_changes.append(value)

    return _score_novelty_ratio(
        current_change=float(current_percentage_change),
        historical_changes=historical_changes,
    )