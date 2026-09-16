from stock_intelligence.change_detection import detect_numeric_change


def test_detect_increase():
    result = detect_numeric_change(100, 125)

    assert result.absolute_change == 25
    assert result.percentage_change == 25.0
    assert result.direction == "increase"


def test_detect_decrease():
    result = detect_numeric_change(100, 80)

    assert result.absolute_change == -20
    assert result.percentage_change == -20.0
    assert result.direction == "decrease"


def test_small_change_is_neutral():
    result = detect_numeric_change(100, 100.5)

    assert result.direction == "neutral"


def test_zero_previous_value():
    result = detect_numeric_change(0, 25)

    assert result.percentage_change is None
    assert result.direction == "increase"