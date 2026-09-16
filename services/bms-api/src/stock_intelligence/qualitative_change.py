from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class QualitativeChange:
    topic: str
    previous_statement: str | None
    current_statement: str
    change_type: str
    direction: str | None
    summary: str
    confidence: float
    previous_period: str | None = None
    current_period: str | None = None


def create_qualitative_change(
    *,
    topic: str,
    current_statement: str,
    change_type: str,
    summary: str,
    confidence: float,
    previous_statement: str | None = None,
    direction: str | None = None,
    previous_period: str | None = None,
    current_period: str | None = None,
) -> QualitativeChange:
    """
    Create a structured qualitative change.

    The function does not decide investment impact.
    It only records what changed in management commentary
    or another qualitative source.
    """

    if not topic.strip():
        raise ValueError("topic cannot be empty")

    if not current_statement.strip():
        raise ValueError("current_statement cannot be empty")

    if not summary.strip():
        raise ValueError("summary cannot be empty")

    if confidence < 0 or confidence > 1:
        raise ValueError(
            "confidence must be between 0 and 1"
        )

    return QualitativeChange(
        topic=topic.strip(),
        previous_statement=(
            previous_statement.strip()
            if previous_statement
            else None
        ),
        current_statement=current_statement.strip(),
        change_type=change_type.strip(),
        direction=(
            direction.strip()
            if direction
            else None
        ),
        summary=summary.strip(),
        confidence=confidence,
        previous_period=previous_period,
        current_period=current_period,
    )