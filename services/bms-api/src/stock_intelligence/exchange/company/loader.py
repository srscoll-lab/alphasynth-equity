from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter

from sqlalchemy.exc import SQLAlchemyError

from ...db import SessionLocal
from .parser import ParseIssue, parse_nse_company_file
from .repository import CompanyRepository


@dataclass(frozen=True, slots=True)
class LoadError:
    """A database error encountered while loading one company."""

    source_file: str
    isin: str
    nse_symbol: str
    message: str


@dataclass(slots=True)
class LoadSummary:
    """Summary of an NSE Company Master synchronization."""

    files_processed: int = 0
    rows_parsed: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    parse_issues: list[ParseIssue] = field(default_factory=list)
    load_errors: list[LoadError] = field(default_factory=list)
    elapsed_seconds: float = 0.0

    @property
    def errors(self) -> int:
        return len(self.parse_issues) + len(self.load_errors)


def load_nse_company_files(
    file_paths: list[str | Path],
) -> LoadSummary:
    """Parse and synchronize one or more NSE company-master files."""

    summary = LoadSummary()
    started_at = perf_counter()

    with SessionLocal() as session:
        repository = CompanyRepository(session)

        for file_path in file_paths:
            path = Path(file_path)
            parse_result = parse_nse_company_file(path)

            summary.files_processed += 1
            summary.rows_parsed += len(parse_result.records)
            summary.parse_issues.extend(parse_result.issues)

            for record in parse_result.records:
                try:
                    # A savepoint keeps one bad row from cancelling
                    # all successfully processed rows.
                    with session.begin_nested():
                        action = repository.upsert(record)

                    if action == "inserted":
                        summary.inserted += 1
                    elif action == "updated":
                        summary.updated += 1
                    else:
                        summary.unchanged += 1

                except (SQLAlchemyError, ValueError) as exc:
                    summary.load_errors.append(
                        LoadError(
                            source_file=str(path),
                            isin=record.isin,
                            nse_symbol=record.nse_symbol,
                            message=str(exc),
                        )
                    )

        session.commit()

    summary.elapsed_seconds = perf_counter() - started_at
    return summary