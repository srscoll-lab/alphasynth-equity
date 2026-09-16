import pytest

from stock_intelligence.management_delivery_scoring import (
    assess_numeric_management_delivery,
)


def test_exceeded_guidance():
    result = assess_numeric_management_delivery(
        target_value=100,
        actual_value=110,
    )

    assert result.delivery_status == "delivered"
    assert result.direction == "strengthens"
    assert result.delivery_score == 95.0
    assert result.variance_pct == 10.0


def test_exactly_met_guidance():
    result = assess_numeric_management_delivery(
        target_value=100,
        actual_value=100,
    )

    assert result.delivery_status == "delivered"
    assert result.direction == "strengthens"
    assert result.delivery_score == 85.0
    assert result.variance_pct == 0.0


def test_partially_delivered_guidance():
    result = assess_numeric_management_delivery(
        target_value=100,
        actual_value=97,
    )

    assert (
        result.delivery_status
        == "partially_delivered"
    )
    assert result.direction == "neutral"
    assert result.delivery_score == 60.0
    assert result.variance_pct == -3.0


def test_missed_guidance():
    result = assess_numeric_management_delivery(
        target_value=100,
        actual_value=85,
    )

    assert result.delivery_status == "missed"
    assert result.direction == "weakens"
    assert result.delivery_score == 85.0
    assert result.variance_pct == -15.0


def test_zero_target_rejected():
    with pytest.raises(ValueError):
        assess_numeric_management_delivery(
            target_value=0,
            actual_value=10,
        )


def test_negative_tolerance_rejected():
    with pytest.raises(ValueError):
        assess_numeric_management_delivery(
            target_value=100,
            actual_value=95,
            tolerance_pct=-1,
        )

def test_minimum_target_rule():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    result = assess_numeric_target_rule(
        actual_value=11.0,
        target_rule="minimum",
        target_value=10.0,
    )

    assert result.delivery_status == "delivered"
    assert result.direction == "strengthens"


def test_maximum_target_rule():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    result = assess_numeric_target_rule(
        actual_value=11.0,
        target_rule="maximum",
        target_value=12.0,
    )

    assert result.delivery_status == "delivered"
    assert result.direction == "strengthens"


def test_range_target_inside():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    result = assess_numeric_target_rule(
        actual_value=175.0,
        target_rule="range",
        target_min=150.0,
        target_max=200.0,
    )

    assert result.delivery_status == "delivered"
    assert result.direction == "strengthens"


def test_range_target_just_outside():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    result = assess_numeric_target_rule(
        actual_value=145.0,
        target_rule="range",
        target_min=150.0,
        target_max=200.0,
    )

    assert (
        result.delivery_status
        == "partially_delivered"
    )
    assert result.direction == "neutral"


def test_range_target_materially_missed():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    result = assess_numeric_target_rule(
        actual_value=120.0,
        target_rule="range",
        target_min=150.0,
        target_max=200.0,
    )

    assert result.delivery_status == "missed"
    assert result.direction == "weakens"


def test_invalid_target_rule():
    from stock_intelligence.management_delivery_scoring import (
        assess_numeric_target_rule,
    )

    with pytest.raises(ValueError):
        assess_numeric_target_rule(
            actual_value=10.0,
            target_rule="something_else",
            target_value=10.0,
        )