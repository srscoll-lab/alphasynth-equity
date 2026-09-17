from __future__ import annotations

from dataclasses import dataclass


# TCS V1.0
#
# Four-factor BMS V1.1 model.
#
# Scores for every factor:
#   -2 = strongly deteriorating
#   -1 = moderately deteriorating
#    0 = neutral / mixed
#   +1 = moderately improving
#   +2 = strongly improving
#
# The high-level factors remain the same across sectors.
# The underlying evidence used to score them may differ by sector.


FACTOR_WEIGHTS = {
    "earnings": 0.2778,
    "economics": 0.2778,
    "execution": 0.2778,
    "balance_sheet": 0.1666,
}


@dataclass(frozen=True)
class FactorResult:
    name: str
    weight: float
    current_score: float
    previous_score: float | None
    delta: float | None


@dataclass(frozen=True)
class TCSResult:
    current_tcs: float
    previous_tcs: float | None
    delta_tcs: float | None
    factors: tuple[FactorResult, ...]
    model_version: str


def _validate_score(name: str, score: float | None) -> None:
    """
    Validate one factor score.

    TCS V1 uses a simple -2 to +2 scale.
    """

    if score is None:
        return

    if score < -2 or score > 2:
        raise ValueError(
            f"{name} score must be between -2 and +2"
        )


def _weighted_score(scores: dict[str, float]) -> float:
    """
    Calculate the weighted TCS.

    Because the weights total 1.0 and every factor is scored
    between -2 and +2, the resulting TCS also remains between
    -2 and +2.
    """

    total = 0.0

    for factor_name, score in scores.items():
        total += score * FACTOR_WEIGHTS[factor_name]

    return round(total, 4)


def calculate_tcs(
    *,
    earnings: float,
    economics: float,
    execution: float,
    balance_sheet: float,
    management_delivery: float,
    previous_earnings: float | None = None,
    previous_economics: float | None = None,
    previous_execution: float | None = None,
    previous_balance_sheet: float | None = None,
    previous_management_delivery: float | None = None,
) -> TCSResult:
    """
    Calculate Thesis Confirmation Score (TCS) V1.0.

    Current core-factor weights:

        Earnings                    27.78%
        Economics / margins         27.78%
        Execution / conversion      27.78%
        Balance sheet / risk        16.66%

    Management delivery is retained as an input for backwards-compatible
    callers but is not part of the BMS V1.1 score.

    Each factor uses a -2 to +2 scale.

    The function also preserves the change in every individual
    factor.

    If all five previous scores are supplied, it calculates:

        previous TCS
        delta TCS = current TCS - previous TCS

    If previous scores are unavailable, previous_tcs and
    delta_tcs remain None.
    """

    current_scores = {
        "earnings": earnings,
        "economics": economics,
        "execution": execution,
        "balance_sheet": balance_sheet,
    }

    previous_scores = {
        "earnings": previous_earnings,
        "economics": previous_economics,
        "execution": previous_execution,
        "balance_sheet": previous_balance_sheet,
    }

    for name, score in current_scores.items():
        _validate_score(name, score)

    for name, score in previous_scores.items():
        _validate_score(name, score)

    current_tcs = _weighted_score(current_scores)

    all_previous_available = all(
        score is not None
        for score in previous_scores.values()
    )

    previous_tcs: float | None = None
    delta_tcs: float | None = None

    if all_previous_available:
        previous_numeric_scores = {
            name: float(score)
            for name, score in previous_scores.items()
            if score is not None
        }

        previous_tcs = _weighted_score(previous_numeric_scores)
        delta_tcs = round(current_tcs - previous_tcs, 4)

    factor_results: list[FactorResult] = []

    for name in FACTOR_WEIGHTS:
        current_score = current_scores[name]
        previous_score = previous_scores[name]

        delta = None

        if previous_score is not None:
            delta = round(
                current_score - previous_score,
                4,
            )

        factor_results.append(
            FactorResult(
                name=name,
                weight=FACTOR_WEIGHTS[name],
                current_score=current_score,
                previous_score=previous_score,
                delta=delta,
            )
        )

    return TCSResult(
        current_tcs=current_tcs,
        previous_tcs=previous_tcs,
        delta_tcs=delta_tcs,
        factors=tuple(factor_results),
        model_version="bms-v1.1-four-factor",
    )
