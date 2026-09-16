from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .market_recognition_scoring import (
    calculate_mrs,
)


@dataclass(frozen=True)
class DailyMRSPoint:
    trading_day: int
    date: pd.Timestamp
    mrs_score: float


@dataclass(frozen=True)
class RecognitionResult:
    recognition_date: pd.Timestamp | None
    entry_date: pd.Timestamp | None
    recognition_day: int | None
    recognition_band: str | None
    recognition_type: str | None
    mrs_at_recognition: float | None
    recognition_found: bool
    daily_path: tuple[DailyMRSPoint, ...]

    # Why the watch stopped if recognition was not found.
    expiry_reason: str | None

    # Reserved for the future Event Override Layer.
    override_event: bool = False


def _recognition_band(
    day: int,
) -> str:
    if day <= 20:
        return "normal"

    if day <= 40:
        return "delayed"

    return "late"


def find_mrs_recognition(
    *,
    stock_prices: pd.DataFrame,
    sector_prices: pd.DataFrame,
    result_date: str | pd.Timestamp,
    next_event_date: str | pd.Timestamp | None = None,
    max_trading_days: int = 60,
    immediate_confirmation_days: int = 2,
) -> RecognitionResult:
    """
    Track the complete daily MRS path after a qualifying
    TCS event.

    The recognition watch ends at whichever happens first:

        1. Recognition occurs
        2. The next fundamental/TCS event occurs
        3. 60 trading days are reached

    Recognition can occur in two ways:

    IMMEDIATE:
        MRS is positive from the beginning and remains
        positive for the confirmation period.

    DELAYED:
        MRS is initially non-positive and later becomes
        positive for the confirmation period.

    Recognition bands:

        Day 1-20   -> normal
        Day 21-40  -> delayed
        Day 41-60  -> late

    Entry is the next available trading day after
    confirmed recognition.

    override_event is reserved for a future external
    Event Override Layer. It is not active in V0.
    """

    if immediate_confirmation_days < 1:
        raise ValueError(
            "immediate_confirmation_days "
            "must be at least 1"
        )

    stock = stock_prices.rename(
        columns={
            "close": "stock_close",
        }
    )

    sector = sector_prices.rename(
        columns={
            "close": "sector_close",
        }
    )

    prices = (
        stock[["stock_close"]]
        .join(
            sector[["sector_close"]],
            how="inner",
        )
        .sort_index()
    )

    result_ts = pd.Timestamp(
        result_date
    )

    next_event_ts = None

    if next_event_date is not None:
        next_event_ts = pd.Timestamp(
            next_event_date
        )

        if next_event_ts <= result_ts:
            raise ValueError(
                "next_event_date must be later "
                "than result_date"
            )

    available = prices.loc[
        prices.index >= result_ts
    ]

    # The old TCS event is no longer valid once the
    # next fundamental event occurs.
    if next_event_ts is not None:
        available = available.loc[
            available.index < next_event_ts
        ]

    if len(available) < 2:
        expiry_reason = (
            "next_fundamental_event"
            if next_event_ts is not None
            else "insufficient_market_data"
        )

        return RecognitionResult(
            recognition_date=None,
            entry_date=None,
            recognition_day=None,
            recognition_band=None,
            recognition_type=None,
            mrs_at_recognition=None,
            recognition_found=False,
            daily_path=tuple(),
            expiry_reason=expiry_reason,
            override_event=False,
        )

    event_stock_close = float(
        available.iloc[0][
            "stock_close"
        ]
    )

    event_sector_close = float(
        available.iloc[0][
            "sector_close"
        ]
    )

    first_day_return = (
        float(
            available.iloc[1][
                "stock_close"
            ]
        )
        / event_stock_close
        - 1.0
    ) * 100.0

    last_day = min(
        max_trading_days,
        len(available) - 1,
    )

    daily_points: list[
        DailyMRSPoint
    ] = []

    for day in range(
        1,
        last_day + 1,
    ):
        stock_return = (
            float(
                available.iloc[day][
                    "stock_close"
                ]
            )
            / event_stock_close
            - 1.0
        ) * 100.0

        sector_return = (
            float(
                available.iloc[day][
                    "sector_close"
                ]
            )
            / event_sector_close
            - 1.0
        ) * 100.0

        relative_return = (
            stock_return
            - sector_return
        )

        mrs_result = calculate_mrs(
            return_1d_pct=(
                first_day_return
            ),
            return_20d_pct=(
                stock_return
            ),
            relative_return_20d_pct=(
                relative_return
            ),
        )

        current_mrs = float(
            mrs_result.mrs_score
        )

        daily_points.append(
            DailyMRSPoint(
                trading_day=day,
                date=available.index[day],
                mrs_score=round(
                    current_mrs,
                    4,
                ),
            )
        )

    confirmation_days = (
        immediate_confirmation_days
    )

    for index, point in enumerate(
        daily_points
    ):
        end = (
            index
            + confirmation_days
        )

        if end > len(
            daily_points
        ):
            break

        window = daily_points[
            index:end
        ]

        all_positive = all(
            item.mrs_score > 0
            for item in window
        )

        if not all_positive:
            continue

        recognition_point = (
            window[-1]
        )

        had_non_positive_before = any(
            item.mrs_score <= 0
            for item in daily_points[
                :index
            ]
        )

        if index == 0:
            recognition_type = (
                "immediate"
            )
        elif had_non_positive_before:
            recognition_type = (
                "delayed"
            )
        else:
            recognition_type = (
                "immediate"
            )

        recognition_day = (
            recognition_point.trading_day
        )

        recognition_date = (
            recognition_point.date
        )

        entry_date = None

        entry_position = (
            recognition_day + 1
        )

        if entry_position < len(
            available
        ):
            candidate_entry = (
                available.index[
                    entry_position
                ]
            )

            if (
                next_event_ts is None
                or candidate_entry
                < next_event_ts
            ):
                entry_date = (
                    candidate_entry
                )

        return RecognitionResult(
            recognition_date=(
                recognition_date
            ),
            entry_date=entry_date,
            recognition_day=(
                recognition_day
            ),
            recognition_band=(
                _recognition_band(
                    recognition_day
                )
            ),
            recognition_type=(
                recognition_type
            ),
            mrs_at_recognition=(
                recognition_point.mrs_score
            ),
            recognition_found=True,
            daily_path=tuple(
                daily_points
            ),
            expiry_reason=None,
            override_event=False,
        )

    # No recognition was found.
    #
    # Determine whether the watch ended because the
    # next fundamental event arrived or because the
    # maximum watch period was reached.

    if (
        next_event_ts is not None
        and len(available) - 1
        < max_trading_days
    ):
        expiry_reason = (
            "next_fundamental_event"
        )
    else:
        expiry_reason = (
            "max_watch_period"
        )

    return RecognitionResult(
        recognition_date=None,
        entry_date=None,
        recognition_day=None,
        recognition_band=None,
        recognition_type=None,
        mrs_at_recognition=None,
        recognition_found=False,
        daily_path=tuple(
            daily_points
        ),
        expiry_reason=expiry_reason,
        override_event=False,
    )