from stock_intelligence.change_service import create_numeric_change_record
from stock_intelligence.db import SessionLocal
from stock_intelligence.models import ChangeRecord


def test_create_numeric_change_record():
    db = SessionLocal()

    try:
        record = create_numeric_change_record(
            db,
            company_id=1,
            metric_or_topic="TEST Revenue",
            category="financial",
            previous_value=100,
            current_value=125,
            magnitude_score=80,
            persistence_score=60,
            economic_importance_score=90,
            novelty_score=70,
            comparison_type="YoY",
            previous_period="Q1 FY26",
            current_period="Q1 FY27",
            confidence=0.95,
        )

        assert record.direction == "increase"
        assert record.change_value == "25.0"
        assert float(record.materiality_score) == 75.0
        assert record.materiality_band == "high"
        assert record.comparison_type == "YoY"

        db.delete(record)
        db.commit()

        deleted = (
            db.query(ChangeRecord)
            .filter(ChangeRecord.id == record.id)
            .first()
        )

        assert deleted is None

    finally:
        db.close()