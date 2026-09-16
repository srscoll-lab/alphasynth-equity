from __future__ import annotations

from dataclasses import dataclass


DEFAULT_CSS_WEIGHTS = {
    "economic_importance": 0.25,
    "magnitude": 0.20,
    "evidence_strength": 0.20,
    "persistence": 0.15,
    "novelty": 0.10,
    "specificity": 0.10,
}


@dataclass(frozen=True)
class ChangeStrengthResult:
    economic_importance: float
    magnitude: float
    evidence_strength: float
    persistence: float
    novelty: float
    specificity: float
    css_score: float
    css_band: str
    model_version: str


def _validate_component(name: str, score: float) -> None:
    if score < 0 or score > 100:
        raise ValueError(
            f"{name} must be between 0 and 100"
        )


def _validate_weights(weights: dict[str, float]) -> None:
    required = set(DEFAULT_CSS_WEIGHTS)

    missing = required - set(weights)

    if missing:
        raise ValueError(
            f"Missing CSS weights: {sorted(missing)}"
        )

    total = sum(
        weights[name]
        for name in required
    )

    if abs(total - 1.0) > 0.0001:
        raise ValueError(
            "CSS weights must add up to 1.0"
        )


def _css_band(score: float) -> str:
    if score < 35:
        return "weak"

    if score < 50:
        return "developing"

    if score < 65:
        return "moderate"

    if score < 80:
        return "strong"

    return "exceptional"


def calculate_change_strength(
    *,
    economic_importance: float,
    magnitude: float,
    evidence_strength: float,
    persistence: float,
    novelty: float,
    specificity: float,
    weights: dict[str, float] | None = None,
    model_version: str = "css-v1.0",
) -> ChangeStrengthResult:
    """
    Calculate Change Strength Score (CSS).

    CSS measures how important and credible a change is.

    CSS deliberately does NOT determine whether a change is
    positive or negative. Direction is stored separately.
    """

    components = {
        "economic_importance": economic_importance,
        "magnitude": magnitude,
        "evidence_strength": evidence_strength,
        "persistence": persistence,
        "novelty": novelty,
        "specificity": specificity,
    }

    for name, score in components.items():
        _validate_component(name, score)

    active_weights = (
        weights
        if weights is not None
        else DEFAULT_CSS_WEIGHTS
    )

    _validate_weights(active_weights)

    css_score = sum(
        components[name] * active_weights[name]
        for name in components
    )

    css_score = round(css_score, 2)

    return ChangeStrengthResult(
        economic_importance=economic_importance,
        magnitude=magnitude,
        evidence_strength=evidence_strength,
        persistence=persistence,
        novelty=novelty,
        specificity=specificity,
        css_score=css_score,
        css_band=_css_band(css_score),
        model_version=model_version,
    )