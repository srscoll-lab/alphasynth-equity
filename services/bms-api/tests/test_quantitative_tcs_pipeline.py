from decimal import Decimal

from stock_intelligence.db import SessionLocal
from stock_intelligence.evidence_promotion import (
    promote_change_to_evidence,
)
from stock_intelligence.models import (
    ChangeRecord,
    FinancialObservation,
    ScoreSnapshot,
    TCSFactorSnapshot,
    Thesis,
    ThesisEvidence,
)
from stock_intelligence.financial_observation_service import (
    create_observation_with_change,
)
from stock_intelligence.tcs_from_evidence import (
    calculate_tcs_from_thesis_evidence,
)
from stock_intelligence.tcs_service import save_tcs_result


def test_quantitative_tcs_pipeline():
    db = SessionLocal()

    thesis_id = None
    snapshot_id = None

    try:
        thesis = Thesis(
            company_id=1,
            thesis_type="growth",
            title="Temporary quantitative TCS pipeline test",
            thesis_text="Temporary pipeline validation thesis",
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        first_observation, first_change = (
            create_observation_with_change(
                db=db,
                company_id=1,
                metric_name="revenue",
                metric_value=Decimal("500"),
                unit="INR crore",
                period_label="Q1 FY26",
                period_type="quarterly",
                period_end_date=None,
                comparison_type="YoY",
                category="financial",
                source_type="pipeline_test",
                confidence=0.99,
                magnitude_score=80,
                persistence_score=70,
                economic_importance_score=90,
                novelty_score=70,
            )
        )

        assert first_change is None

        second_observation, second_change = (
            create_observation_with_change(
                db=db,
                company_id=1,
                metric_name="revenue",
                metric_value=Decimal("625"),
                unit="INR crore",
                period_label="Q1 FY27",
                period_type="quarterly",
                period_end_date=None,
                comparison_type="YoY",
                category="financial",
                source_type="pipeline_test",
                confidence=0.99,
                magnitude_score=80,
                persistence_score=70,
                economic_importance_score=90,
                novelty_score=70,
            )
        )

        assert second_change is not None
        assert second_change.direction == "increase"

        assert float(second_change.css_score) == 69.8

        evidence = promote_change_to_evidence(
            db,
            thesis_id=thesis.id,
            change_record=second_change,
        )

        assert evidence is not None
        assert evidence.direction == "strengthens"
        assert evidence.evidence_type == "revenue"
        assert evidence.change_record_id == second_change.id

        result = calculate_tcs_from_thesis_evidence(
            db=db,
            thesis_id=thesis.id,
        )

        factor_map = {
            factor.name: factor.current_score
            for factor in result.factors
        }

        assert factor_map["earnings"] == 1.38
        assert factor_map["economics"] == 0.0
        assert factor_map["execution"] == 0.0
        assert factor_map["balance_sheet"] == 0.0
        assert factor_map["management_delivery"] == 0.0

        assert result.current_tcs == 0.345

        snapshot = save_tcs_result(
            db=db,
            company_id=1,
            result=result,
            state="test",
            thesis_summary="Quantitative TCS pipeline test",
        )

        snapshot_id = snapshot.id

        assert float(snapshot.tcs_score) == 0.34

        factor_rows = (
            db.query(TCSFactorSnapshot)
            .filter(
                TCSFactorSnapshot.score_snapshot_id
                == snapshot.id
            )
            .all()
        )

        assert len(factor_rows) == 5

    finally:
        if snapshot_id is not None:
            db.query(TCSFactorSnapshot).filter(
                TCSFactorSnapshot.score_snapshot_id
                == snapshot_id
            ).delete()

            db.query(ScoreSnapshot).filter(
                ScoreSnapshot.id == snapshot_id
            ).delete()

        if thesis_id is not None:
            db.query(ThesisEvidence).filter(
                ThesisEvidence.thesis_id == thesis_id
            ).delete()

            db.query(Thesis).filter(
                Thesis.id == thesis_id
            ).delete()

        db.query(ChangeRecord).filter(
            ChangeRecord.company_id == 1,
            ChangeRecord.metric_or_topic == "revenue",
            ChangeRecord.current_period == "Q1 FY27",
        ).delete()

        db.query(FinancialObservation).filter(
            FinancialObservation.company_id == 1,
            FinancialObservation.metric_name == "revenue",
            FinancialObservation.source_type == "pipeline_test",
        ).delete()

        db.commit()
        db.close()