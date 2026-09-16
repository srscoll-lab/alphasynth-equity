from dataclasses import dataclass


MODEL_VERSION = "mrs-v0.1"


@dataclass(frozen=True)
class MarketRecognitionResult:
    mrs_score: float
    immediate_score: float
    persistence_score: float
    relative_strength_score: float
    model_version: str = MODEL_VERSION


def _score_return(return_pct: float) -> float:
    """
    Convert a percentage return into a simple -2 to +2 score.

    +/-10% or greater receives the maximum absolute score.
    """
    return max(-2.0, min(2.0, return_pct / 5.0))


def calculate_mrs(
    *,
    return_1d_pct: float,
    return_20d_pct: float,
    relative_return_20d_pct: float,
) -> MarketRecognitionResult:

    immediate = _score_return(return_1d_pct)
    persistence = _score_return(return_20d_pct)
    relative = _score_return(relative_return_20d_pct)

    mrs = (
        0.25 * immediate
        + 0.35 * persistence
        + 0.40 * relative
    )

    return MarketRecognitionResult(
        mrs_score=round(mrs, 4),
        immediate_score=round(immediate, 4),
        persistence_score=round(persistence, 4),
        relative_strength_score=round(relative, 4),
    )