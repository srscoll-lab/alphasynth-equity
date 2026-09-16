from __future__ import annotations

from google import genai

from .config import settings
from .schemas import AIExtractionResult, NormalisedItem


def extract_recommendation_with_gemini(
    item: NormalisedItem,
) -> AIExtractionResult:
    """
    Extract a structured stock recommendation from unstructured
    research text using Gemini on Vertex AI.

    Gemini is used only after the AI gate has determined that
    deterministic parsing is insufficient.
    """

    if not settings.google_cloud_project:
        raise ValueError(
            "GOOGLE_CLOUD_PROJECT is not configured"
        )

    client = genai.Client(
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.vertex_location,
    )

    prompt = f"""
You are extracting a structured stock-market recommendation
from research text about an Indian listed company.

Return only information that is explicitly supported by the text.

Rules:

- company_symbol:
  NSE trading symbol if clearly stated or unambiguously identifiable.
  Otherwise null.

- action:
  buy, sell, accumulate, avoid, hold, watch, or null.

- strategy_horizon:
  intraday, short_term, medium_term, long_term, or null.

- holding_period_text:
  Preserve an explicitly stated holding period.
  Otherwise null.

- entry_low and entry_high:
  Extract only if an entry price or price range is actually stated.
  Otherwise null.

- target_price:
  Extract only if explicitly stated.
  Otherwise null.

- stop_loss:
  Extract only if explicitly stated.
  Otherwise null.

- confidence:
  Your confidence in the extraction itself, between 0 and 1.
  This is NOT confidence that the investment recommendation will succeed.

- thesis_summary:
  Briefly summarize the investment argument from the supplied text.
  Do not add facts.

- evidence:
  Return a short list of the most important factual statements
  in the supplied text that support the extracted recommendation.

Do not invent prices, targets, symbols, holding periods,
financial figures, or investment conclusions.

Research text:

{item.text}
"""

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": AIExtractionResult,
            "temperature": 0.0,
        },
    )

    if not response.text:
        raise ValueError(
            "Gemini returned an empty response"
        )

    return AIExtractionResult.model_validate_json(
        response.text
    )