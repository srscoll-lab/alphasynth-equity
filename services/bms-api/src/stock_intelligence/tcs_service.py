from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .models import ScoreSnapshot, TCSFactorSnapshot
from .tcs import TCSResult
from .tcs_state import classify_tcs_state


def save_tcs_result(
    *,
    db: Session,
    company_id: int,
    result: TCSResult,
    state: str | None = None,
    thesis_summary: str | None = None,
    evidence_json: str | None = None,
) -> ScoreSnapshot:
    """
    Persist one TCS calculation.

    Saves:
        1. One company-level ScoreSnapshot
        2. Five factor-level TCSFactorSnapshot rows

    If state is not supplied explicitly, it is calculated
    automatically from the current TCS score.
    """

    resolved_state = (
        state
        if state is not None
        else classify_tcs_state(
            tcs_score=result.current_tcs
        )
    )

    score_snapshot = ScoreSnapshot(
        company_id=company_id,
        tcs_score=Decimal(str(result.current_tcs)),
        state=resolved_state,
        thesis_summary=thesis_summary,
        evidence_json=evidence_json,
        model_version=result.model_version,
    )

    db.add(score_snapshot)
    db.flush()

    for factor in result.factors:
        factor_snapshot = TCSFactorSnapshot(
            score_snapshot_id=score_snapshot.id,
            factor_name=factor.name,
            weight=Decimal(str(factor.weight)),
            current_score=Decimal(
                str(factor.current_score)
            ),
            previous_score=(
                Decimal(str(factor.previous_score))
                if factor.previous_score is not None
                else None
            ),
            delta_score=(
                Decimal(str(factor.delta))
                if factor.delta is not None
                else None
            ),
            model_version=result.model_version,
        )

        db.add(factor_snapshot)

    db.commit()
    db.refresh(score_snapshot)

    return score_snapshot