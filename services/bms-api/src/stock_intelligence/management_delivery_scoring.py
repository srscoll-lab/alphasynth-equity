from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ManagementDeliveryResult:
    delivery_status: str
    direction: str
    delivery_score: float
    variance_pct: float
    rationale: str
    model_version: str


def assess_numeric_management_delivery(
    *,
    target_value: float,
    actual_value: float,
    tolerance_pct: float = 5.0,
    model_version: str = "management-delivery-v1.0",
) -> ManagementDeliveryResult:
    """
    Assess whether management delivered against numeric guidance.

    V1 rules:

        actual >= target
            -> delivered
            -> strengthens

        actual is within tolerance_pct below target
            -> partially_delivered
            -> neutral

        actual is more than tolerance_pct below target
            -> missed
            -> weakens

    delivery_score is expressed on a 0-100 scale.
    """

    target = float(target_value)
    actual = float(actual_value)

    if target == 0:
        raise ValueError(
            "target_value must not be zero"
        )

    if tolerance_pct < 0:
        raise ValueError(
            "tolerance_pct must be non-negative"
        )

    variance_pct = (
        (actual - target)
        / abs(target)
        * 100.0
    )

    variance_pct = round(
        variance_pct,
        2,
    )

    if actual >= target:
        delivery_status = "delivered"
        direction = "strengthens"

        if variance_pct >= 10:
            delivery_score = 95.0
        elif variance_pct >= 5:
            delivery_score = 90.0
        else:
            delivery_score = 85.0

        rationale = (
            f"Actual outcome {actual} met or exceeded "
            f"management target {target}."
        )

    elif variance_pct >= -tolerance_pct:
        delivery_status = "partially_delivered"
        direction = "neutral"
        delivery_score = 60.0

        rationale = (
            f"Actual outcome {actual} was within "
            f"{tolerance_pct}% of management target "
            f"{target}."
        )

    else:
        delivery_status = "missed"
        direction = "weakens"

        if variance_pct <= -20:
            delivery_score = 95.0
        elif variance_pct <= -10:
            delivery_score = 85.0
        else:
            delivery_score = 75.0

        rationale = (
            f"Actual outcome {actual} materially missed "
            f"management target {target}."
        )

    return ManagementDeliveryResult(
        delivery_status=delivery_status,
        direction=direction,
        delivery_score=delivery_score,
        variance_pct=variance_pct,
        rationale=rationale,
        model_version=model_version,
    )
def assess_numeric_target_rule(
    *,
    actual_value: float,
    target_rule: str,
    target_value: float | None = None,
    target_min: float | None = None,
    target_max: float | None = None,
    tolerance_pct: float = 5.0,
    model_version: str = "management-delivery-v1.1",
) -> ManagementDeliveryResult:
    """
    Assess numeric management guidance using a generic target rule.

    Supported rules:

        minimum:
            actual should be >= target_value

        maximum:
            actual should be <= target_value

        range:
            actual should be between target_min
            and target_max

    This logic is company-independent.
    """

    actual = float(actual_value)
    rule = target_rule.strip().lower()

    if tolerance_pct < 0:
        raise ValueError(
            "tolerance_pct must be non-negative"
        )

    if rule == "minimum":
        if target_value is None:
            raise ValueError(
                "target_value is required "
                "for minimum rule"
            )

        target = float(target_value)

        return assess_numeric_management_delivery(
            target_value=target,
            actual_value=actual,
            tolerance_pct=tolerance_pct,
            model_version=model_version,
        )

    if rule == "maximum":
        if target_value is None:
            raise ValueError(
                "target_value is required "
                "for maximum rule"
            )

        target = float(target_value)

        if target == 0:
            raise ValueError(
                "target_value must not be zero"
            )

        variance_pct = (
            (actual - target)
            / abs(target)
            * 100.0
        )
        variance_pct = round(variance_pct, 2)

        if actual <= target:
            delivery_status = "delivered"
            direction = "strengthens"

            improvement_pct = -variance_pct

            if improvement_pct >= 10:
                delivery_score = 95.0
            elif improvement_pct >= 5:
                delivery_score = 90.0
            else:
                delivery_score = 85.0

            rationale = (
                f"Actual outcome {actual} met or "
                f"was below management maximum "
                f"{target}."
            )

        elif variance_pct <= tolerance_pct:
            delivery_status = "partially_delivered"
            direction = "neutral"
            delivery_score = 60.0

            rationale = (
                f"Actual outcome {actual} was within "
                f"{tolerance_pct}% of management "
                f"maximum {target}."
            )

        else:
            delivery_status = "missed"
            direction = "weakens"

            if variance_pct >= 20:
                delivery_score = 95.0
            elif variance_pct >= 10:
                delivery_score = 85.0
            else:
                delivery_score = 75.0

            rationale = (
                f"Actual outcome {actual} materially "
                f"exceeded management maximum "
                f"{target}."
            )

        return ManagementDeliveryResult(
            delivery_status=delivery_status,
            direction=direction,
            delivery_score=delivery_score,
            variance_pct=variance_pct,
            rationale=rationale,
            model_version=model_version,
        )

    if rule == "range":
        if target_min is None or target_max is None:
            raise ValueError(
                "target_min and target_max are "
                "required for range rule"
            )

        lower = float(target_min)
        upper = float(target_max)

        if lower > upper:
            raise ValueError(
                "target_min must not exceed target_max"
            )

        if lower <= actual <= upper:
            return ManagementDeliveryResult(
                delivery_status="delivered",
                direction="strengthens",
                delivery_score=85.0,
                variance_pct=0.0,
                rationale=(
                    f"Actual outcome {actual} was within "
                    f"management guidance range "
                    f"{lower} to {upper}."
                ),
                model_version=model_version,
            )

        nearest_boundary = (
            lower
            if actual < lower
            else upper
        )

        if nearest_boundary == 0:
            raise ValueError(
                "range boundary must not be zero"
            )

        variance_pct = (
            (actual - nearest_boundary)
            / abs(nearest_boundary)
            * 100.0
        )
        variance_pct = round(variance_pct, 2)

        distance_pct = abs(variance_pct)

        if distance_pct <= tolerance_pct:
            delivery_status = "partially_delivered"
            direction = "neutral"
            delivery_score = 60.0

            rationale = (
                f"Actual outcome {actual} was just "
                f"outside management guidance range "
                f"{lower} to {upper}."
            )

        else:
            delivery_status = "missed"
            direction = "weakens"

            if distance_pct >= 20:
                delivery_score = 95.0
            elif distance_pct >= 10:
                delivery_score = 85.0
            else:
                delivery_score = 75.0

            rationale = (
                f"Actual outcome {actual} materially "
                f"missed management guidance range "
                f"{lower} to {upper}."
            )

        return ManagementDeliveryResult(
            delivery_status=delivery_status,
            direction=direction,
            delivery_score=delivery_score,
            variance_pct=variance_pct,
            rationale=rationale,
            model_version=model_version,
        )

    raise ValueError(
        "target_rule must be one of: "
        "minimum, maximum, range"
    )