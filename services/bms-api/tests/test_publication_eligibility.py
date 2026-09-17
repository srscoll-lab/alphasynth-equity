from stock_intelligence.factor_analysis import empty_factor_analysis
from stock_intelligence.publication_eligibility import assess_publication_eligibility


def complete(factor: dict) -> None:
    factor["availability"] = "complete"
    factor["confidence"] = "medium"
    source_url = f"https://company.example/{factor['id']}.pdf"
    factor["evidence_refs"] = [source_url]
    factor["source_details"] = [{
        "url": source_url,
        "published_at": "2026-02-01",
        "source_type": "company_results",
    }]
    factor["provenance_verified"] = True
    factor["previous"].update({
        "period": "Q3 FY25", "observed_at": "2026-02-01",
        "metrics": [{"key": "metric", "value": 1, "unit": "INR crore"}],
    })
    factor["current"].update({
        "period": "Q3 FY26", "observed_at": "2026-02-01",
        "metrics": [{"key": "metric", "value": 2, "unit": "INR crore"}],
    })


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
