from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ThesisImpact:
    direction: str
    impact_score: float
    rationale: str
    confidence: float


VALID_DIRECTIONS = {
    "strengthens",
    "weakens",
    "neutral",
}


def evaluate_thesis_impact(
    *,
    direction: str,
    impact_score: float,
    rationale: str,
    confidence: float,
) -> ThesisImpact:
    """
    Represent how one evidence item affects a thesis.

    impact_score uses a simple 0-10 magnitude scale.

    Examples:
        strengthens, 8
        weakens, 6
        neutral, 1

    This function does not yet calculate the full TCS.
    It structures one evidence-to-thesis judgment.
    """

    normalized_direction = direction.strip().lower()

    if normalized_direction not in VALID_DIRECTIONS:
        raise ValueError(
            "direction must be one of: "
            "strengthens, weakens, neutral"
        )

    if impact_score < 0 or impact_score > 10:
        raise ValueError(
            "impact_score must be between 0 and 10"
        )

    if confidence < 0 or confidence > 1:
        raise ValueError(
            "confidence must be between 0 and 1"
        )

    if not rationale.strip():
        raise ValueError(
            "rationale cannot be empty"
        )

    return ThesisImpact(
        direction=normalized_direction,
        impact_score=impact_score,
        rationale=rationale.strip(),
        confidence=confidence,
    )