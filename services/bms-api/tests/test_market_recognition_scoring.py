from stock_intelligence.market_recognition_scoring import calculate_mrs


def test_positive_market_recognition():
    result = calculate_mrs(
        return_1d_pct=5.0,
        return_20d_pct=10.0,
        relative_return_20d_pct=5.0,
    )

    assert result.mrs_score > 0
    assert result.model_version == "mrs-v0.1"


def test_negative_market_recognition():
    result = calculate_mrs(
        return_1d_pct=-5.0,
        return_20d_pct=-10.0,
        relative_return_20d_pct=-5.0,
    )

    assert result.mrs_score < 0


def test_mrs_is_bounded():
    result = calculate_mrs(
        return_1d_pct=100.0,
        return_20d_pct=100.0,
        relative_return_20d_pct=100.0,
    )

    assert result.mrs_score == 2.0