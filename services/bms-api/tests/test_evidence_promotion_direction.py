from decimal import Decimal

from stock_intelligence.db import SessionLocal
from stock_intelligence.evidence_promotion import (
    promote_change_to_evidence,
)
from stock_intelligence.models import (
    ChangeRecord,
    Thesis,
    ThesisEvidence,
)


def test_revenue_increase_promotes_as_strengthens():
    db = SessionLocal()

    thesis_id = None
    change_id = None
    evidence_id = None

    try:
        thesis = Thesis(
            company_id=1,
            thesis_type="growth",
            title="Temporary promotion direction test",
            thesis_text="Temporary test thesis",
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        change = ChangeRecord(
            company_id=1,
            change_type="numeric",
            category="financial",
            metric_or_topic="revenue",
            previous_value="100",
            current_value="120",
            change_value="20%",
            direction="increase",
            materiality_score=Decimal("75.00"),
            materiality_band="high",
            confidence=Decimal("0.95"),
        )

        db.add(change)
        db.commit()
        db.refresh(change)

        change_id = change.id

        evidence = promote_change_to_evidence(
            db,
            thesis_id=thesis.id,
            change_record=change,
        )

        assert evidence is not None

        evidence_id = evidence.id

        assert evidence.direction == "strengthens"
        assert evidence.evidence_type == "revenue"

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


def test_debt_increase_promotes_as_weakens():
    db = SessionLocal()

    thesis_id = None
    change_id = None
    evidence_id = None

    try:
        thesis = Thesis(
            company_id=1,
            thesis_type="growth",
            title="Temporary debt direction test",
            thesis_text="Temporary test thesis",
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        change = ChangeRecord(
            company_id=1,
            change_type="numeric",
            category="financial",
            metric_or_topic="total_debt",
            previous_value="100",
            current_value="150",
            change_value="50%",
            direction="increase",
            materiality_score=Decimal("75.00"),
            materiality_band="high",
            confidence=Decimal("0.95"),
        )

        db.add(change)
        db.commit()
        db.refresh(change)

        change_id = change.id

        evidence = promote_change_to_evidence(
            db,
            thesis_id=thesis.id,
            change_record=change,
        )

        assert evidence is not None

        evidence_id = evidence.id

        assert evidence.direction == "weakens"
        assert evidence.evidence_type == "total_debt"

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