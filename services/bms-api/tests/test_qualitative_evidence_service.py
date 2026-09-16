from decimal import Decimal

from stock_intelligence.db import SessionLocal
from stock_intelligence.models import (
    ChangeRecord,
    Thesis,
    ThesisEvidence,
)
from stock_intelligence.qualitative_evidence_service import (
    create_qualitative_thesis_evidence,
)


def test_ambiguous_qualitative_change_uses_gemini():
    db = SessionLocal()

    thesis_id = None
    change_id = None
    evidence_id = None

    try:
        thesis = Thesis(
            company_id=1,
            thesis_type="growth",
            title="Temporary qualitative evidence test",
            thesis_text=(
                "The company will create earnings growth by "
                "commissioning new capacity on schedule."
            ),
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        change = ChangeRecord(
            company_id=1,
            change_type="qualitative",
            category="execution",
            metric_or_topic="commissioning",
            previous_value=(
                "Commercial production will begin in December."
            ),
            current_value=(
                "Commissioning is expected shortly."
            ),
            change_value=(
                "The previously specific December timetable "
                "has become less specific."
            ),
            direction="less_specific",
            materiality_score=Decimal("75.00"),
            materiality_band="high",
            confidence=Decimal("0.95"),
        )

        db.add(change)
        db.commit()
        db.refresh(change)

        change_id = change.id

        evidence = create_qualitative_thesis_evidence(
            db=db,
            thesis=thesis,
            change_record=change,
        )

        evidence_id = evidence.id

        assert evidence.direction in {
            "strengthens",
            "weakens",
            "neutral",
        }

        assert evidence.evidence_type == "commissioning"
        assert evidence.summary
        assert evidence.confidence is not None

    finally:
        if evidence_id is not None:
            db.query(ThesisEvidence).filter(
                ThesisEvidence.id == evidence_id
            ).delete()

        if change_id is not None:
            db.query(ChangeRecord).filter(
                ChangeRecord.id == change_id
            ).delete()

        if thesis_id is not None:
            db.query(Thesis).filter(
                Thesis.id == thesis_id
            ).delete()

        db.commit()
        db.close()