from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...models import Company
from .records import CompanyRecord


class CompanyConflictError(ValueError):
    """Raised when an NSE record conflicts with an existing company identity."""


class CompanyRepository:
    """Database operations for the canonical Company Master."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def _find_existing(self, record: CompanyRecord) -> Company | None:
        """Find an existing company, preferring the canonical ISIN."""

        company = self.session.scalar(
            select(Company).where(Company.isin == record.isin)
        )

        if company is not None:
            return company

        # Transitional fallback:
        # older records may have symbol populated but no ISIN yet.
        candidates = self.session.scalars(
            select(Company).where(
                or_(
                    Company.nse_symbol == record.nse_symbol,
                    Company.symbol == record.legacy_symbol,
                )
            )
        ).all()

        if not candidates:
            return None

        if len(candidates) > 1:
            raise CompanyConflictError(
                f"Multiple existing companies match NSE symbol "
                f"{record.nse_symbol!r}"
            )

        company = candidates[0]

        if company.isin is not None and company.isin != record.isin:
            raise CompanyConflictError(
                f"NSE symbol {record.nse_symbol!r} is already linked to "
                f"ISIN {company.isin!r}, not {record.isin!r}"
            )

        return company

    @staticmethod
    def _apply_record(company: Company, record: CompanyRecord) -> bool:
        """Apply changed NSE values and return whether anything changed."""

        values = {
            "isin": record.isin,
            "legal_name": record.legal_name,
            "nse_symbol": record.nse_symbol,
            "series": record.series,
            "listing_date": record.listing_date,
            "market_lot": record.market_lot,
            "face_value": record.face_value,
            "symbol": record.legacy_symbol,
            "exchange": record.exchange,
        }

        changed = False

        for field_name, new_value in values.items():
            if getattr(company, field_name) != new_value:
                setattr(company, field_name, new_value)
                changed = True

        return changed

    def upsert(self, record: CompanyRecord) -> str:
        """Insert or update one company and return the resulting action."""

        company = self._find_existing(record)

        if company is None:
            company = Company(
                isin=record.isin,
                legal_name=record.legal_name,
                nse_symbol=record.nse_symbol,
                series=record.series,
                listing_date=record.listing_date,
                market_lot=record.market_lot,
                face_value=record.face_value,
                symbol=record.legacy_symbol,
                exchange=record.exchange,
            )
            self.session.add(company)
            self.session.flush()
            return "inserted"

        changed = self._apply_record(company, record)

        if changed:
            self.session.flush()
            return "updated"

        return "unchanged"