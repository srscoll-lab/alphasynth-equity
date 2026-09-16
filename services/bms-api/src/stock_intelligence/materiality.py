from __future__ import annotations

from dataclasses import dataclass


DEFAULT_WEIGHTS = {
    "magnitude": 0.25,
    "persistence": 0.25,
    "economic_importance": 0.25,
    "novelty": 0.25,
}


@dataclass(frozen=True)
class MaterialityResult:
    magnitude: float
    persistence: float
    economic_importance: float
    novelty: float
    materiality_score: float
    materiality_band: str
    model_version: str


def _validate_component_score(name: str, score: float) -> None:
    if score < 0 or score > 100:
        raise ValueError(f"{name} must be between 0 and 100")


def _validate_weights(weights: dict[str, float]) -> None:
    required = {
        "magnitude",
        "persistence",
        "economic_importance",
        "novelty",
    }

    missing = required - set(weights)

    if missing:
        raise ValueError(f"Missing materiality weights: {sorted(missing)}")

    total_weight = sum(weights[key] for key in required)

    if abs(total_weight - 1.0) > 0.0001:
        raise ValueError("Materiality weights must add up to 1.0")


def _materiality_band(score: float) -> str:
    if score < 30:
        return "low"

    if score < 60:
        return "moderate"

    if score < 80:
        return "high"

    return "very_high"


def calculate_materiality(
    magnitude: float,
    persistence: float,
    economic_importance: float,
    novelty: float,
    weights: dict[str, float] | None = None,
    model_version: str = "materiality-v1.0",
) -> MaterialityResult:
    _validate_component_score("magnitude", magnitude)
    _validate_component_score("persistence", persistence)
    _validate_component_score(
        "economic_importance",
        economic_importance,
    )
    _validate_component_score("novelty", novelty)

    if weights is None:
        weights = DEFAULT_WEIGHTS

    _validate_weights(weights)

    materiality_score = (
        magnitude * weights["magnitude"]
        + persistence * weights["persistence"]
        + economic_importance * weights["economic_importance"]
        + novelty * weights["novelty"]
    )

    materiality_score = round(materiality_score, 2)

    return MaterialityResult(
        magnitude=magnitude,
        persistence=persistence,
        economic_importance=economic_importance,
        novelty=novelty,
        materiality_score=materiality_score,
        materiality_band=_materiality_band(materiality_score),
        model_version=model_version,
    )