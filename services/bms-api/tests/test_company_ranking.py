from decimal import Decimal

from stock_intelligence.company_ranking import (
    rank_companies_by_latest_tcs,
)
from stock_intelligence.db import SessionLocal
from stock_intelligence.models import ScoreSnapshot


def test_rank_companies_by_latest_tcs():
    db = SessionLocal()

    created_ids: list[int] = []

    try:
        rows = [
            ScoreSnapshot(
                company_id=1,
                tcs_score=Decimal("0.40"),
                state="improving",
                model_version="test",
            ),
            ScoreSnapshot(
                company_id=1,
                tcs_score=Decimal("1.10"),
                state="strongly_strengthening",
                model_version="test",
            ),
            ScoreSnapshot(
                company_id=2,
                tcs_score=Decimal("0.70"),
                state="improving",
                model_version="test",
            ),
            ScoreSnapshot(
                company_id=3,
                tcs_score=Decimal("-0.20"),
                state="mixed",
                model_version="test",
            ),
        ]

        db.add_all(rows)
        db.commit()

        for row in rows:
            db.refresh(row)
            created_ids.append(row.id)

        result = rank_companies_by_latest_tcs(
            db=db,
        )

        test_rows = [
            item
            for item in result
            if item.company_id in {1, 2, 3}
        ]

        assert len(test_rows) == 3

        assert test_rows[0].company_id == 1
        assert test_rows[0].tcs_score == 1.10

        assert test_rows[1].company_id == 2
        assert test_rows[1].tcs_score == 0.70

        assert test_rows[2].company_id == 3
        assert test_rows[2].tcs_score == -0.20

    finally:
        if created_ids:
            (
                db.query(ScoreSnapshot)
                .filter(
                    ScoreSnapshot.id.in_(
                        created_ids
                    )
                )
                .delete(
                    synchronize_session=False
                )
            )

            db.commit()

        db.close()