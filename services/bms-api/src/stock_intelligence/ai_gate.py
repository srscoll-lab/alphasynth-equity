import re

from .config import settings
from .schemas import AIDecision, NormalisedItem


STRUCTURED_TIP_PATTERN = re.compile(
    r"\b(buy|sell|accumulate|avoid)\b.*\b(target|tgt|stop.?loss|sl)\b",
    re.IGNORECASE,
)


def estimate_tokens(text: str) -> int:
    # Conservative planning estimate for English prose.
    return max(1, len(text) // 4)


def decide_ai(item: NormalisedItem) -> AIDecision:
    text = item.text

    if len(text) < settings.min_text_length_for_ai:
        return AIDecision(
            invoke_ai=False,
            reason="Short item; deterministic parsing should be attempted first.",
            estimated_input_tokens=estimate_tokens(text),
        )

    if STRUCTURED_TIP_PATTERN.search(text):
        return AIDecision(
            invoke_ai=False,
            reason="Clearly structured recommendation; parse with rules before using AI.",
            estimated_input_tokens=estimate_tokens(text),
        )

    analytical_markers = (
        "because",
        "valuation",
        "earnings",
        "management",
        "thesis",
        "risk",
        "guidance",
        "competitive",
        "margin",
        "cash flow",
    )
    marker_count = sum(marker in text.lower() for marker in analytical_markers)

    if marker_count >= 2:
        return AIDecision(
            invoke_ai=True,
            reason="Unstructured analytical content requires classification and synthesis.",
            estimated_input_tokens=estimate_tokens(text),
        )

    return AIDecision(
        invoke_ai=False,
        reason="No clear need for model reasoning.",
        estimated_input_tokens=estimate_tokens(text),
    )
