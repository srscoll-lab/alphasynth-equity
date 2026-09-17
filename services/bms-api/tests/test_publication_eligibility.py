from stock_intelligence.factor_analysis import empty_factor_analysis
from stock_intelligence.publication_eligibility import assess_publication_eligibility


def complete(factor: dict) -> None:
    factor["availability"] = "complete"
    factor["confidence"] = "medium"
    factor["evidence_refs"] = [f"source-{factor['id']}"]
    factor["previous"]["metrics"] = [{"key": "metric", "value": 1}]
    factor["current"]["metrics"] = [{"key": "metric", "value": 2}]


def test_requires_all_four_core_factors():
    analysis = empty_factor_analysis("Q3 FY26")
    for factor in analysis["factors"]:
        if factor["id"] in {"earnings", "economics", "execution", "balance_sheet"}:
            complete(factor)

    result = assess_publication_eligibility(analysis)

    assert result.score_publishable is True
    assert result.complete_factor_count == 4
    assert result.coverage_weight == 1.0
    assert result.target_complete is True


def test_four_core_factors_reach_the_coverage_target():
    analysis = empty_factor_analysis("Q3 FY26")
    for factor in analysis["factors"]:
        complete(factor)

    result = assess_publication_eligibility(analysis)

    assert result.score_publishable is True
    assert result.complete_factor_count == 4
    assert result.coverage_weight == 1.0
    assert result.target_complete is True


def test_zero_score_without_evidence_is_not_complete():
    analysis = empty_factor_analysis("Q3 FY26")
    for factor in analysis["factors"]:
        factor["current"]["factor_score"] = 0.0

    result = assess_publication_eligibility(analysis)

    assert result.score_publishable is False
    assert result.complete_factor_count == 0


def test_four_factors_still_fail_without_earnings():
    analysis = empty_factor_analysis("Q3 FY26")
    for factor in analysis["factors"]:
        if factor["id"] != "earnings":
            complete(factor)

    result = assess_publication_eligibility(analysis)

    assert result.score_publishable is False
    assert any("earnings" in reason for reason in result.reasons)
