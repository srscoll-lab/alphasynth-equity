from __future__ import annotations

from dataclasses import dataclass

FACTOR_WEIGHTS = {
    "earnings": 0.25,
    "economics": 0.25,
    "execution": 0.25,
    "balance_sheet": 0.15,
    "management_delivery": 0.10,
}

MANDATORY_FACTORS = {"earnings", "economics"}
MINIMUM_COMPLETE_FACTORS = 4
MINIMUM_COVERAGE_WEIGHT = 0.75


@dataclass(frozen=True)
class PublicationEligibility:
    status: str
    score_publishable: bool
    complete_factor_ids: tuple[str, ...]
    missing_factor_ids: tuple[str, ...]
    complete_factor_count: int
    coverage_weight: float
    reasons: tuple[str, ...]

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "scorePublishable": self.score_publishable,
            "completeFactorIds": list(self.complete_factor_ids),
            "missingFactorIds": list(self.missing_factor_ids),
            "completeFactorCount": self.complete_factor_count,
            "coverageWeight": self.coverage_weight,
            "reasons": list(self.reasons),
        }


def assess_publication_eligibility(factor_analysis: dict) -> PublicationEligibility:
    """Fail closed unless four sourced, comparable factors are present.

    A numerical zero is never treated as evidence. A factor is complete only
    when the analysis explicitly contains previous and current measurements,
    at least one evidence reference, and a usable confidence classification.
    """

    supplied = {
        str(factor.get("id")): factor
        for factor in factor_analysis.get("factors", [])
        if isinstance(factor, dict)
    }
    complete: list[str] = []

    for factor_id in FACTOR_WEIGHTS:
        factor = supplied.get(factor_id, {})
        previous = factor.get("previous") or {}
        current = factor.get("current") or {}
        previous_metrics = previous.get("metrics") or []
        current_metrics = current.get("metrics") or []
        refs = factor.get("evidence_refs") or factor.get("evidenceRefs") or []
        confidence = str(factor.get("confidence") or "unavailable")
        if (
            factor.get("availability") == "complete"
            and previous_metrics
            and current_metrics
            and refs
            and confidence != "unavailable"
        ):
            complete.append(factor_id)

    complete_set = set(complete)
    missing = [factor for factor in FACTOR_WEIGHTS if factor not in complete_set]
    coverage = round(sum(FACTOR_WEIGHTS[factor] for factor in complete), 2)
    missing_mandatory = sorted(MANDATORY_FACTORS - complete_set)
    reasons: list[str] = []

    if len(complete) < MINIMUM_COMPLETE_FACTORS:
        reasons.append(
            f"Only {len(complete)} of 5 factors have comparable sourced evidence; "
            f"at least {MINIMUM_COMPLETE_FACTORS} are required."
        )
    if coverage < MINIMUM_COVERAGE_WEIGHT:
        reasons.append(
            f"Comparable evidence covers {round(coverage * 100)}% of model weight; "
            f"at least {round(MINIMUM_COVERAGE_WEIGHT * 100)}% is required."
        )
    if missing_mandatory:
        reasons.append(
            "Mandatory factor evidence is missing: " + ", ".join(missing_mandatory) + "."
        )

    publishable = not reasons
    return PublicationEligibility(
        status="eligible" if publishable else "repair_required",
        score_publishable=publishable,
        complete_factor_ids=tuple(complete),
        missing_factor_ids=tuple(missing),
        complete_factor_count=len(complete),
        coverage_weight=coverage,
        reasons=tuple(reasons),
    )
