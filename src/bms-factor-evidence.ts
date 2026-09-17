export type RepairFactorId = "earnings" | "economics" | "execution" | "balance_sheet";

const DIRECT: Record<string, RepairFactorId> = {
  revenue: "earnings", sales: "earnings", operating_revenue: "earnings", total_income: "earnings",
  pat: "earnings", profit: "earnings", net_profit: "earnings", profit_after_tax: "earnings",
  eps: "earnings", earnings: "earnings",
  ebitda: "economics", operating_income: "economics", operating_profit: "economics",
  operating_margin: "economics", ebitda_margin: "economics", gross_margin: "economics",
  net_interest_margin: "economics", nim: "economics", spread: "economics",
  realization: "economics", price_realization: "economics", unit_economics: "economics",
  capacity: "execution", capacity_utilization: "execution", commissioning: "execution",
  order_execution: "execution", order_book: "execution", order_inflow: "execution", project_execution: "execution",
  volume_growth: "execution", sales_volume: "execution", total_sales_volume: "execution",
  production_volume: "execution", export_volume: "execution", market_share: "execution",
  domestic_wholesales: "execution", wind_turbine_deliveries: "execution", project_commissioning: "execution",
  units_delivered: "execution", gross_merchandise_value: "execution", store_count: "execution", member_count: "execution",
  innovative_medicine_sales: "execution", deal_tcv: "execution", deal_wins: "execution",
  large_deal_wins: "execution", client_additions: "execution", client_growth: "execution",
  customer_franchise: "execution", customer_franchise_growth: "execution", new_loans_booked: "execution",
  assets_under_management: "execution", aum_growth: "execution", utilization: "execution", attrition: "execution",
  debt: "balance_sheet", total_debt: "balance_sheet", working_capital: "balance_sheet",
  inventory: "balance_sheet", receivables: "balance_sheet", operating_cash_flow: "balance_sheet",
  cash_flow: "balance_sheet", asset_quality: "balance_sheet", gnpa: "balance_sheet", nnpa: "balance_sheet",
  credit_cost: "balance_sheet", stage_3_assets: "balance_sheet", capital_adequacy: "balance_sheet",
  cash_conversion: "balance_sheet", net_cash: "balance_sheet", net_debt_to_equity_ratio: "balance_sheet",
  net_cash_from_operating_activities: "balance_sheet", cash_flow_from_operations: "balance_sheet",
  cash_and_bank_balances: "balance_sheet", provision_coverage: "balance_sheet", reserves: "balance_sheet",
  net_working_capital_cycle: "balance_sheet",
};

const EARNINGS_PATTERNS = ["revenue", "sales", "net_profit", "profit_after_tax", "pat", "eps", "earnings"];
const ECONOMICS_PATTERNS = ["ebitda", "operating_income", "operating_profit", "margin", "nim", "spread", "realization", "unit_economic", "pricing", "yield"];

const EXECUTION_PATTERNS = ["_vs_plan", "_vs_guidance", "_conversion", "_ramp", "_delivery", "_deliveries", "_delivered", "_commissioning", "_mix_change", "market_share_change", "volume_growth", "capacity_utilisation", "project_completion_delay", "plant_availability_change", "production", "throughput", "wholesale", "gross_merchandise_value", "store_count", "member_count", "ore_mined", "metal_in_concentrate"];
const BALANCE_PATTERNS = ["debt_", "net_debt", "net_cash", "interest_coverage", "cash_conversion", "cash_flow_from_operations", "cash_and_bank", "operating_cash_flow", "working_capital", "receivable", "inventory", "reserves", "liquidity", "cet1", "crar", "gnpa", "nnpa", "provision_coverage", "credit_cost", "loan_deposit_ratio", "refinancing_risk", "contingent_liability", "capitalised_development_cost"];

export function mapBmsFactorMetric(rawMetric: unknown): { metric: string; factor: RepairFactorId } | null {
  let metric = String(rawMetric || "").trim().toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliases: Array<[RegExp, string]> = [
    [/^gross_npa(?:_assets?)?$/, "gnpa"],
    [/^net_npa(?:_assets?)?$/, "nnpa"],
    [/gross_(?:non_?performing|npa)_assets?/, "gnpa"],
    [/net_(?:non_?performing|npa)_assets?/, "nnpa"],
    [/capital_adequacy(?:_ratio)?|\bcrar\b/, "capital_adequacy"],
    [/customer_franchise(?:_growth)?/, "customer_franchise"],
    [/provision(?:ing)?_coverage(?:_ratio)?/, "provision_coverage"],
    [/(?:number_of_)?new_loans_booked/, "new_loans_booked"],
    [/(?:consolidated_)?assets_under_management|\baum\b/, "assets_under_management"],
    [/(?:total_)?sales_volume/, "total_sales_volume"],
    [/(?:consolidated_)?gross_merchandise_value|\bgmv\b/, "gross_merchandise_value"],
    [/(?:number_of_)?stores?$/, "store_count"],
    [/(?:number_of_)?(?:gold_)?members?$/, "member_count"],
    [/cash_(?:flow_)?from_operations/, "cash_flow_from_operations"],
    [/cash_and_bank_balances?/, "cash_and_bank_balances"],
    [/net_working_capital_cycle/, "net_working_capital_cycle"],
    [/inventor(?:y|ies)/, "inventory"],
    [/order_inflow/, "order_inflow"],
    [/net_debt_to_equity(?:_ratio)?/, "net_debt_to_equity_ratio"],
    [/net_cash_from_operating_activities/, "net_cash_from_operating_activities"],
  ];
  for (const [pattern, canonical] of aliases) {
    if (pattern.test(metric)) { metric = canonical; break; }
  }
  const factor = DIRECT[metric]
    || (EARNINGS_PATTERNS.some(pattern => metric.includes(pattern)) ? "earnings" : null)
    || (ECONOMICS_PATTERNS.some(pattern => metric.includes(pattern)) ? "economics" : null)
    || (EXECUTION_PATTERNS.some(pattern => metric.includes(pattern)) ? "execution" : null)
    || (BALANCE_PATTERNS.some(pattern => metric.includes(pattern)) ? "balance_sheet" : null);
  return factor ? { metric, factor } : null;
}
