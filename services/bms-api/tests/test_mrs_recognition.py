import pandas as pd

from stock_intelligence.mrs_recognition import (
    find_mrs_recognition,
)


def make_sector(
    dates,
):
    return pd.DataFrame(
        {
            "close": [100] * len(dates)
        },
        index=dates,
    )


def test_immediate_recognition():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": (
                [100, 103, 104, 105]
                + [106] * 26
            )
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is True
    assert result.recognition_type == "immediate"
    assert result.recognition_day == 2
    assert result.recognition_band == "normal"
    assert result.expiry_reason is None


def test_delayed_recognition():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": (
                [
                    100,
                    95,
                    94,
                    96,
                    101,
                    104,
                    105,
                ]
                + [106] * 23
            )
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is True
    assert result.recognition_type == "delayed"
    assert result.recognition_day > 2


def test_no_recognition():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=65,
    )

    stock = pd.DataFrame(
        {
            "close": [
                100 - (i * 0.5)
                for i in range(65)
            ]
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is False
    assert result.recognition_date is None
    assert (
        result.expiry_reason
        == "max_watch_period"
    )


def test_entry_is_after_recognition():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": (
                [
                    100,
                    95,
                    94,
                    97,
                    101,
                    104,
                    106,
                ]
                + [107] * 23
            )
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is True

    assert (
        result.entry_date
        > result.recognition_date
    )


def test_delayed_recognition_after_day_20():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=70,
    )

    stock_values = (
        [100]
        + [95] * 25
        + [105] * 44
    )

    stock = pd.DataFrame(
        {
            "close": stock_values
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is True
    assert result.recognition_day > 20
    assert result.recognition_day <= 40

    assert (
        result.recognition_band
        == "delayed"
    )


def test_late_recognition_after_day_40():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=75,
    )

    stock_values = (
        [100]
        + [95] * 45
        + [105] * 29
    )

    stock = pd.DataFrame(
        {
            "close": stock_values
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.recognition_found is True
    assert result.recognition_day > 40
    assert result.recognition_day <= 60
    assert result.recognition_band == "late"


def test_daily_path_is_recorded():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": (
                [
                    100,
                    95,
                    96,
                    99,
                    103,
                    105,
                ]
                + [106] * 24
            )
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert len(
        result.daily_path
    ) > 0

    assert (
        result.daily_path[0]
        .trading_day
        == 1
    )


def test_watch_expires_at_next_event():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=80,
    )

    stock = pd.DataFrame(
        {
            "close": [
                100 - (i * 0.1)
                for i in range(80)
            ]
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
        next_event_date="2026-02-02",
    )

    assert result.recognition_found is False

    assert (
        result.expiry_reason
        == "next_fundamental_event"
    )

    assert all(
        point.date
        < pd.Timestamp(
            "2026-02-02"
        )
        for point in result.daily_path
    )


def test_next_event_must_follow_result():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": [100] * 30
        },
        index=dates,
    )

    try:
        find_mrs_recognition(
            stock_prices=stock,
            sector_prices=make_sector(
                dates
            ),
            result_date="2026-01-02",
            next_event_date="2026-01-01",
        )

        assert False

    except ValueError:
        assert True


def test_override_placeholder_is_false():
    dates = pd.bdate_range(
        "2026-01-02",
        periods=30,
    )

    stock = pd.DataFrame(
        {
            "close": (
                [100, 103, 104]
                + [105] * 27
            )
        },
        index=dates,
    )

    result = find_mrs_recognition(
        stock_prices=stock,
        sector_prices=make_sector(
            dates
        ),
        result_date="2026-01-02",
    )

    assert result.override_event is False