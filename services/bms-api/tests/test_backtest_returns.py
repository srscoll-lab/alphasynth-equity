import pandas as pd

from stock_intelligence.backtest_returns import (
    calculate_forward_return,
    first_trading_date_on_or_after,
)


def test_first_trading_date_on_or_after():
    df = pd.DataFrame(
        {"close": [100, 105, 110]},
        index=pd.to_datetime(
            [
                "2026-01-02",
                "2026-01-05",
                "2026-01-06",
            ]
        ),
    )

    result = first_trading_date_on_or_after(
        df,
        "2026-01-03",
    )

    assert result == pd.Timestamp("2026-01-05")


def test_forward_return():
    df = pd.DataFrame(
        {"close": [100, 105, 110]},
        index=pd.to_datetime(
            [
                "2026-01-02",
                "2026-01-05",
                "2026-01-06",
            ]
        ),
    )

    result = calculate_forward_return(
        df,
        start_date="2026-01-02",
        trading_days=2,
    )

    assert result == 10.0


def test_insufficient_future_data_returns_none():
    df = pd.DataFrame(
        {"close": [100, 105]},
        index=pd.to_datetime(
            [
                "2026-01-02",
                "2026-01-05",
            ]
        ),
    )

    result = calculate_forward_return(
        df,
        start_date="2026-01-02",
        trading_days=20,
    )

    assert result is None