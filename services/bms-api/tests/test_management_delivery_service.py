from stock_intelligence.db import SessionLocal
from stock_intelligence.management_delivery_service import (
    create_numeric_management_delivery,
)
from stock_intelligence.models import (
    ManagementDeliveryAssessment,
    ManagementGuidance,
    ManagementOutcome,
    Thesis,
    ThesisEvidence,
)


def test_numeric_management_delivery_chain():
    db = SessionLocal()

    thesis_id = None
    guidance_id = None
    outcome_id = None
    assessment_id = None
    evidence_id = None

    try:
        thesis = Thesis(
            company_id=2117,
            thesis_type="fundamental",
            title="Temporary management delivery test",
            thesis_text="Temporary test thesis",
            status="active",
            model_version="test",
        )

        db.add(thesis)
        db.commit()
        db.refresh(thesis)

        thesis_id = thesis.id

        (
            guidance,
            outcome,
            assessment,
            evidence,
        ) = create_numeric_management_delivery(
            db=db,
            company_id=2117,
            thesis_id=thesis.id,
            topic="operating_margin",
            guidance_text=(
                "Management targets operating margin "
                "of 25 percent."
            ),
            target_value=25.0,
            target_unit="percent",
            target_period="Q4 FY26",
            actual_value=25.3,
            outcome_period="Q4 FY26",
        )

        guidance_id = guidance.id
        outcome_id = outcome.id
        assessment_id = assessment.id
        evidence_id = evidence.id

        assert float(guidance.target_value) == 25.0
        assert guidance.status == "assessed"

        assert float(outcome.actual_value) == 25.3

        assert (
            assessment.delivery_status
            == "delivered"
        )
        assert assessment.direction == "strengthens"
        assert float(assessment.delivery_score) == 85.0

        assert (
            evidence.evidence_type
            == "management_delivery"
        )
        assert evidence.direction == "strengthens"

    finally:
        if evidence_id is not None:
            db.query(ThesisEvidence).filter(
                ThesisEvidence.id == evidence_id
            ).delete()

        if assessment_id is not None:
            db.query(
                ManagementDeliveryAssessment
            ).filter(
                ManagementDeliveryAssessment.id
                == assessment_id
            ).delete()

        if outcome_id is not None:
            db.query(ManagementOutcome).filter(
                ManagementOutcome.id == outcome_id
            ).delete()

        if guidance_id is not None:
            db.query(ManagementGuidance).filter(
                ManagementGuidance.id == guidance_id
            ).delete()

        if thesis_id is not None:
            db.query(Thesis).filter(
                Thesis.id == thesis_id
            ).delete()

        db.commit()
        db.close()