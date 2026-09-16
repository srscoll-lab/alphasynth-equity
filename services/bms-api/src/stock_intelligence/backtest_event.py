from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class BacktestEvent:
    company_id: int
    symbol: str
    period: str
    result_date: date
    tcs_score: float
    tcs_state: str

    # Market-recognition inputs
    return_1d_pct: float | None = None
    return_20d_pct: float | None = None
    relative_return_20d_pct: float | None = None
    mrs_score: float | None = None

    # Derived relationship between fundamentals and market
    recognition_gap: float | None = None

    # Forward performance after the signal
    forward_return_20d_pct: float | None = None
    forward_return_60d_pct: float | None = None
    forward_return_120d_pct: float | None = None