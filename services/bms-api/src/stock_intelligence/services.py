from decimal import Decimal
import json

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .ai_gate import decide_ai
from .db import SessionLocal
from .models import AIJob, Company, RawItem, Recommendation, Source
from .normalise import normalise_item
from .recommendation_extractor import extract_recommendation_with_rules
from .schemas import CollectedItem


def ingest(item: CollectedItem) -> tuple[bool, str]:
    normalised = normalise_item(item)

    with SessionLocal() as session:
        source = session.scalar(
            select(Source).where(
                Source.source_type == normalised.source_type,
                Source.name == normalised.source_name,
            )
        )
        if source is None:
            source = Source(
                source_type=normalised.source_type,
                name=normalised.source_name,
            )
            session.add(source)
            session.flush()

        raw = RawItem(
            source_id=source.id,
            external_id=normalised.external_id,
            published_at=normalised.published_at,
            title=normalised.title,
            raw_text=normalised.text,
            raw_url=normalised.raw_url,
            content_hash=normalised.content_hash,
            status="pending",
        )
        session.add(raw)

        try:
            session.commit()
            return True, "stored"
        except IntegrityError:
            session.rollback()
            return False, "duplicate"


def process_pending(limit: int = 100) -> dict[str, int]:
    counts = {"processed_without_ai": 0, "queued_for_ai": 0, "errors": 0}

    with SessionLocal() as session:
        items = session.scalars(
            select(RawItem)
            .where(RawItem.status == "pending")
            .order_by(RawItem.id)
            .limit(limit)
        ).all()

        for raw in items:
            try:
                normalised = normalise_item(
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

                decision = decide_ai(normalised)

                if decision.invoke_ai:
                    raw.status = "ai_required"

                    session.add(
                        AIJob(
                            raw_item_id=raw.id,
                            job_type="recommendation_extraction",
                            status="queued",
                            input_chars=len(raw.raw_text),
                            estimated_input_tokens=decision.estimated_input_tokens,
                            reason_invoked=decision.reason,
                        )
                    )

                    counts["queued_for_ai"] += 1

                else:
                    extraction = extract_recommendation_with_rules(normalised)

                    company = None

                    if extraction.company_symbol:
                        company = session.scalar(
                            select(Company).where(
                                func.upper(Company.nse_symbol)
                                == extraction.company_symbol.upper()
                            )
                        )

                    recommendation = Recommendation(
                        raw_item_id=raw.id,
                        company_id=company.id if company else None,
                        action=extraction.action,
                        strategy_horizon=extraction.strategy_horizon,
                        holding_period_text=extraction.holding_period_text,
                        entry_low=(
                            Decimal(str(extraction.entry_low))
                            if extraction.entry_low is not None
                            else None
                        ),
                        entry_high=(
                            Decimal(str(extraction.entry_high))
                            if extraction.entry_high is not None
                            else None
                        ),
                        target_price=(
                            Decimal(str(extraction.target_price))
                            if extraction.target_price is not None
                            else None
                        ),
                        stop_loss=(
                            Decimal(str(extraction.stop_loss))
                            if extraction.stop_loss is not None
                            else None
                        ),
                        confidence=(
                            Decimal(str(extraction.confidence))
                            if extraction.confidence is not None
                            else None
                        ),
                        thesis_summary=extraction.thesis_summary,
                        evidence_json=json.dumps(extraction.evidence),
                        extraction_method="rules",
                    )

                    session.add(recommendation)

                    raw.status = "rule_processed"

                    counts["processed_without_ai"] += 1

            except Exception as exc:
                raw.status = "error"
                raw.processing_error = str(exc)
                counts["errors"] += 1

        session.commit()

    return counts


def get_status() -> dict[str, int]:
    with SessionLocal() as session:
        total = session.scalar(
            select(func.count()).select_from(RawItem)
        ) or 0

        pending = session.scalar(
            select(func.count())
            .select_from(RawItem)
            .where(RawItem.status == "pending")
        ) or 0

        ai_required = session.scalar(
            select(func.count())
            .select_from(RawItem)
            .where(RawItem.status == "ai_required")
        ) or 0

        rule_processed = session.scalar(
            select(func.count())
            .select_from(RawItem)
            .where(RawItem.status == "rule_processed")
        ) or 0

        duplicates_avoided = 0

        return {
            "total_raw_items": total,
            "pending": pending,
            "ai_required": ai_required,
            "rule_processed": rule_processed,
            "duplicates_avoided_this_query": duplicates_avoided,
        }