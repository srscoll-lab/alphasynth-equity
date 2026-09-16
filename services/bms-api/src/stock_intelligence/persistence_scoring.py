from __future__ import annotations


def calculate_persistence_score(
    *,
    recent_percentage_changes: list[float],
) -> float:
    """
    Calculate Persistence Score V1 on a 0-100 scale.

    The list should be ordered oldest -> newest.

    Persistence measures whether the latest direction has
    continued across recent periods.

    Examples:

        [+12, +15, +18] -> high persistence

        [-8, -12, -10] -> high persistence

        [+20, -5, +18] -> low persistence

        [+18] -> limited evidence, moderate-low persistence

    This function measures persistence only.
    It does NOT decide whether positive or negative is good.
    """

    if not recent_percentage_changes:
        return 0.0

    changes = [
        float(value)
        for value in recent_percentage_changes
    ]

    latest = changes[-1]

    if latest > 0:
        latest_direction = 1
    elif latest < 0:
        latest_direction = -1
    else:
        latest_direction = 0

    if latest_direction == 0:
        return 20.0

    directions: list[int] = []

    for change in changes:
        if change > 0:
            directions.append(1)
        elif change < 0:
            directions.append(-1)
        else:
            directions.append(0)

    same_direction_count = sum(
        direction == latest_direction
        for direction in directions
    )

    total_periods = len(directions)

    consistency_ratio = (
        same_direction_count / total_periods
    )

    if total_periods == 1:
        return 35.0

    if total_periods == 2:
        if consistency_ratio == 1.0:
            return 65.0
        return 30.0

    if consistency_ratio == 1.0:
        return 95.0

    if consistency_ratio >= 0.75:
        return 80.0

    if consistency_ratio >= 0.60:
        return 65.0

    if consistency_ratio >= 0.50:
        return 50.0

    return 25.0