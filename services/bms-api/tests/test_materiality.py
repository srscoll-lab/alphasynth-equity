from stock_intelligence.materiality import calculate_materiality


def test_equal_weight_materiality():
    result = calculate_materiality(
        magnitude=80,
        persistence=60,
        economic_importance=90,
        novelty=70,
    )

    assert result.materiality_score == 75.0
    assert result.materiality_band == "high"
    assert result.model_version == "materiality-v1.0"


def test_low_materiality():
    result = calculate_materiality(
        magnitude=10,
        persistence=10,
        economic_importance=20,
        novelty=10,
    )

    assert result.materiality_score == 12.5
    assert result.materiality_band == "low"


def test_very_high_materiality():
    result = calculate_materiality(
        magnitude=95,
        persistence=90,
        economic_importance=95,
        novelty=90,
    )

    assert result.materiality_score == 92.5
    assert result.materiality_band == "very_high"


def test_custom_weights():
    weights = {
        "magnitude": 0.20,
        "persistence": 0.20,
        "economic_importance": 0.40,
        "novelty": 0.20,
    }

    result = calculate_materiality(
        magnitude=80,
        persistence=60,
        economic_importance=90,
        novelty=70,
        weights=weights,
        model_version="materiality-v1.1",
    )

    assert result.materiality_score == 78.0
    assert result.model_version == "materiality-v1.1"


def test_invalid_component_score():
    try:
        calculate_materiality(
            magnitude=120,
            persistence=60,
            economic_importance=90,
            novelty=70,
        )
        assert False
    except ValueError:
        assert True


def test_invalid_weights():
    weights = {
        "magnitude": 0.20,
        "persistence": 0.20,
        "economic_importance": 0.20,
        "novelty": 0.20,
    }

    try:
        calculate_materiality(
            magnitude=80,
            persistence=60,
            economic_importance=90,
            novelty=70,
            weights=weights,
        )
        assert False
    except ValueError:
        assert True
        