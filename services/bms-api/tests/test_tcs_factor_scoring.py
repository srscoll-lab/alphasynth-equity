from stock_intelligence.thesis_engine import evaluate_thesis_impact
from stock_intelligence.tcs_factor_scoring import calculate_factor_score


def test_empty_evidence_returns_neutral():
    result = calculate_factor_score([])

    assert result.score == 0.0
    assert result.evidence_count == 0
    assert result.contradiction is False


def test_strong_strengthening_evidence_scores_positive():
    impact = evaluate_thesis_impact(
        direction="strengthens",
        impact_score=8,
        rationale="Margins improved strongly",
        confidence=0.9,
    )

    result = calculate_factor_score([impact])

    assert result.score == 1.44
    assert result.strengthens_count == 1
    assert result.weakens_count == 0
    assert result.contradiction is False


def test_strong_weakening_evidence_scores_negative():
    impact = evaluate_thesis_impact(
        direction="weakens",
        impact_score=8,
        rationale="Asset quality deteriorated",
        confidence=0.9,
    )

    result = calculate_factor_score([impact])

    assert result.score == -1.44
    assert result.strengthens_count == 0
    assert result.weakens_count == 1
    assert result.contradiction is False


def test_conflicting_evidence_is_preserved():
    positive = evaluate_thesis_impact(
        direction="strengthens",
        impact_score=8,
        rationale="Margins improved",
        confidence=0.9,
    )

    negative = evaluate_thesis_impact(
        direction="weakens",
        impact_score=4,
        rationale="Working capital worsened",
        confidence=0.8,
    )

    result = calculate_factor_score(
        [positive, negative]
    )

    assert result.score == 0.40
    assert result.strengthens_count == 1
    assert result.weakens_count == 1
    assert result.contradiction is True


def test_balanced_conflicting_evidence_scores_zero():
    positive = evaluate_thesis_impact(
        direction="strengthens",
        impact_score=5,
        rationale="Positive evidence",
        confidence=1.0,
    )

    negative = evaluate_thesis_impact(
        direction="weakens",
        impact_score=5,
        rationale="Negative evidence",
        confidence=1.0,
    )

    result = calculate_factor_score(
        [positive, negative]
    )

    assert result.score == 0.0
    assert result.contradiction is True