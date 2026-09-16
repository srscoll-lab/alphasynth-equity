from decimal import Decimal

from stock_intelligence.db import SessionLocal
from stock_intelligence.models import Thesis, ThesisEvidence
from stock_intelligence.tcs_from_evidence import (
    calculate_tcs_from_thesis_evidence,
)


def test_calculate_tcs_from_thesis_evidence():
    db = SessionLocal()

    thesis_id = None

    try:
        thesis = Thesis(
            company_id=1,
            thesis_type="growth",
            title="Temporary TCS evidence test",
            thesis_text="Temporary automated test thesis",
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        evidence_rows = [
            ThesisEvidence(
                thesis_id=thesis.id,
                evidence_type="revenue",
                direction="strengthens",
                summary="Revenue growth accelerated",
                confidence=Decimal("0.90"),
            ),
            ThesisEvidence(
                thesis_id=thesis.id,
                evidence_type="ebitda_margin",
                direction="strengthens",
                summary="EBITDA margin improved",
                confidence=Decimal("0.90"),
            ),
            ThesisEvidence(
                thesis_id=thesis.id,
                evidence_type="capacity_utilization",
                direction="strengthens",
                summary="Capacity utilization increased",
                confidence=Decimal("0.85"),
            ),
            ThesisEvidence(
                thesis_id=thesis.id,
                evidence_type="working_capital",
                direction="weakens",
                summary="Working capital deteriorated",
                confidence=Decimal("0.80"),
            ),
            ThesisEvidence(
                thesis_id=thesis.id,
                evidence_type="management_delivery",
                direction="strengthens",
                summary="Management delivered prior guidance",
                confidence=Decimal("0.90"),
            ),
        ]

        db.add_all(evidence_rows)
        db.commit()

        result = calculate_tcs_from_thesis_evidence(
            db=db,
            thesis_id=thesis.id,
        )

        factor_map = {
            factor.name: factor.current_score
            for factor in result.factors
        }

        assert factor_map["earnings"] == 0.90
        assert factor_map["economics"] == 0.90
        assert factor_map["execution"] == 0.85
        assert factor_map["balance_sheet"] == -0.80
        assert factor_map["management_delivery"] == 0.90

        assert result.current_tcs == 0.6325
        assert result.previous_tcs is None
        assert result.delta_tcs is None

    finally:
        if thesis_id is not None:
            db.query(ThesisEvidence).filter(
                ThesisEvidence.thesis_id == thesis_id
            ).delete()

            db.query(Thesis).filter(
                Thesis.id == thesis_id
            ).delete()

            db.commit()

        db.close()