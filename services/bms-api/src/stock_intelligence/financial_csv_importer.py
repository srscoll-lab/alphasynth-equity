from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .confidence_scoring import (
    calculate_observation_confidence,
)
from .financial_metrics import get_metric_definition
from .financial_observation_service import (
    create_observation_with_change,
)
from .models import Company


REQUIRED_COLUMNS = {
    "symbol",
    "metric_name",
    "metric_value",
    "period_label",
    "period_type",
    "comparison_type",
    "period_end_date",
}


def _parse_optional_date(value: str):
    value = value.strip()

    if not value:
        return None

    return datetime.strptime(
        value,
        "%Y-%m-%d",
    ).date()


def _parse_optional_float(value: str):
    value = value.strip()

    if not value:
        return None

    return float(value)


def import_financial_csv(
    db: Session,
    csv_path: str | Path,
) -> dict[str, int]:
    """
    Import financial observations from a CSV file.

    Required columns:
        symbol
        metric_name
        metric_value
        period_label
        period_type
        comparison_type
        period_end_date

    Optional columns:
        unit
        source_type
        confidence

    Legacy optional override columns:
        magnitude_score
        persistence_score
        economic_importance_score
        novelty_score

    If confidence is omitted, it is calculated
    automatically from source_type.

    If the four scoring overrides are omitted,
    the intelligence engine calculates them automatically.
    """

    csv_path = Path(csv_path)

    inserted = 0
    changes_created = 0
    skipped = 0
    errors = 0

    with csv_path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        if reader.fieldnames is None:
            raise ValueError(
                "CSV file has no header row"
            )

        missing = (
            REQUIRED_COLUMNS
            - set(reader.fieldnames)
        )

        if missing:
            raise ValueError(
                "Missing required CSV columns: "
                f"{sorted(missing)}"
            )

        for row_number, row in enumerate(
            reader,
            start=2,
        ):
            try:
                symbol = (
                    row["symbol"]
                    .strip()
                    .upper()
                )

                company = (
                    db.query(Company)
                    .filter(
                        or_(
                            Company.nse_symbol == symbol,
                            Company.symbol == symbol,
                        )
                    )
                    .first()
                )

                if company is None:
                    print(
                        f"Row {row_number}: "
                        f"company not found for "
                        f"symbol {symbol}"
                    )

                    skipped += 1
                    continue

                metric_definition = (
                    get_metric_definition(
                        row["metric_name"]
                    )
                )

                period_end_date = (
                    _parse_optional_date(
                        row.get(
                            "period_end_date",
                            "",
                        )
                    )
                )

                if period_end_date is None:
                    raise ValueError(
                        "period_end_date is required"
                    )

                source_type = (
                    row.get("source_type")
                    or "csv_import"
                )

                supplied_confidence = (
                    _parse_optional_float(
                        row.get(
                            "confidence",
                            "",
                        )
                    )
                )

                if supplied_confidence is None:
                    confidence = (
                        calculate_observation_confidence(
                            source_type=source_type,
                            direct_fact=True,
                            independently_verified=False,
                            interpretation_required=False,
                        ).confidence
                    )
                else:
                    confidence = supplied_confidence

                magnitude_score = (
                    _parse_optional_float(
                        row.get(
                            "magnitude_score",
                            "",
                        )
                    )
                )

                persistence_score = (
                    _parse_optional_float(
                        row.get(
                            "persistence_score",
                            "",
                        )
                    )
                )

                economic_importance_score = (
                    _parse_optional_float(
                        row.get(
                            "economic_importance_score",
                            "",
                        )
                    )
                )

                novelty_score = (
                    _parse_optional_float(
                        row.get(
                            "novelty_score",
                            "",
                        )
                    )
                )

                observation, change_record = (
                    create_observation_with_change(
                        db,
                        company_id=company.id,
                        metric_name=row[
                            "metric_name"
                        ],
                        metric_value=float(
                            row["metric_value"]
                        ),
                        period_label=row[
                            "period_label"
                        ],
                        period_type=row[
                            "period_type"
                        ],
                        period_end_date=(
                            period_end_date
                        ),
                        category=(
                            metric_definition.category
                        ),
                        comparison_type=row[
                            "comparison_type"
                        ],
                        unit=(
                            row.get("unit")
                            or metric_definition.default_unit
                        ),
                        source_type=source_type,
                        confidence=confidence,

                        magnitude_score=(
                            magnitude_score
                        ),
                        persistence_score=(
                            persistence_score
                        ),
                        economic_importance_score=(
                            economic_importance_score
                        ),
                        novelty_score=(
                            novelty_score
                        ),
                    )
                )

                inserted += 1

                if change_record is not None:
                    changes_created += 1

            except Exception as exc:
                print(
                    f"Row {row_number}: "
                    f"ERROR: {exc}"
                )

                db.rollback()
                errors += 1

    return {
        "inserted": inserted,
        "changes_created": changes_created,
        "skipped": skipped,
        "errors": errors,
    }