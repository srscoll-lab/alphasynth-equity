from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ThesisDirectionResult:
    direction: str
    rationale: str
    confidence: float


POSITIVE_WHEN_INCREASES = {
    "revenue",
    "sales",
    "pat",
    "profit",
    "eps",
    "ebitda",
    "ebitda_margin",
    "operating_income",
    "operating_profit",
    "operating_margin",
    "financing_margin",
    "gross_margin",
    "roce",
    "roe",
    "roa",
    "operating_cash_flow",
    "capacity_utilization",
    "order_book",
    "volume_growth",
    "market_share",
    "deal_tcv",
    "deal_wins",
    "large_deal_wins",
    "client_additions",
    "client_growth",
    "utilization",
    "cash_conversion",
    "innovative_medicine_sales",
    "net_cash",
    "nim",
    "order_book",
}


NEGATIVE_WHEN_INCREASES = {
    "total_debt",
    "debt",
    "working_capital_days",
    "inventory_days",
    "receivable_days",
    "gnpa",
    "nnpa",
    "credit_cost",
    "stage_3_assets",
    "attrition",
}


POSITIVE_WHEN_DECREASES = (
    NEGATIVE_WHEN_INCREASES
)


def infer_thesis_direction(
    *,
    metric_or_topic: str,
    change_direction: str | None,
) -> ThesisDirectionResult | None:
    metric = (
        metric_or_topic
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )

    direction = (
        change_direction.strip().lower()
        if change_direction
        else None
    )

    if direction not in {
        "increase",
        "decrease",
        "neutral",
    }:
        return None

    if direction == "neutral":
        return ThesisDirectionResult(
            direction="neutral",
            rationale=(
                f"{metric} showed no material "
                "directional change"
            ),
            confidence=0.90,
        )

    if metric in POSITIVE_WHEN_INCREASES:
        if direction == "increase":
            return ThesisDirectionResult(
                direction="strengthens",
                rationale=(
                    f"Increase in {metric} "
                    "supports the thesis"
                ),
                confidence=0.90,
            )

        return ThesisDirectionResult(
            direction="weakens",
            rationale=(
                f"Decrease in {metric} "
                "weakens the thesis"
            ),
            confidence=0.90,
        )

    if metric in NEGATIVE_WHEN_INCREASES:
        if direction == "increase":
            return ThesisDirectionResult(
                direction="weakens",
                rationale=(
                    f"Increase in {metric} "
                    "increases business risk"
                ),
                confidence=0.90,
            )

        return ThesisDirectionResult(
            direction="strengthens",
            rationale=(
                f"Decrease in {metric} "
                "improves business quality"
            ),
            confidence=0.90,
        )

    return None