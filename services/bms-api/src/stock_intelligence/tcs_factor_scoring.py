from __future__ import annotations

from dataclasses import dataclass

from .thesis_engine import ThesisImpact


@dataclass(frozen=True)
class FactorScoreResult:
    score: float
    strengthens_count: int
    weakens_count: int
    neutral_count: int
    contradiction: bool
    evidence_count: int


def calculate_factor_score(
    impacts: list[ThesisImpact],
) -> FactorScoreResult:
    """
    Convert thesis impacts for one TCS factor into a score
    between -2 and +2.

    V2 preserves both:
    - direction
    - absolute evidence strength

    Each evidence item contributes:

        effective_strength =
            impact_score * confidence

    impact_score is on a 0-10 scale.
    confidence is on a 0-1 scale.

    Therefore effective_strength is on a 0-10 scale.

    The signed evidence contributions are summed and then
    normalized by the maximum possible strength for the
    number of evidence items.

    This means weak positive evidence produces a modest
    positive score, while strong high-confidence evidence
    can approach +2.
    """

    if not impacts:
        return FactorScoreResult(
            score=0.0,
            strengthens_count=0,
            weakens_count=0,
            neutral_count=0,
            contradiction=False,
            evidence_count=0,
        )

    signed_total = 0.0

    strengthens_count = 0
    weakens_count = 0
    neutral_count = 0

    for impact in impacts:
        effective_strength = (
            impact.impact_score
            * impact.confidence
        )

        if impact.direction == "strengthens":
            sign = 1.0
            strengthens_count += 1

        elif impact.direction == "weakens":
            sign = -1.0
            weakens_count += 1

        else:
            sign = 0.0
            neutral_count += 1

        signed_total += (
            sign * effective_strength
        )

    maximum_possible_strength = (
        len(impacts) * 10.0
    )

    if maximum_possible_strength == 0:
        score = 0.0
    else:
        normalized = (
            signed_total
            / maximum_possible_strength
        )

        score = round(
            normalized * 2.0,
            2,
        )

    if score > 2.0:
        score = 2.0

    if score < -2.0:
        score = -2.0

    contradiction = (
        strengthens_count > 0
        and weakens_count > 0
    )

    return FactorScoreResult(
        score=score,
        strengthens_count=strengthens_count,
        weakens_count=weakens_count,
        neutral_count=neutral_count,
        contradiction=contradiction,
        evidence_count=len(impacts),
    )