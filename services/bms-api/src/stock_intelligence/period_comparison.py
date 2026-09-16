from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class PeriodInfo:
    period_type: str
    fiscal_year: int
    quarter: int | None = None


def parse_period_label(
    period_label: str,
    period_type: str,
) -> PeriodInfo:
    """
    Parse labels such as:
    Q1 FY27
    Q4 FY26
    FY27
    """

    normalized_type = period_type.strip().lower()
    label = period_label.strip().upper()

    if normalized_type == "quarterly":
        match = re.fullmatch(
            r"Q([1-4])\s+FY(\d{2})",
            label,
        )

        if not match:
            raise ValueError(
                f"Invalid quarterly period label: {period_label}"
            )

        quarter = int(match.group(1))
        fiscal_year = 2000 + int(match.group(2))

        return PeriodInfo(
            period_type="quarterly",
            fiscal_year=fiscal_year,
            quarter=quarter,
        )

    if normalized_type == "annual":
        match = re.fullmatch(
            r"FY(\d{2})",
            label,
        )

        if not match:
            raise ValueError(
                f"Invalid annual period label: {period_label}"
            )

        fiscal_year = 2000 + int(match.group(1))

        return PeriodInfo(
            period_type="annual",
            fiscal_year=fiscal_year,
            quarter=None,
        )

    raise ValueError(
        f"Unsupported period type: {period_type}"
    )


def expected_previous_period(
    period_label: str,
    period_type: str,
    comparison_type: str,
) -> str:
    """
    Return the expected comparison period.

    Examples:
    Q1 FY27 + YoY -> Q1 FY26
    Q1 FY27 + QoQ -> Q4 FY26
    FY27 + YoY -> FY26
    """

    info = parse_period_label(
        period_label=period_label,
        period_type=period_type,
    )

    comparison = comparison_type.strip().lower()

    if info.period_type == "annual":
        if comparison != "yoy":
            raise ValueError(
                "Annual observations currently support only YoY comparison"
            )

        return f"FY{str(info.fiscal_year - 1)[-2:]}"

    if info.period_type == "quarterly":
        if comparison == "yoy":
            return (
                f"Q{info.quarter} "
                f"FY{str(info.fiscal_year - 1)[-2:]}"
            )

        if comparison == "qoq":
            if info.quarter == 1:
                return (
                    f"Q4 "
                    f"FY{str(info.fiscal_year - 1)[-2:]}"
                )

            return (
                f"Q{info.quarter - 1} "
                f"FY{str(info.fiscal_year)[-2:]}"
            )

    raise ValueError(
        f"Unsupported comparison type: {comparison_type}"
    )