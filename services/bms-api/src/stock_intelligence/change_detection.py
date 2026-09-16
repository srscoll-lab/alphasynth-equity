from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NumericChange:
    previous_value: float
    current_value: float
    absolute_change: float
    percentage_change: float | None
    direction: str
    comparison_type: str | None = None
    previous_period: str | None = None
    current_period: str | None = None


def detect_numeric_change(
    previous_value: float,
    current_value: float,
    neutral_threshold_pct: float = 1.0,
    comparison_type: str | None = None,
    previous_period: str | None = None,
    current_period: str | None = None,
) -> NumericChange:
    absolute_change = current_value - previous_value

    if previous_value == 0:
        percentage_change = None
    else:
        percentage_change = (absolute_change / abs(previous_value)) * 100

    if percentage_change is None:
        if absolute_change > 0:
            direction = "increase"
        elif absolute_change < 0:
            direction = "decrease"
        else:
            direction = "neutral"
    elif abs(percentage_change) < neutral_threshold_pct:
        direction = "neutral"
    elif percentage_change > 0:
        direction = "increase"
    else:
        direction = "decrease"

    return NumericChange(
        previous_value=previous_value,
        current_value=current_value,
        absolute_change=absolute_change,
        percentage_change=percentage_change,
        direction=direction,
        comparison_type=comparison_type,
        previous_period=previous_period,
        current_period=current_period,
    )