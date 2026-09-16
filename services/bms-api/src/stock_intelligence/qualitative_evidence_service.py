from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .gemini_qualitative_interpreter import (
    interpret_qualitative_change_with_gemini,
)
from .models import ChangeRecord, Thesis, ThesisEvidence
from .thesis_direction_rules import infer_thesis_direction


def create_qualitative_thesis_evidence(
    *,
    db: Session,
    thesis: Thesis,
    change_record: ChangeRecord,
) -> ThesisEvidence:
    """
    Convert one qualitative ChangeRecord into ThesisEvidence.

    Decision order:

        1. Try deterministic thesis-direction rules.
        2. If they cannot interpret the change, use Gemini.
        3. Store only:
           strengthens / weakens / neutral

    The ThesisEvidence now also stores change_record_id,
    preserving the exact link to the underlying ChangeRecord.
    """

    inferred = infer_thesis_direction(
        metric_or_topic=change_record.metric_or_topic,
        change_direction=change_record.direction,
    )

    if inferred is not None:
        direction = inferred.direction
        confidence = inferred.confidence
        rationale = inferred.rationale

    else:
        interpretation = (
            interpret_qualitative_change_with_gemini(
                thesis_text=thesis.thesis_text,
                topic=change_record.metric_or_topic,
                previous_statement=change_record.previous_value,
                current_statement=(
                    change_record.current_value
                    or ""
                ),
                change_summary=(
                    change_record.change_value
                    or (
                        f"{change_record.metric_or_topic} "
                        f"changed"
                    )
                ),
            )
        )

        direction = interpretation.direction
        confidence = interpretation.confidence
        rationale = interpretation.rationale

    evidence = ThesisEvidence(
        thesis_id=thesis.id,
        raw_item_id=change_record.raw_item_id,
        change_record_id=change_record.id,
        evidence_type=change_record.metric_or_topic,
        direction=direction,
        summary=rationale,
        confidence=Decimal(str(confidence)),
        observed_at=change_record.first_known_at,
    )

    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    return evidence