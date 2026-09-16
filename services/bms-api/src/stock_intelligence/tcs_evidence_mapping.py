from __future__ import annotations

from dataclasses import dataclass


VALID_TCS_FACTORS = {
    "earnings",
    "economics",
    "execution",
    "balance_sheet",
    "management_delivery",
}


@dataclass(frozen=True)
class EvidenceFactorMapping:
    factor_name: str
    reason: str


EVIDENCE_TYPE_MAP = {
    # ---------------------------------------------------------
    # Earnings
    # ---------------------------------------------------------
    "revenue": "earnings",
    "sales": "earnings",
    "pat": "earnings",
    "profit": "earnings",
    "eps": "earnings",
    "earnings": "earnings",

    # ---------------------------------------------------------
    # Economics
    # ---------------------------------------------------------
    "ebitda": "economics",
    "ebitda_margin": "economics",
    "operating_income": "economics",
    "operating_margin": "economics",
    "financing_margin": "economics",
    "gross_margin": "economics",
    "roce": "economics",
    "roe": "economics",
    "roa": "economics",
    "unit_economics": "economics",
    "nim": "economics",

    # ---------------------------------------------------------
    # Execution / conversion
    # ---------------------------------------------------------
    "capacity": "execution",
    "capacity_utilization": "execution",
    "commissioning": "execution",
    "order_execution": "execution",
    "order_book": "execution",
    "order_inflow": "execution",
    "project_execution": "execution",
    "volume_growth": "execution",
    "sales_volume": "execution",
    "total_sales_volume": "execution",
    "production_volume": "execution",
    "export_volume": "execution",
    "market_share": "execution",
    "innovative_medicine_sales": "execution",

    # IT-services / TCS-style execution indicators
    "deal_tcv": "execution",
    "deal_wins": "execution",
    "large_deal_wins": "execution",
    "client_additions": "execution",
    "client_growth": "execution",
    "customer_franchise": "execution",
    "customer_franchise_growth": "execution",
    "new_loans_booked": "execution",
    "assets_under_management": "execution",
    "aum_growth": "execution",
    "utilization": "execution",
    "attrition": "execution",

    # ---------------------------------------------------------
    # Balance sheet / risk
    # ---------------------------------------------------------
    "debt": "balance_sheet",
    "total_debt": "balance_sheet",
    "working_capital": "balance_sheet",
    "inventory": "balance_sheet",
    "receivables": "balance_sheet",
    "operating_cash_flow": "balance_sheet",
    "cash_flow": "balance_sheet",
    "asset_quality": "balance_sheet",
    "gnpa": "balance_sheet",
    "nnpa": "balance_sheet",
    "credit_cost": "balance_sheet",
    "stage_3_assets": "balance_sheet",
    "capital_adequacy": "balance_sheet",
    "cash_conversion": "balance_sheet",
    "net_cash": "balance_sheet",
    "net_debt_to_equity_ratio": "balance_sheet",
    "net_cash_from_operating_activities": "balance_sheet",
    "provision_coverage": "balance_sheet",

    # ---------------------------------------------------------
    # Management delivery / credibility
    # ---------------------------------------------------------
    "guidance": "management_delivery",
    "guidance_change": "management_delivery",
    "management_guidance": "management_delivery",
    "management_delivery": "management_delivery",
    "management_credibility": "management_delivery",
}

# Sector-specific observations arrive from the evidence workflow with more
# descriptive names than the original narrow financial feed. These suffixes
# map them to the same frozen five factors without changing factor weights.
EXECUTION_PATTERNS = (
    "_vs_plan", "_vs_guidance", "_conversion", "_ramp", "_delivery",
    "_productivity_delivery", "_monetisation_delivery", "_mix_change",
    "market_share_change", "volume_growth", "capacity_utilisation",
    "project_completion_delay", "plant_availability_change",
)
BALANCE_SHEET_PATTERNS = (
    "debt_", "net_debt", "net_cash", "interest_coverage", "cash_conversion",
    "operating_cash_flow", "working_capital", "receivable", "inventory",
    "liquidity", "cet1", "crar", "gnpa", "nnpa", "provision_coverage",
    "credit_cost", "loan_deposit_ratio", "refinancing_risk",
    "contingent_liability", "capitalised_development_cost",
)
MANAGEMENT_DELIVERY_PATTERNS = (
    "guidance_accuracy", "commitment_delivery", "target_delivery",
    "capital_allocation_consistency", "acquisition_synergy_delivery",
    "acquisition_integration_delivery",
)


def map_evidence_to_tcs_factor(
    *,
    evidence_type: str,
) -> EvidenceFactorMapping | None:
    """
    Map one evidence type into one of the five TCS V1 factors.

    This is intentionally deterministic and explainable.

    Unknown evidence types return None rather than being forced
    into an arbitrary factor.
    """

    normalized = (
        evidence_type
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )

    factor_name = EVIDENCE_TYPE_MAP.get(normalized)

    if factor_name is None and any(
        pattern in normalized for pattern in MANAGEMENT_DELIVERY_PATTERNS
    ):
        factor_name = "management_delivery"
    if factor_name is None and any(
        pattern in normalized for pattern in BALANCE_SHEET_PATTERNS
    ):
        factor_name = "balance_sheet"
    if factor_name is None and any(
        pattern in normalized for pattern in EXECUTION_PATTERNS
    ):
        factor_name = "execution"

    if factor_name is None:
        return None

    return EvidenceFactorMapping(
        factor_name=factor_name,
        reason=(
            f"Evidence type '{normalized}' maps to "
            f"TCS factor '{factor_name}'"
        ),
    )
