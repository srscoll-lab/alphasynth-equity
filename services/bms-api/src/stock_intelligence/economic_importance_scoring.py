from __future__ import annotations


DEFAULT_ECONOMIC_IMPORTANCE = {
    "revenue": 85.0,
    "ebitda": 95.0,
    "ebitda_margin": 95.0,
    "operating_income": 95.0,
    "operating_margin": 95.0,
    "financing_margin": 95.0,
    "pat": 90.0,
    "operating_cash_flow": 95.0,
    "total_debt": 85.0,
    "receivables": 70.0,
    "inventory": 65.0,
    "deal_tcv": 80.0,
    "attrition": 70.0,
    "cash_conversion": 85.0,
    "gnpa": 90.0,
    "nim": 95.0,
    "volume_growth": 80.0,
    "innovative_medicine_sales": 80.0,
    "net_cash": 75.0,
    "order_book": 85.0,
}


def calculate_economic_importance_score(
    *,
    metric_name: str,
) -> float:
    metric = metric_name.strip().lower()

    if metric not in DEFAULT_ECONOMIC_IMPORTANCE:
        raise ValueError(
            "Unsupported metric for economic "
            "importance scoring: "
            f"{metric_name}"
        )

    return DEFAULT_ECONOMIC_IMPORTANCE[
        metric
    ]