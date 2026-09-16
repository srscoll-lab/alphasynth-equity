from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConfidenceResult:
    confidence: float
    source_score: float
    directness_adjustment: float
    verification_adjustment: float
    interpretation_adjustment: float
    reason: str


SOURCE_CONFIDENCE = {
    # Primary / official sources
    "exchange_filing": 0.99,
    "audited_annual_report": 0.99,
    "annual_report": 0.98,
    "quarterly_result": 0.97,
    "company_filing": 0.97,
    "investor_presentation": 0.95,
    "earnings_release": 0.95,
    "earnings_call": 0.90,
    "management_commentary": 0.88,

    # Professional secondary sources
    "broker_research": 0.82,
    "analyst_research": 0.82,
    "rating_agency": 0.88,
    "financial_media": 0.78,

    # Aggregators / secondary databases
    "financial_database": 0.75,
    "data_aggregator": 0.70,

    # Low-certainty / unknown sources
    "social_media": 0.55,
    "unknown": 0.60,
    "csv_import": 0.70,
}


def calculate_observation_confidence(
    *,
    source_type: str | None,
    direct_fact: bool = True,
    independently_verified: bool = False,
    interpretation_required: bool = False,
) -> ConfidenceResult:
    """
    Calculate confidence in a financial observation.

    Confidence answers:

        "How certain are we that this observation is
        accurate and correctly interpreted?"

    It does NOT measure:

        - importance of the change
        - attractiveness of the company
        - probability of the share price rising

    V1 uses four components:

        1. Source reliability
        2. Directness
        3. Independent verification
        4. Interpretation burden
    """

    normalized_source = (
        (source_type or "unknown")
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )

    source_score = SOURCE_CONFIDENCE.get(
        normalized_source,
        SOURCE_CONFIDENCE["unknown"],
    )

    directness_adjustment = (
        0.0 if direct_fact else -0.08
    )

    verification_adjustment = (
        0.02 if independently_verified else 0.0
    )

    interpretation_adjustment = (
        -0.08 if interpretation_required else 0.0
    )

    confidence = (
        source_score
        + directness_adjustment
        + verification_adjustment
        + interpretation_adjustment
    )

    # Confidence must always remain between 0 and 1.
    confidence = max(
        0.0,
        min(1.0, confidence),
    )

    confidence = round(
        confidence,
        3,
    )

    reason_parts = [
        (
            f"source={normalized_source} "
            f"({source_score:.2f})"
        )
    ]

    if not direct_fact:
        reason_parts.append(
            "not a direct fact (-0.08)"
        )

    if independently_verified:
        reason_parts.append(
            "independently verified (+0.02)"
        )

    if interpretation_required:
        reason_parts.append(
            "interpretation required (-0.08)"
        )

    reason = "; ".join(reason_parts)

    return ConfidenceResult(
        confidence=confidence,
        source_score=source_score,
        directness_adjustment=(
            directness_adjustment
        ),
        verification_adjustment=(
            verification_adjustment
        ),
        interpretation_adjustment=(
            interpretation_adjustment
        ),
        reason=reason,
    )