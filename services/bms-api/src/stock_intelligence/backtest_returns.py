from __future__ import annotations

import pandas as pd


def first_trading_date_on_or_after(
    prices: pd.DataFrame,
    event_date: str | pd.Timestamp,
) -> pd.Timestamp:
    """
    Return the first available trading date on or after
    the event date.

    This avoids inventing a trading session for weekends
    and exchange holidays.
    """

    event_ts = pd.Timestamp(event_date)

    eligible = prices.loc[
        prices.index >= event_ts
    ]

    if eligible.empty:
        raise ValueError(
            "No trading date available on or after "
            f"{event_ts.date()}"
        )

    return eligible.index[0]


def calculate_forward_return(
    prices: pd.DataFrame,
    *,
    start_date: str | pd.Timestamp,
    trading_days: int,
    close_column: str = "close",
) -> float | None:
    """
    Calculate forward return from the first trading date
    on or after start_date.

    trading_days=20 means 20 trading sessions forward.
    """

    if trading_days < 1:
        raise ValueError(
            "trading_days must be at least 1"
        )

    actual_start = first_trading_date_on_or_after(
        prices,
        start_date,
    )

    future = prices.loc[
        prices.index >= actual_start
    ]

    if len(future) <= trading_days:
        return None

    start_price = float(
        future.iloc[0][close_column]
    )

    end_price = float(
        future.iloc[trading_days][close_column]
    )

    return round(
        (end_price / start_price - 1.0) * 100.0,
        4,
    )