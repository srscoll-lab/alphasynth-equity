import pytest

from stock_intelligence.confidence_scoring import (
    calculate_observation_confidence,
)


def test_quarterly_result_confidence():
    result = calculate_observation_confidence(
        source_type="quarterly_result",
    )

    assert result.confidence == 0.97


def test_verified_quarterly_result_confidence():
    result = calculate_observation_confidence(
        source_type="quarterly_result",
        independently_verified=True,
    )

    assert result.confidence == 0.99


def test_management_interpretation_confidence():
    result = calculate_observation_confidence(
        source_type="management_commentary",
        direct_fact=False,
        interpretation_required=True,
    )

    assert result.confidence == 0.72


def test_unknown_source_confidence():
    result = calculate_observation_confidence(
        source_type="unknown",
    )

    assert result.confidence == 0.60


def test_confidence_is_capped_at_one():
    result = calculate_observation_confidence(
        source_type="exchange_filing",
        independently_verified=True,
    )

    assert result.confidence == 1.0


def test_reason_is_recorded():
    result = calculate_observation_confidence(
        source_type="quarterly_result",
    )

    assert "quarterly_result" in result.reason