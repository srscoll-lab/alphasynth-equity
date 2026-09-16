import csv
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .records import CompanyRecord


@dataclass(frozen=True, slots=True)
class ParseIssue:
    """A row that could not be converted into a valid CompanyRecord."""

    row_number: int
    message: str
    raw_row: dict[str, str]


@dataclass(frozen=True, slots=True)
class ParseResult:
    """Result of parsing one NSE company-master CSV file."""

    records: list[CompanyRecord]
    issues: list[ParseIssue]


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _optional_text(value: str | None) -> str | None:
    cleaned = _clean(value)
    return cleaned or None


def _parse_date(value: str | None) -> date | None:
    cleaned = _clean(value)

    if not cleaned:
        return None

    supported_formats = (
        "%d-%b-%Y",
        "%d-%b-%y",
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d/%m/%Y",
    )

    for date_format in supported_formats:
        try:
            return datetime.strptime(cleaned, date_format).date()
        except ValueError:
            continue

    raise ValueError(f"Unsupported listing date: {cleaned!r}")


def _parse_integer(value: str | None) -> int | None:
    cleaned = _clean(value)

    if not cleaned:
        return None

    try:
        return int(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        raise ValueError(f"Invalid integer value: {cleaned!r}") from None


def _parse_decimal(value: str | None) -> Decimal | None:
    cleaned = _clean(value)

    if not cleaned:
        return None

    try:
        return Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"Invalid decimal value: {cleaned!r}") from None


def _normalise_column_name(column_name: str) -> str:
    """Convert NSE header variants into one canonical format."""

    return " ".join(
        column_name.strip().replace("_", " ").split()
    ).upper()


def _normalise_row(row: dict[str, str | None]) -> dict[str, str | None]:
    """Normalize NSE column headings across main-board and SME files."""

    return {
        _normalise_column_name(column_name): value
        for column_name, value in row.items()
        if column_name is not None and column_name.strip()
    }


def _record_from_row(row: dict[str, str | None]) -> CompanyRecord:
    symbol = _clean(row.get("SYMBOL"))
    legal_name = _clean(row.get("NAME OF COMPANY"))
    isin = _clean(row.get("ISIN NUMBER"))

    if not symbol:
        raise ValueError("Missing SYMBOL")

    if not legal_name:
        raise ValueError("Missing NAME OF COMPANY")

    if not isin:
        raise ValueError("Missing ISIN NUMBER")

    if len(isin) != 12:
        raise ValueError(f"ISIN must contain 12 characters: {isin!r}")

    return CompanyRecord(
        isin=isin.upper(),
        legal_name=legal_name,
        nse_symbol=symbol.upper(),
        series=_optional_text(row.get("SERIES")),
        listing_date=_parse_date(row.get("DATE OF LISTING")),
        market_lot=_parse_integer(row.get("MARKET LOT")),
        face_value=_parse_decimal(row.get("FACE VALUE")),
    )


def parse_nse_company_file(file_path: str | Path) -> ParseResult:
    """Parse an NSE equity-master CSV without writing to the database."""

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"NSE company-master file not found: {path}")

    records: list[CompanyRecord] = []
    issues: list[ParseIssue] = []

    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)

        if reader.fieldnames is None:
            raise ValueError(f"CSV file has no header row: {path}")

        for row_number, raw_row in enumerate(reader, start=2):
            row = _normalise_row(raw_row)

            try:
                records.append(_record_from_row(row))
            except ValueError as exc:
                issues.append(
                    ParseIssue(
                        row_number=row_number,
                        message=str(exc),
                        raw_row={
                            str(key): _clean(value)
                            for key, value in row.items()
                        },
                    )
                )

    return ParseResult(records=records, issues=issues)