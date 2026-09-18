from __future__ import annotations

from dataclasses import dataclass
import re


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
    "net_profit": "earnings",
    "profit_after_tax": "earnings",
    "eps": "earnings",
    "earnings": "earnings",

    # ---------------------------------------------------------
    # Economics
    # ---------------------------------------------------------
    "ebitda": "economics",
    "ebitda_margin": "economics",
    "operating_income": "economics",
    "operating_profit": "economics",
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
    "domestic_wholesales": "execution",
    "wind_turbine_deliveries": "execution",
    "project_commissioning": "execution",
    "units_delivered": "execution",
    "gross_merchandise_value": "execution",
    "store_count": "execution",
    "member_count": "execution",
    "transmission_availability": "execution",
    "distribution_reliability": "execution",
    "export_volume": "execution",
    "market_share": "execution",
    "innovative_medicine_sales": "execution",

    # IT-services / TCS-style execution indicators
    "deal_tcv": "execution",
    "deal_wins": "execution",
    "large_deal_wins": "execution",
    "large_deal_tcv": "execution",
    "new_deal_wins_total_contract_value_tcv": "execution",
    "automotive_quarterly_volumes": "execution",
    "coal_offtake": "execution",
    "aluminium_upstream_shipments_india": "execution",
    "voluntary_attrition_trailing_twelve_months": "execution",
    "client_additions": "execution",
    "client_growth": "execution",
    "customer_franchise": "execution",
    "customer_franchise_growth": "execution",
    "new_loans_booked": "execution",
    "assets_under_management": "execution",
    "aum_growth": "execution",
    "utilization": "execution",
    "attrition": "execution",
    "store_count": "execution",
    "store_additions": "execution",

    # ---------------------------------------------------------
    # Balance sheet / risk
    # ---------------------------------------------------------
    "debt": "balance_sheet",
    "total_debt": "balance_sheet",
    "gross_debt": "balance_sheet",
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
    "cash_balance": "balance_sheet",
    "debt_equity_ratio": "balance_sheet",
    "current_ratio": "balance_sheet",
    "net_debt_to_ebitda_ratio": "balance_sheet",
    "net_debt_to_equity_ratio": "balance_sheet",
    "net_cash_from_operating_activities": "balance_sheet",
    "cash_flow_from_operations": "balance_sheet",
    "cash_and_bank_balances": "balance_sheet",
    "net_working_capital_cycle": "balance_sheet",
    "reserves": "balance_sheet",
    "net_worth": "balance_sheet",
    "provision_coverage": "balance_sheet",
    "total_equity": "balance_sheet",
    "free_cash_flow": "balance_sheet",
    "consolidated_cash_and_investments": "balance_sheet",
    "cash_and_cash_equivalents_consolidated": "balance_sheet",

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
# map them to the four scored release factors. Management Delivery mappings are
# retained only for the separate experimental guidance overlay.
EXECUTION_PATTERNS = (
    "_vs_plan", "_vs_guidance", "_conversion", "_ramp", "_delivery",
    "_productivity_delivery", "_monetisation_delivery", "_mix_change",
    "market_share_change", "volume_growth", "capacity_utilisation",
    "project_completion_delay", "plant_availability_change",
    "production", "throughput", "wholesale", "_delivery", "_deliveries",
    "_delivered", "_commissioning", "gross_merchandise_value",
    "store_count", "member_count", "ore_mined", "metal_in_concentrate",
    "deal_tcv", "deal_wins", "attrition", "_volume", "_volumes",
    "offtake", "shipment",
)
BALANCE_SHEET_PATTERNS = (
    "debt_", "net_debt", "net_cash", "interest_coverage", "cash_conversion",
    "operating_cash_flow", "cash_flow_from_operations", "cash_and_bank",
    "working_capital", "receivable", "inventory", "reserves",
    "liquidity", "cet1", "crar", "gnpa", "nnpa", "provision_coverage",
    "credit_cost", "loan_deposit_ratio", "refinancing_risk",
    "contingent_liability", "capitalised_development_cost",
    "free_cash_flow", "cash_and_cash_equivalent", "cash_and_investment",
    "total_equity",
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
    Map one evidence type into a scored BMS V1.1 factor or the separate
    experimental Management Delivery overlay.

    This is intentionally deterministic and explainable.

    Unknown evidence types return None rather than being forced
    into an arbitrary factor.
    """

    normalized = re.sub(
        r"[^a-z0-9]+", "_", evidence_type.strip().lower()
    ).strip("_")

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
