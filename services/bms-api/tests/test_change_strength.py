import pytest

from stock_intelligence.change_strength import (
    calculate_change_strength,
)


def test_exceptional_change_strength():
    result = calculate_change_strength(
        economic_importance=90,
        magnitude=80,
        evidence_strength=85,
        persistence=75,
        novelty=70,
        specificity=90,
    )

    assert result.css_score == 82.75
    assert result.css_band == "exceptional"
    assert result.model_version == "css-v1.0"


def test_strong_change_strength():
    result = calculate_change_strength(
        economic_importance=70,
        magnitude=70,
        evidence_strength=70,
        persistence=70,
        novelty=70,
        specificity=70,
    )

    assert result.css_score == 70.0
    assert result.css_band == "strong"


def test_weak_change_strength():
    result = calculate_change_strength(
        economic_importance=20,
        magnitude=20,
        evidence_strength=20,
        persistence=20,
        novelty=20,
        specificity=20,
    )

    assert result.css_score == 20.0
    assert result.css_band == "weak"


def test_component_above_100_raises():
    with pytest.raises(ValueError):
        calculate_change_strength(
            economic_importance=110,
            magnitude=50,
            evidence_strength=50,
            persistence=50,
            novelty=50,
            specificity=50,
        )


def test_component_below_zero_raises():
    with pytest.raises(ValueError):
        calculate_change_strength(
            economic_importance=50,
            magnitude=-1,
            evidence_strength=50,
            persistence=50,
            novelty=50,
            specificity=50,
        )


def test_invalid_weights_raise():
    with pytest.raises(ValueError):
        calculate_change_strength(
            economic_importance=50,
            magnitude=50,
            evidence_strength=50,
            persistence=50,
            novelty=50,
            specificity=50,
            weights={
                "economic_importance": 0.30,
                "magnitude": 0.30,
                "evidence_strength": 0.20,
                "persistence": 0.15,
                "novelty": 0.10,
                "specificity": 0.10,
            },
        )