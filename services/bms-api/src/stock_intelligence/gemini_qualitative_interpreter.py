from __future__ import annotations

from pydantic import BaseModel, Field

from google import genai

from .config import settings
from .qualitative_thesis_interpreter import (
    QualitativeThesisInterpretation,
    create_qualitative_thesis_interpretation,
)


class GeminiInterpretationResponse(BaseModel):
    direction: str
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str


def interpret_qualitative_change_with_gemini(
    *,
    thesis_text: str,
    topic: str,
    previous_statement: str | None,
    current_statement: str,
    change_summary: str,
) -> QualitativeThesisInterpretation:
    """
    Use Gemini on Vertex AI to interpret an ambiguous qualitative
    change relative to a specific investment thesis.

    Gemini is constrained to return:
        direction
        confidence
        rationale

    The result is validated again by our internal interpretation
    contract before being returned.
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
You are evaluating whether a newly observed qualitative company change
strengthens or weakens a specific investment thesis.

Investment thesis:
{thesis_text}

Topic:
{topic}

Previous statement:
{previous_statement or "No previous statement available"}

Current statement:
{current_statement}

Observed change:
{change_summary}

Determine the investment-thesis impact.

Use:
- strengthens: the new evidence increases confidence in the thesis
- weakens: the new evidence decreases confidence in the thesis
- neutral: the evidence does not materially change thesis confidence

Be conservative.
Do not infer facts that are not present in the supplied evidence.
"""

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": GeminiInterpretationResponse,
            "temperature": 0.0,
        },
    )

    if not response.text:
        raise ValueError(
            "Gemini returned an empty response"
        )

    parsed = GeminiInterpretationResponse.model_validate_json(
        response.text
    )

    return create_qualitative_thesis_interpretation(
        direction=parsed.direction,
        confidence=parsed.confidence,
        rationale=parsed.rationale,
    )