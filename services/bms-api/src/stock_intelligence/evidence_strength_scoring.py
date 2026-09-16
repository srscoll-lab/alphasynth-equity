from __future__ import annotations


DEFAULT_SOURCE_CREDIBILITY = {
    "official_exchange": 98.0,
    "regulator": 98.0,
    "audited_financial_statement": 95.0,
    "company_filing": 92.0,
    "quarterly_result": 92.0,
    "company_presentation": 85.0,
    "established_research": 75.0,
    "research_community": 70.0,
    "news_secondary": 65.0,
    "social": 50.0,
    "test": 50.0,
    "unknown": 40.0,
}


def get_default_source_credibility(
    *,
    source_type: str | None,
) -> float:
    """
    Return the default credibility score for a source type.

    V1 uses objective defaults for primary sources and
    conservative defaults for secondary/social sources.

    Individual analyst or research-house rankings are not
    included in V1.
    """

    if not source_type:
        return DEFAULT_SOURCE_CREDIBILITY["unknown"]

    normalized = source_type.strip().lower()

    return DEFAULT_SOURCE_CREDIBILITY.get(
        normalized,
        DEFAULT_SOURCE_CREDIBILITY["unknown"],
    )


def calculate_evidence_strength_score(
    *,
    source_type: str | None,
    specificity_score: float,
    source_credibility_score: float | None = None,
) -> float:
    """
    Calculate Evidence Strength Score V1 on a 0-100 scale.

    Formula:

        60% source credibility
        40% specificity

    If a specific source credibility score is already known,
    it overrides the default source-type score.

    Otherwise the source-type default is used.
    """

    if specificity_score < 0 or specificity_score > 100:
        raise ValueError(
            "specificity_score must be between 0 and 100"
        )

    if source_credibility_score is None:
        source_credibility_score = (
            get_default_source_credibility(
                source_type=source_type,
            )
        )

    if (
        source_credibility_score < 0
        or source_credibility_score > 100
    ):
        raise ValueError(
            "source_credibility_score must be between 0 and 100"
        )

    evidence_strength = (
        source_credibility_score * 0.60
        + specificity_score * 0.40
    )

    return round(evidence_strength, 2)