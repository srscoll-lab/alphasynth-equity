from __future__ import annotations

import re


NUMBER_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\b"
)

PERCENT_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\s*%"
)

CURRENCY_PATTERN = re.compile(
    r"(?:₹|rs\.?|inr)\s*\d+(?:\.\d+)?",
    re.IGNORECASE,
)

PERIOD_PATTERN = re.compile(
    r"\b(?:q[1-4]\s+fy\d{2}|fy\d{2}|quarter|year|month)\b",
    re.IGNORECASE,
)

GUIDANCE_PATTERN = re.compile(
    r"\b(?:"
    r"guidance|"
    r"target|"
    r"margin|"
    r"revenue|"
    r"ebitda|"
    r"ebitda margin|"
    r"operating income|"
    r"operating margin|"
    r"operating profit|"
    r"pat|"
    r"cash flow|"
    r"debt"
    r")\b",
    re.IGNORECASE,
)


def calculate_specificity_score(
    *,
    text: str,
) -> float:
    """
    Calculate Specificity Score V1 on a 0-100 scale.

    Higher scores are given to evidence that contains
    concrete, verifiable detail such as:

    - exact numbers
    - percentages
    - currency values
    - fiscal periods
    - named financial metrics
    - explicit guidance or targets

    Vague qualitative language receives a lower score.
    """

    normalized = text.strip()

    if not normalized:
        return 0.0

    score = 20.0

    number_count = len(
        NUMBER_PATTERN.findall(normalized)
    )

    percent_count = len(
        PERCENT_PATTERN.findall(normalized)
    )

    currency_count = len(
        CURRENCY_PATTERN.findall(normalized)
    )

    period_count = len(
        PERIOD_PATTERN.findall(normalized)
    )

    guidance_count = len(
        GUIDANCE_PATTERN.findall(normalized)
    )

    if number_count >= 1:
        score += 10.0

    if number_count >= 3:
        score += 10.0

    if percent_count >= 1:
        score += 15.0

    if currency_count >= 1:
        score += 15.0

    if period_count >= 1:
        score += 10.0

    if guidance_count >= 1:
        score += 10.0

    if len(normalized) >= 120:
        score += 5.0

    if len(normalized) >= 250:
        score += 5.0

    return min(score, 100.0)