from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import json

from sqlalchemy import func, select

from .config import settings
from .db import SessionLocal
from .gemini_recommendation_extractor import (
    extract_recommendation_with_gemini,
)
from .models import AIJob, Company, RawItem, Recommendation
from .normalise import normalise_item
from .schemas import CollectedItem


def run_queued_ai_jobs(
    limit: int | None = None,
) -> dict[str, int]:
    if limit is None:
        limit = settings.max_ai_items_per_run

    counts = {
        "completed": 0,
        "errors": 0,
    }

    with SessionLocal() as session:
        jobs = session.scalars(
            select(AIJob)
            .where(
                AIJob.status == "queued",
                AIJob.job_type == "recommendation_extraction",
            )
            .order_by(AIJob.id)
            .limit(limit)
        ).all()

        for job in jobs:
            try:
                raw = session.get(RawItem, job.raw_item_id)

                if raw is None:
                    raise ValueError(
                        f"RawItem {job.raw_item_id} not found"
                    )

                item = normalise_item(
                    CollectedItem(
                        source_type=raw.source.source_type,
                        source_name=raw.source.name,
                        external_id=raw.external_id,
                        published_at=raw.published_at,
                        title=raw.title,
                        raw_text=raw.raw_text,
                        raw_url=raw.raw_url,
                    )
                )

                result = extract_recommendation_with_gemini(
                    item
                )

                if not result.action:
                    job.status = "completed_no_recommendation"
                    job.model_name = settings.gemini_model
                    job.output_chars = len(result.model_dump_json())
                    job.estimated_output_tokens = max(
                        1,
                        job.output_chars // 4,
                    )
                    job.completed_at = datetime.now(timezone.utc)

                    counts["completed"] += 1
                    continue

                company = None

                if result.company_symbol:
                    company = session.scalar(
                        select(Company).where(
                            func.upper(Company.nse_symbol)
                            == result.company_symbol.upper()
                        )
                    )

                recommendation = Recommendation(
                    raw_item_id=raw.id,
                    company_id=(
                        company.id
                        if company
                        else None
                    ),
                    action=result.action,
                    strategy_horizon=(
                        result.strategy_horizon
                    ),
                    holding_period_text=(
                        result.holding_period_text
                    ),
                    entry_low=(
                        Decimal(str(result.entry_low))
                        if result.entry_low is not None
                        else None
                    ),
                    entry_high=(
                        Decimal(str(result.entry_high))
                        if result.entry_high is not None
                        else None
                    ),
                    target_price=(
                        Decimal(str(result.target_price))
                        if result.target_price is not None
                        else None
                    ),
                    stop_loss=(
                        Decimal(str(result.stop_loss))
                        if result.stop_loss is not None
                        else None
                    ),
                    confidence=(
                        Decimal(str(result.confidence))
                        if result.confidence is not None
                        else None
                    ),
                    thesis_summary=(
                        result.thesis_summary
                    ),
                    evidence_json=json.dumps(
                        result.evidence
                    ),
                    extraction_method="gemini",
                )

                session.add(recommendation)

                raw.status = "ai_processed"

                job.status = "completed"
                job.model_name = settings.gemini_model
                job.output_chars = len(
                    result.model_dump_json()
                )
                job.estimated_output_tokens = max(
                    1,
                    job.output_chars // 4,
                )
                job.completed_at = datetime.now(
                    timezone.utc
                )

                counts["completed"] += 1

            except Exception as exc:
                job.status = "error"
                job.error_message = str(exc)
                job.completed_at = datetime.now(
                    timezone.utc
                )

                counts["errors"] += 1

        session.commit()

    return counts