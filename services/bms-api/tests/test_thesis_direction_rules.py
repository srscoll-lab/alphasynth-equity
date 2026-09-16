from stock_intelligence.thesis_direction_rules import (
    infer_thesis_direction,
)


def test_revenue_increase_strengthens():
    result = infer_thesis_direction(
        metric_or_topic="revenue",
        change_direction="increase",
    )

    assert result is not None
    assert result.direction == "strengthens"


def test_revenue_decrease_weakens():
    result = infer_thesis_direction(
        metric_or_topic="revenue",
        change_direction="decrease",
    )

    assert result is not None
    assert result.direction == "weakens"


def test_debt_increase_weakens():
    result = infer_thesis_direction(
        metric_or_topic="total_debt",
        change_direction="increase",
    )

    assert result is not None
    assert result.direction == "weakens"


def test_gnpa_decrease_strengthens():
    result = infer_thesis_direction(
        metric_or_topic="GNPA",
        change_direction="decrease",
    )

    assert result is not None
    assert result.direction == "strengthens"


def test_neutral_change_remains_neutral():
    result = infer_thesis_direction(
        metric_or_topic="revenue",
        change_direction="neutral",
    )

    assert result is not None
    assert result.direction == "neutral"


def test_unknown_metric_returns_none():
    result = infer_thesis_direction(
        metric_or_topic="management_commentary",
        change_direction="increase",
    )

    assert result is None