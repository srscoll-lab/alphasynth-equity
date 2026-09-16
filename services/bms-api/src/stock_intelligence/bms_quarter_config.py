"""
Central quarter configuration for the Business Momentum Score (BMS)
quarterly refresh workflow.

This module is operational configuration only.

It does NOT define:
- BMS scoring
- TCS scoring
- factor weights
- lifecycle thresholds
- evidence scoring

Quarter definitions are kept here so that quarterly refresh scripts do
not maintain separate hard-coded period/date/financial-column mappings.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class BMSQuarter:
    label: str
    period_end_date: str
    financial_column: str


BMS_QUARTERS: tuple[BMSQuarter, ...] = (
    BMSQuarter(
        label="Q1 FY26",
        period_end_date="2025-06-30",
        financial_column="Jun 2025",
    ),
    BMSQuarter(
        label="Q2 FY26",
        period_end_date="2025-09-30",
        financial_column="Sep 2025",
    ),
    BMSQuarter(
        label="Q3 FY26",
        period_end_date="2025-12-31",
        financial_column="Dec 2025",
    ),
)


def quarter_labels() -> list[str]:
    """Return configured BMS quarters in chronological order."""
    return [quarter.label for quarter in BMS_QUARTERS]


def get_quarter(label: str) -> BMSQuarter:
    """Return the configuration for one quarter."""
    normalized = label.strip().upper()

    for quarter in BMS_QUARTERS:
        if quarter.label.upper() == normalized:
            return quarter

    available = ", ".join(quarter_labels())
    raise ValueError(
        f"Unknown BMS quarter: {label}. "
        f"Configured quarters: {available}"
    )


def period_end_dates() -> dict[str, str]:
    """Return period-label to period-end-date mapping."""
    return {
        quarter.label: quarter.period_end_date
        for quarter in BMS_QUARTERS
    }


def financial_columns() -> dict[str, str]:
    """Return period-label to financial-source-column mapping."""
    return {
        quarter.label: quarter.financial_column
        for quarter in BMS_QUARTERS
    }
