from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDefinition:
    name: str
    category: str
    default_unit: str
    description: str


METRICS = {
    "revenue": MetricDefinition(
        name="revenue",
        category="financial",
        default_unit="INR crore",
        description=(
            "Revenue from operations or comparable "
            "operating revenue."
        ),
    ),

    "ebitda": MetricDefinition(
        name="ebitda",
        category="financial",
        default_unit="INR crore",
        description=(
            "Earnings before interest, tax, "
            "depreciation and amortisation."
        ),
    ),

    "ebitda_margin": MetricDefinition(
        name="ebitda_margin",
        category="financial",
        default_unit="percent",
        description=(
            "EBITDA as a percentage of revenue."
        ),
    ),

    "operating_income": MetricDefinition(
        name="operating_income",
        category="financial",
        default_unit="INR crore",
        description=(
            "Operating income or operating profit "
            "reported by the company."
        ),
    ),

    "operating_margin": MetricDefinition(
        name="operating_margin",
        category="financial",
        default_unit="percent",
        description=(
            "Operating income as a percentage "
            "of revenue."
        ),
    ),

    "financing_margin": MetricDefinition(
        name="financing_margin",
        category="financial",
        default_unit="percent",
        description=(
            "Financing profit or comparable lending "
            "margin as a percentage of revenue."
        ),
    ),

    "pat": MetricDefinition(
        name="pat",
        category="financial",
        default_unit="INR crore",
        description="Profit after tax.",
    ),

    "total_debt": MetricDefinition(
        name="total_debt",
        category="balance_sheet",
        default_unit="INR crore",
        description="Total interest-bearing debt.",
    ),

    "inventory": MetricDefinition(
        name="inventory",
        category="working_capital",
        default_unit="INR crore",
        description=(
            "Inventory reported on the balance sheet."
        ),
    ),

    "deal_tcv": MetricDefinition(
        name="deal_tcv",
        category="execution",
        default_unit="USD billion",
        description=(
            "Total contract value of deals won during "
            "the reporting period."
        ),
    ),

    "attrition": MetricDefinition(
        name="attrition",
        category="execution",
        default_unit="percent",
        description=(
            "Employee attrition rate reported by "
            "the company."
        ),
    ),

    "order_book": MetricDefinition(
    name="order_book",
    category="execution",
    default_unit="INR crore",
    description=(
        "Outstanding executable order book "
        "reported by the company."
        ),
    ),

    "receivables": MetricDefinition(
        name="receivables",
        category="working_capital",
        default_unit="INR crore",
        description="Trade receivables.",
    ),

    "operating_cash_flow": MetricDefinition(
        name="operating_cash_flow",
        category="cash_flow",
        default_unit="INR crore",
        description=(
            "Cash flow generated from operating activities."
        ),
    ),

    "cash_conversion": MetricDefinition(
        name="cash_conversion",
        category="balance_sheet",
        default_unit="percent",
        description=(
            "Operating cash flow as a percentage of "
            "net income."
        ),
    ),

    "gnpa": MetricDefinition(
        name="gnpa",
        category="balance_sheet",
        default_unit="percent",
        description=(
            "Gross non-performing asset ratio."
        ),
    ),

    "nim": MetricDefinition(
        name="nim",
        category="financial",
        default_unit="percent",
        description=(
            "Net interest margin reported by a bank."
        ),
    ),

    "volume_growth": MetricDefinition(
        name="volume_growth",
        category="execution",
        default_unit="units",
        description=(
            "Reported operating or sales volume used "
            "to measure period-over-period volume growth."
        ),
    ),

    "innovative_medicine_sales": MetricDefinition(
        name="innovative_medicine_sales",
        category="execution",
        default_unit="USD million",
        description=(
            "Sales from innovative or specialty medicines."
        ),
    ),

    "net_cash": MetricDefinition(
        name="net_cash",
        category="balance_sheet",
        default_unit="USD billion",
        description=(
            "Cash and liquid investments net of debt."
        ),
    ),
}


ALIASES = {
    "sales": "revenue",
    "net_sales": "revenue",
    "total_revenue": "revenue",
    "revenue_from_operations": "revenue",

    "operating_profit": "operating_income",
    "operating_income": "operating_income",

    "operating_profit_margin": "operating_margin",
    "operating_margin": "operating_margin",
    "opm": "operating_margin",

    "financing_margin": "financing_margin",
    "financing_margin_%": "financing_margin",

    "profit_after_tax": "pat",
    "net_profit": "pat",

    "debt": "total_debt",
    "borrowings": "total_debt",

    "trade_receivables": "receivables",

    "cash_flow_from_operations": "operating_cash_flow",
    "cfo": "operating_cash_flow",

    "net_interest_margin": "nim",
}


def normalize_metric_name(
    metric_name: str,
) -> str:
    normalized = (
        metric_name
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )

    canonical = ALIASES.get(
        normalized,
        normalized,
    )

    if canonical not in METRICS:
        raise ValueError(
            f"Unsupported financial metric: "
            f"{metric_name}"
        )

    return canonical


def get_metric_definition(
    metric_name: str,
) -> MetricDefinition:
    canonical = normalize_metric_name(
        metric_name
    )

    return METRICS[canonical]