import assert from "node:assert/strict";
import { mapBmsFactorMetric } from "../src/bms-factor-evidence.ts";

assert.deepEqual(mapBmsFactorMetric("Assets Under Management (Consolidated)"), { metric: "assets_under_management", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Number of New Loans Booked (Q4)"), { metric: "new_loans_booked", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Gross Non-Performing Assets"), { metric: "gnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Net Non-Performing Assets"), { metric: "nnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Provisioning Coverage Ratio"), { metric: "provision_coverage", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Customer Franchise"), { metric: "customer_franchise", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Capital Adequacy Ratio (CRAR)"), { metric: "capital_adequacy", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Gross NPA"), { metric: "gnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Net NPA"), { metric: "nnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Metal in Concentrate (MIC) production"), { metric: "metal_in_concentrate_production", factor: "execution" });
assert.equal(mapBmsFactorMetric("Domestic wholesales")?.factor, "execution");
assert.equal(mapBmsFactorMetric("Wind Turbine Deliveries")?.factor, "execution");
assert.equal(mapBmsFactorMetric("Kavach Units Delivered (Chittaranjan Locomotive Works)")?.factor, "execution");
assert.deepEqual(mapBmsFactorMetric("Consolidated Gross Merchandise Value (GMV)"), { metric: "gross_merchandise_value", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Cash and Bank Balances"), { metric: "cash_and_bank_balances", factor: "balance_sheet" });
assert.equal(mapBmsFactorMetric("Inventories")?.factor, "balance_sheet");
assert.deepEqual(mapBmsFactorMetric("Cash Flow from Operations"), { metric: "cash_flow_from_operations", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Number of stores"), { metric: "store_count", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Revenue"), { metric: "revenue", factor: "earnings" });
assert.deepEqual(mapBmsFactorMetric("PAT"), { metric: "pat", factor: "earnings" });
assert.deepEqual(mapBmsFactorMetric("EBITDA"), { metric: "ebitda", factor: "economics" });
assert.deepEqual(mapBmsFactorMetric("Operating Margin"), { metric: "operating_margin", factor: "economics" });
assert.deepEqual(mapBmsFactorMetric("Transmission Availability"), { metric: "transmission_availability", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Distribution Reliability"), { metric: "distribution_reliability", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Gross Debt"), { metric: "gross_debt", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Cash Balance"), { metric: "cash_balance", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Net Debt to EBITDA Ratio"), { metric: "net_debt_to_ebitda_ratio", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Net Worth"), { metric: "net_worth", factor: "balance_sheet" });
for (const metric of [
  "Large Deal TCV", "New Deal Wins (Total Contract Value - TCV)",
  "Automotive Quarterly Volumes", "Coal Offtake",
  "Aluminium Upstream Shipments (India)",
  "Voluntary Attrition (Trailing Twelve Months)",
]) assert.equal(mapBmsFactorMetric(metric)?.factor, "execution", metric);
for (const metric of [
  "Total Equity", "Free Cash Flow", "Consolidated cash and investments",
  "Cash and Cash Equivalents (Consolidated)",
]) assert.equal(mapBmsFactorMetric(metric)?.factor, "balance_sheet", metric);
console.log("PASS: descriptive metrics canonicalize across all four BMS factors");
