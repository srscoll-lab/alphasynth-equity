from __future__ import annotations

import re

from .schemas import AIExtractionResult, NormalisedItem


ACTION_PATTERN = re.compile(
    r"\b(buy|sell|accumulate|avoid)\b",
    re.IGNORECASE,
)

ENTRY_PATTERN = re.compile(
    r"\b(?:at|around|near|entry(?:\s+at)?)\s*₹?\s*(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

TARGET_PATTERN = re.compile(
    r"\b(?:target|tgt)\s*(?:of|at|:|-)?\s*₹?\s*(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

STOP_PATTERN = re.compile(
    r"\b(?:stop[\s-]?loss|sl)\s*(?:at|:|-)?\s*₹?\s*(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

SYMBOL_PATTERN = re.compile(
    r"\b(?:buy|sell|accumulate|avoid)\s+([A-Z][A-Z0-9&.-]{1,20})\b",
    re.IGNORECASE,
)


def extract_recommendation_with_rules(
    item: NormalisedItem,
) -> AIExtractionResult:
    """
    Extract a simple structured stock recommendation without using AI.
    """

    text = item.text.strip()

    action_match = ACTION_PATTERN.search(text)
    symbol_match = SYMBOL_PATTERN.search(text)
    entry_match = ENTRY_PATTERN.search(text)
    target_match = TARGET_PATTERN.search(text)
    stop_match = STOP_PATTERN.search(text)

    action = (
        action_match.group(1).lower()
        if action_match
        else None
    )

    company_symbol = (
        symbol_match.group(1).upper()
        if symbol_match
        else None
    )

    entry = (
        float(entry_match.group(1))
        if entry_match
        else None
    )

    target = (
        float(target_match.group(1))
        if target_match
        else None
    )

    stop_loss = (
        float(stop_match.group(1))
        if stop_match
        else None
    )

    evidence = [text]

    confidence = 0.90 if action and company_symbol else 0.60

    return AIExtractionResult(
        company_symbol=company_symbol,
        action=action,
        entry_low=entry,
        entry_high=entry,
        target_price=target,
        stop_loss=stop_loss,
        confidence=confidence,
        thesis_summary=text,
        evidence=evidence,
    )