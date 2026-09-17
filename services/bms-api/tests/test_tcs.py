import pytest

from stock_intelligence.tcs import calculate_tcs


def test_tcs_current_score_only():
    result = calculate_tcs(
        earnings=2,
        economics=1,
        execution=1,
        balance_sheet=0,
        management_delivery=1,
    )

    assert result.current_tcs == 1.1112
    assert result.previous_tcs is None
    assert result.delta_tcs is None
    assert result.model_version == "bms-v1.1-four-factor"


def test_tcs_with_previous_scores():
    result = calculate_tcs(
        earnings=2,
        economics=1,
        execution=0,
        balance_sheet=0,
        management_delivery=1,
        previous_earnings=1,
        previous_economics=1,
        previous_execution=2,
        previous_balance_sheet=1,
        previous_management_delivery=1,
    )

    assert result.current_tcs == 0.8334
    assert result.previous_tcs == 1.2778
    assert result.delta_tcs == -0.4444


def test_factor_deltas_are_preserved():
    result = calculate_tcs(
        earnings=2,
        economics=1,
        execution=0,
        balance_sheet=0,
        management_delivery=1,
        previous_earnings=1,
        previous_economics=1,
        previous_execution=2,
        previous_balance_sheet=1,
        previous_management_delivery=1,
    )

    deltas = {
        factor.name: factor.delta
        for factor in result.factors
    }

    assert deltas["earnings"] == 1
    assert deltas["economics"] == 0
    assert deltas["execution"] == -2
    assert deltas["balance_sheet"] == -1
    assert "management_delivery" not in deltas


def test_score_must_be_between_minus_two_and_plus_two():
    with pytest.raises(ValueError):
        calculate_tcs(
            earnings=3,
            economics=1,
            execution=1,
            balance_sheet=1,
            management_delivery=1,
        )


def test_partial_previous_scores_do_not_create_previous_tcs():
    result = calculate_tcs(
        earnings=1,
        economics=1,
        execution=1,
        balance_sheet=1,
        management_delivery=1,
        previous_earnings=0,
    )

    assert result.previous_tcs is None
    assert result.delta_tcs is None

    earnings_factor = next(
        factor
        for factor in result.factors
        if factor.name == "earnings"
    )

    assert earnings_factor.delta == 1
