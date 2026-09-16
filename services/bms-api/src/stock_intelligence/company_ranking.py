from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Company, ScoreSnapshot


@dataclass(frozen=True)
class CompanyRankResult:
    rank: int
    company_id: int
    legal_name: str | None
    nse_symbol: str | None
    tcs_score: float
    state: str | None
    score_snapshot_id: int


def rank_companies_by_latest_tcs(
    *,
    db: Session,
    limit: int | None = None,
) -> list[CompanyRankResult]:
    """
    Rank companies using their latest available TCS snapshot.

    V1 ranking rule:
        Highest TCS = highest rank.

    Only the most recent ScoreSnapshot for each company
    is considered.
    """

    latest_snapshot_ids = (
        select(
            func.max(ScoreSnapshot.id).label(
                "latest_snapshot_id"
            )
        )
        .where(
            ScoreSnapshot.tcs_score.is_not(None)
        )
        .group_by(
            ScoreSnapshot.company_id
        )
    )

    query = (
        select(
            ScoreSnapshot,
            Company,
        )
        .join(
            Company,
            Company.id == ScoreSnapshot.company_id,
        )
        .where(
            ScoreSnapshot.id.in_(
                latest_snapshot_ids
            )
        )
        .order_by(
            ScoreSnapshot.tcs_score.desc(),
            Company.nse_symbol.asc(),
        )
    )

    if limit is not None:
        if limit < 1:
            raise ValueError(
                "limit must be at least 1"
            )

        query = query.limit(limit)

    rows = db.execute(query).all()

    results: list[CompanyRankResult] = []

    for rank, row in enumerate(
        rows,
        start=1,
    ):
        snapshot, company = row

        results.append(
            CompanyRankResult(
                rank=rank,
                company_id=company.id,
                legal_name=company.legal_name,
                nse_symbol=company.nse_symbol,
                tcs_score=float(
                    snapshot.tcs_score
                ),
                state=snapshot.state,
                score_snapshot_id=snapshot.id,
            )
        )

    return results