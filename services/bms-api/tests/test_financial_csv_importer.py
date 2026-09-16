from pathlib import Path

from stock_intelligence.db import SessionLocal
from stock_intelligence.financial_csv_importer import import_financial_csv
from stock_intelligence.models import ChangeRecord, FinancialObservation


def test_financial_csv_importer_creates_change():
    db = SessionLocal()

    csv_path = Path("test_financials.csv")

    try:
        result = import_financial_csv(
            db,
            csv_path,
        )

        assert result["inserted"] == 2
        assert result["changes_created"] == 1
        assert result["skipped"] == 0
        assert result["errors"] == 0

        observations = (
            db.query(FinancialObservation)
            .filter(
                FinancialObservation.source_type
                == "test_csv_v2"
            )
            .order_by(
                FinancialObservation.period_label
            )
            .all()
        )

        assert len(observations) == 2

        assert all(
            observation.metric_name == "revenue"
            for observation in observations
        )

        change = (
            db.query(ChangeRecord)
            .filter(
                ChangeRecord.metric_or_topic
                == "revenue",
                ChangeRecord.previous_period
                == "Q1 FY26",
                ChangeRecord.current_period
                == "Q1 FY27",
            )
            .order_by(
                ChangeRecord.id.desc()
            )
            .first()
        )

        assert change is not None
        assert change.direction == "increase"
        assert float(change.change_value) == 25.0
        assert float(change.materiality_score) == 75.0
        assert change.materiality_band == "high"
        assert change.comparison_type == "YoY"

    finally:
        changes = (
            db.query(ChangeRecord)
            .filter(
                ChangeRecord.metric_or_topic
                == "revenue",
                ChangeRecord.previous_period
                == "Q1 FY26",
                ChangeRecord.current_period
                == "Q1 FY27",
            )
            .all()
        )

        for change in changes:
            db.delete(change)

        observations = (
            db.query(FinancialObservation)
            .filter(
                FinancialObservation.source_type
                == "test_csv_v2"
            )
            .all()
        )

        for observation in observations:
            db.delete(observation)

        db.commit()
        db.close()