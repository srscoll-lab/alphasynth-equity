from __future__ import annotations


def classify_tcs_state(
    *,
    tcs_score: float,
) -> str:
    """
    Convert a TCS score into a human-readable state.

    TCS range:
        -2.0 to +2.0

    States:
        strongly_strengthening
        improving
        mixed
        weakening
        strongly_weakening
    """

    score = float(tcs_score)

    if score < -2.0 or score > 2.0:
        raise ValueError(
            "tcs_score must be between -2.0 and +2.0"
        )

    if score >= 1.0:
        return "strongly_strengthening"

    if score >= 0.4:
        return "improving"

    if score > -0.4:
        return "mixed"

    if score > -1.0:
        return "weakening"

    return "strongly_weakening"