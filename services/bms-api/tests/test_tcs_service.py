from stock_intelligence.db import SessionLocal
from stock_intelligence.models import ScoreSnapshot, TCSFactorSnapshot
from stock_intelligence.tcs import calculate_tcs
from stock_intelligence.tcs_service import save_tcs_result


def test_save_tcs_result():
    db = SessionLocal()

    snapshot_id = None

    try:
        result = calculate_tcs(
            earnings=2,
            economics=1,
            execution=0,
            balance_sheet=0,
            management_delivery=1,
            previous_earnings=1,
            previous_economics=1,
            previous_execution=2,
            previous_balance_sheet=1,
            previous_management_delivery=1,
        )

        snapshot = save_tcs_result(
            db=db,
            company_id=1,
            result=result,
            state="test",
            thesis_summary="Temporary TCS persistence test",
        )

        snapshot_id = snapshot.id

        assert float(snapshot.tcs_score) == 0.85
        assert snapshot.model_version == "tcs-v1.0"

        factors = (
            db.query(TCSFactorSnapshot)
            .filter(
                TCSFactorSnapshot.score_snapshot_id
                == snapshot.id
            )
            .all()
        )

        assert len(factors) == 5

        factor_map = {
            factor.factor_name: factor
            for factor in factors
        }

        assert float(
            factor_map["earnings"].delta_score
        ) == 1.0

        assert float(
            factor_map["economics"].delta_score
        ) == 0.0

        assert float(
            factor_map["execution"].delta_score
        ) == -2.0

        assert float(
            factor_map["balance_sheet"].delta_score
        ) == -1.0

        assert float(
            factor_map["management_delivery"].delta_score
        ) == 0.0

    finally:
        if snapshot_id is not None:
            db.query(TCSFactorSnapshot).filter(
                TCSFactorSnapshot.score_snapshot_id
                == snapshot_id
            ).delete()

            db.query(ScoreSnapshot).filter(
                ScoreSnapshot.id == snapshot_id
            ).delete()

            db.commit()

        db.close()