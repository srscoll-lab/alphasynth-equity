import pytest

from stock_intelligence.tcs_state import classify_tcs_state


def test_strongly_strengthening():
    assert (
        classify_tcs_state(tcs_score=1.35)
        == "strongly_strengthening"
    )


def test_improving():
    assert (
        classify_tcs_state(tcs_score=0.72)
        == "improving"
    )


def test_mixed():
    assert (
        classify_tcs_state(tcs_score=0.15)
        == "mixed"
    )


def test_weakening():
    assert (
        classify_tcs_state(tcs_score=-0.65)
        == "weakening"
    )


def test_strongly_weakening():
    assert (
        classify_tcs_state(tcs_score=-1.30)
        == "strongly_weakening"
    )


def test_boundary_values():
    assert (
        classify_tcs_state(tcs_score=1.0)
        == "strongly_strengthening"
    )

    assert (
        classify_tcs_state(tcs_score=0.4)
        == "improving"
    )

    assert (
        classify_tcs_state(tcs_score=-0.4)
        == "weakening"
    )

    assert (
        classify_tcs_state(tcs_score=-1.0)
        == "strongly_weakening"
    )


def test_invalid_high_score():
    with pytest.raises(ValueError):
        classify_tcs_state(tcs_score=2.01)


def test_invalid_low_score():
    with pytest.raises(ValueError):
        classify_tcs_state(tcs_score=-2.01)