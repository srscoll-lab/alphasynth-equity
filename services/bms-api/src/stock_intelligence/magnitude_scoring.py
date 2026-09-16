from __future__ import annotations


def _validate_percentage_change(
    percentage_change: float | None,
) -> float:
    if percentage_change is None:
        return 0.0

    return abs(float(percentage_change))


def _score_standard_percentage_change(
    percentage_change: float | None,
) -> float:
    change = _validate_percentage_change(
        percentage_change
    )

    if change < 3:
        return 10.0

    if change < 5:
        return 25.0

    if change < 10:
        return 40.0

    if change < 20:
        return 60.0

    if change < 35:
        return 80.0

    return 95.0


def _score_margin_change(
    previous_value: float,
    current_value: float,
) -> float:
    point_change = abs(
        float(current_value)
        - float(previous_value)
    )

    if point_change < 0.5:
        return 10.0

    if point_change < 1.0:
        return 25.0

    if point_change < 2.0:
        return 45.0

    if point_change < 3.0:
        return 65.0

    if point_change < 5.0:
        return 85.0

    return 95.0


def calculate_magnitude_score(
    *,
    metric_name: str,
    previous_value: float,
    current_value: float,
    percentage_change: float | None,
) -> float:
    metric = metric_name.strip().lower()

    if metric in {
        "ebitda_margin",
        "operating_margin",
        "financing_margin",
        "attrition",
        "cash_conversion",
        "nim",
    }:
        return _score_margin_change(
            previous_value=previous_value,
            current_value=current_value,
        )

    supported_metrics = {
        "revenue",
        "ebitda",
        "operating_income",
        "pat",
        "total_debt",
        "inventory",
        "receivables",
        "operating_cash_flow",
        "deal_tcv",
        "gnpa",
        "volume_growth",
        "innovative_medicine_sales",
        "net_cash",
        "order_book",
    }

    if metric not in supported_metrics:
        raise ValueError(
            f"Unsupported metric for magnitude scoring: "
            f"{metric_name}"
        )

    return _score_standard_percentage_change(
        percentage_change
    )