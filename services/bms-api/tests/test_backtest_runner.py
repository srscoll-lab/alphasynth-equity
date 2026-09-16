import pandas as pd

from stock_intelligence.backtest_runner import (
    build_backtest_event,
)


def test_build_backtest_event():
    dates = pd.bdate_range(
        start="2026-01-02",
        periods=130,
    )

    stock_prices = pd.DataFrame(
        {
            "close": [
                100 + i
                for i in range(130)
            ]
        },
        index=dates,
    )

    sector_prices = pd.DataFrame(
        {
            "close": [
                200 + i
                for i in range(130)
            ]
        },
        index=dates,
    )

    event = build_backtest_event(
        company_id=1,
        symbol="TEST",
        period="Q1 FY26",
        result_date="2026-01-02",
        tcs_score=1.10,
        tcs_state="strongly_strengthening",
        stock_prices=stock_prices,
        sector_prices=sector_prices,
        return_1d_pct=2.0,
        return_20d_pct=8.0,
        relative_return_20d_pct=3.0,
    )

    assert event.symbol == "TEST"
    assert event.mrs_score > 0
    assert event.recognition_gap is not None
    assert event.forward_return_20d_pct is not None
    assert event.forward_return_60d_pct is not None
    assert event.forward_return_120d_pct is not None