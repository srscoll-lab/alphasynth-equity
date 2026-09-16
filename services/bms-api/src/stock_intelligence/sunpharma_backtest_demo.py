from __future__ import annotations

import pandas as pd

from .backtest_runner import build_backtest_event


EVENTS = [
    {
        "period": "Q1 FY26",
        "result_date": "2025-07-31",
        "tcs_score": 1.0870,
        "tcs_state": "strongly_strengthening",
        "return_1d_pct": -4.51,
        "return_20d_pct": -8.40,
        "relative_return_20d_pct": -4.04,
    },
    {
        "period": "Q2 FY26",
        "result_date": "2025-11-06",
        "tcs_score": 1.0825,
        "tcs_state": "strongly_strengthening",
        "return_1d_pct": 0.33,
        "return_20d_pct": 7.85,
        "relative_return_20d_pct": 4.67,
    },
    {
        "period": "Q3 FY26",
        "result_date": "2026-02-02",
        "tcs_score": 1.1500,
        "tcs_state": "strongly_strengthening",
        "return_1d_pct": 4.56,
        "return_20d_pct": 7.65,
        "relative_return_20d_pct": 1.12,
    },
]


def load_prices(path: str) -> pd.DataFrame:
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
        event = build_backtest_event(
            company_id=2048,
            symbol="SUNPHARMA",
            period=item["period"],
            result_date=item["result_date"],
            tcs_score=item["tcs_score"],
            tcs_state=item["tcs_state"],
            stock_prices=stock_prices,
            sector_prices=sector_prices,
            return_1d_pct=item["return_1d_pct"],
            return_20d_pct=item["return_20d_pct"],
            relative_return_20d_pct=(
                item["relative_return_20d_pct"]
            ),
        )

        rows.append(
            {
                "period": event.period,
                "tcs": event.tcs_score,
                "mrs": event.mrs_score,
                "recognition_gap": (
                    event.recognition_gap
                ),
                "forward_20d_pct": (
                    event.forward_return_20d_pct
                ),
                "forward_60d_pct": (
                    event.forward_return_60d_pct
                ),
                "forward_120d_pct": (
                    event.forward_return_120d_pct
                ),
            }
        )

    print(
        pd.DataFrame(rows).to_string(
            index=False
        )
    )


if __name__ == "__main__":
    main()