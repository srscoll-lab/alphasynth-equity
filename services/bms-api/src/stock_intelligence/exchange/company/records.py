from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class CompanyRecord:
    """Normalized company record parsed from an exchange master file."""

    isin: str
    legal_name: str
    nse_symbol: str
    series: str | None
    listing_date: date | None
    market_lot: int | None
    face_value: Decimal | None
    exchange: str = "NSE"

    @property
    def legacy_symbol(self) -> str:
        """Temporary mapping required by the existing Company model."""
        return self.nse_symbol