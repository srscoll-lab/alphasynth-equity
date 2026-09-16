from __future__ import annotations

import pandas as pd

from .backtest_returns import (
    calculate_forward_return,
)
from .mrs_recognition import (
    find_mrs_recognition,
)


EVENTS = [
    {
        "period": "Q1 FY26",
        "result_date": "2025-07-31",
        "next_event_date": "2025-11-06",
        "tcs_score": 1.0870,
    },
    {
        "period": "Q2 FY26",
        "result_date": "2025-11-06",
        "next_event_date": "2026-02-02",
        "tcs_score": 1.0825,
    },
    {
        "period": "Q3 FY26",
        "result_date": "2026-02-02",
        "next_event_date": None,
        "tcs_score": 1.1500,
    },
]


def load_prices(
    path: str,
) -> pd.DataFrame:
    df = pd.read_csv(
        path,
        parse_dates=["date"],
    )

    return (
        df
        .set_index("date")
        .sort_index()
    )


def main() -> None:
    stock_prices = load_prices(
        r".\data\SUNPHARMA_daily.csv"
    )

    sector_prices = load_prices(
        r".\data\NIFTY_PHARMA_daily.csv"
    )

    rows = []

    for item in EVENTS:
        recognition = find_mrs_recognition(
            stock_prices=stock_prices,
            sector_prices=sector_prices,
            result_date=item["result_date"],
            next_event_date=item["next_event_date"],
            max_trading_days=60,
        )

        forward_20d = None
        forward_60d = None
        forward_120d = None

        if (
            recognition.recognition_found
            and recognition.entry_date
            is not None
        ):
            forward_20d = (
                calculate_forward_return(
                    stock_prices,
                    start_date=(
                        recognition.entry_date
                    ),
                    trading_days=20,
                )
            )

            forward_60d = (
                calculate_forward_return(
                    stock_prices,
                    start_date=(
                        recognition.entry_date
                    ),
                    trading_days=60,
                )
            )

            forward_120d = (
                calculate_forward_return(
                    stock_prices,
                    start_date=(
                        recognition.entry_date
                    ),
                    trading_days=120,
                )
            )

        rows.append(
            {
                "period": item["period"],
                "tcs": item["tcs_score"],
                "recognition_found": (
                    recognition.recognition_found
                ),
                "recognition_day": (
                    recognition.recognition_day
                ),
                "recognition_band": (
                    recognition.recognition_band
                ),
                "recognition_date": (
                    recognition.recognition_date
                ),
                "entry_date": (
                    recognition.entry_date
                ),
                "mrs_at_recognition": (
                    recognition.mrs_at_recognition
                ),
                "forward_20d_pct": (
                    forward_20d
                ),
                "forward_60d_pct": (
                    forward_60d
                ),
                "forward_120d_pct": (
                    forward_120d
                ),
            }
        )

    result = pd.DataFrame(rows)

    print(
        result.to_string(
            index=False
        )
    )


if __name__ == "__main__":
    main()