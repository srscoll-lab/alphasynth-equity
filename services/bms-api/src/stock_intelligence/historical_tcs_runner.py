from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from .evidence_promotion import promote_change_to_evidence
from .models import ChangeRecord, Thesis, ThesisEvidence
from .tcs_from_evidence import calculate_tcs_from_thesis_evidence
from .tcs_state import classify_tcs_state


@dataclass(frozen=True)
class HistoricalTCSPoint:
    period: str
    tcs_score: float
    state: str
    evidence_count: int
    factors: dict[str, float]


def build_historical_tcs_trajectory(
    *,
    db: Session,
    company_id: int,
    periods: list[str],
    thesis_type: str = "fundamental",
    title: str = "Historical TCS validation",
    thesis_text: str = (
        "The company's fundamental business thesis "
        "strengthens when earnings, economics, execution, "
        "balance-sheet quality and management delivery improve."
    ),
) -> tuple[int, list[HistoricalTCSPoint]]:
    """
    Build a historical TCS trajectory one period at a time.

    For each period:
        1. Find ChangeRecords for that period.
        2. Promote qualifying changes into ThesisEvidence.
        3. Calculate TCS using all evidence available up to
           that point.
        4. Record the resulting score, state and factor scores.

    This is intended as a validation helper, not yet as the
    production daily-ranking workflow.
    """

    thesis = Thesis(
        company_id=company_id,
        thesis_type=thesis_type,
        title=title,
        thesis_text=thesis_text,
        status="active",
        model_version="historical-validation-v1",
    )

    db.add(thesis)
    db.commit()
    db.refresh(thesis)

    trajectory: list[HistoricalTCSPoint] = []

    for period in periods:
        change_records = (
            db.query(ChangeRecord)
            .filter(
                ChangeRecord.company_id == company_id,
                ChangeRecord.current_period == period,
            )
            .order_by(ChangeRecord.id.asc())
            .all()
        )

        for change_record in change_records:
            existing = (
                db.query(ThesisEvidence)
                .filter(
                    ThesisEvidence.thesis_id == thesis.id,
                    ThesisEvidence.change_record_id
                    == change_record.id,
                )
                .first()
            )

            if existing is not None:
                continue

            promote_change_to_evidence(
                db,
                thesis_id=thesis.id,
                change_record=change_record,
            )

        result = calculate_tcs_from_thesis_evidence(
            db=db,
            thesis_id=thesis.id,
        )

        factors = {
            factor.name: factor.current_score
            for factor in result.factors
        }

        evidence_count = (
            db.query(ThesisEvidence)
            .filter(
                ThesisEvidence.thesis_id == thesis.id
            )
            .count()
        )

        trajectory.append(
            HistoricalTCSPoint(
                period=period,
                tcs_score=result.current_tcs,
                state=classify_tcs_state(
                    tcs_score=result.current_tcs
                ),
                evidence_count=evidence_count,
                factors=factors,
            )
        )

    return thesis.id, trajectory