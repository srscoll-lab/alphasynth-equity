from __future__ import annotations

import pandas as pd

from .backtest_event import BacktestEvent
from .backtest_returns import calculate_forward_return
from .market_recognition_scoring import calculate_mrs


def build_backtest_event(
    *,
    company_id: int,
    symbol: str,
    period: str,
    result_date: str,
    tcs_score: float,
    tcs_state: str,
    stock_prices: pd.DataFrame,
    sector_prices: pd.DataFrame,
    return_1d_pct: float,
    return_20d_pct: float,
    relative_return_20d_pct: float,
) -> BacktestEvent:
    """
    Build one complete historical backtest event.

    Combines:
        TCS
        MRS
        Recognition Gap
        Forward 20/60/120 trading-day returns
    """

    mrs_result = calculate_mrs(
        return_1d_pct=return_1d_pct,
        return_20d_pct=return_20d_pct,
        relative_return_20d_pct=relative_return_20d_pct,
    )

    recognition_gap = round(
        float(tcs_score) - float(mrs_result.mrs_score),
        4,
    )

    forward_20d = calculate_forward_return(
        stock_prices,
        start_date=result_date,
        trading_days=20,
    )

    forward_60d = calculate_forward_return(
        stock_prices,
        start_date=result_date,
        trading_days=60,
    )

    forward_120d = calculate_forward_return(
        stock_prices,
        start_date=result_date,
        trading_days=120,
    )

    return BacktestEvent(
        company_id=company_id,
        symbol=symbol,
        period=period,
        result_date=pd.Timestamp(result_date).date(),
        tcs_score=tcs_score,
        tcs_state=tcs_state,
        return_1d_pct=return_1d_pct,
        return_20d_pct=return_20d_pct,
        relative_return_20d_pct=relative_return_20d_pct,
        mrs_score=mrs_result.mrs_score,
        recognition_gap=recognition_gap,
        forward_return_20d_pct=forward_20d,
        forward_return_60d_pct=forward_60d,
        forward_return_120d_pct=forward_120d,
    )