from datetime import datetime
from pydantic import BaseModel, Field


class CollectedItem(BaseModel):
    source_type: str
    source_name: str
    external_id: str | None = None
    published_at: datetime | None = None
    title: str | None = None
    raw_text: str = Field(min_length=1)
    raw_url: str | None = None


class NormalisedItem(BaseModel):
    title: str | None
    text: str
    source_type: str
    source_name: str
    external_id: str | None
    published_at: datetime | None
    raw_url: str | None
    content_hash: str


class AIDecision(BaseModel):
    invoke_ai: bool
    reason: str
    estimated_input_tokens: int


class AIExtractionResult(BaseModel):
    company_symbol: str | None = None
    action: str | None = None
    strategy_horizon: str | None = None
    holding_period_text: str | None = None
    entry_low: float | None = None
    entry_high: float | None = None
    target_price: float | None = None
    stop_loss: float | None = None
    confidence: float | None = None
    thesis_summary: str | None = None
    evidence: list[str] = []
