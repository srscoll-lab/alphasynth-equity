import pytest

from stock_intelligence.qualitative_thesis_interpreter import (
    create_qualitative_thesis_interpretation,
)


def test_valid_interpretation():
    result = create_qualitative_thesis_interpretation(
        direction="weakens",
        confidence=0.88,
        rationale="Commissioning timing became less certain",
    )

    assert result.direction == "weakens"
    assert result.confidence == 0.88
    assert result.rationale == "Commissioning timing became less certain"


def test_direction_is_normalized():
    result = create_qualitative_thesis_interpretation(
        direction="Strengthens",
        confidence=0.90,
        rationale="Guidance became more specific",
    )

    assert result.direction == "strengthens"


def test_invalid_direction_raises():
    with pytest.raises(ValueError):
        create_qualitative_thesis_interpretation(
            direction="positive",
            confidence=0.90,
            rationale="Invalid direction test",
        )


def test_invalid_confidence_raises():
    with pytest.raises(ValueError):
        create_qualitative_thesis_interpretation(
            direction="neutral",
            confidence=1.2,
            rationale="Invalid confidence test",
        )


def test_empty_rationale_raises():
    with pytest.raises(ValueError):
        create_qualitative_thesis_interpretation(
            direction="neutral",
            confidence=0.50,
            rationale="",
        )