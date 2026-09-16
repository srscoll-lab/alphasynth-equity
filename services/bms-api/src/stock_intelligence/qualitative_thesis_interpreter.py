from __future__ import annotations

from dataclasses import dataclass


VALID_THESIS_DIRECTIONS = {
    "strengthens",
    "weakens",
    "neutral",
}


@dataclass(frozen=True)
class QualitativeThesisInterpretation:
    direction: str
    confidence: float
    rationale: str


def create_qualitative_thesis_interpretation(
    *,
    direction: str,
    confidence: float,
    rationale: str,
) -> QualitativeThesisInterpretation:
    """
    Create a validated thesis interpretation for
    an ambiguous qualitative change.

    This module does not call an LLM.

    It defines the strict structure that either:
        - deterministic logic, or
        - Gemini

    must return.
    """

    normalized_direction = direction.strip().lower()

    if normalized_direction not in VALID_THESIS_DIRECTIONS:
        raise ValueError(
            "direction must be one of: "
            "strengthens, weakens, neutral"
        )

    if confidence < 0 or confidence > 1:
        raise ValueError(
            "confidence must be between 0 and 1"
        )

    if not rationale.strip():
        raise ValueError(
            "rationale cannot be empty"
        )

    return QualitativeThesisInterpretation(
        direction=normalized_direction,
        confidence=confidence,
        rationale=rationale.strip(),
    )