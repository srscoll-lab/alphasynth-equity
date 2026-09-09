import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessExpectationDelivery, type DeliveryMetric, type ExpectationDeliveryInput, type QualityGateObservation } from "../src/expectation-delivery.ts";

type PilotManifest = {
  pilotId: string;
  lifecycleFreezeDate: string;
  expectationFreezeDate: string;
  assessmentMode: "prospective" | "reconstructed_today";
  companies: Array<{ symbol: string; companyName: string; lifecycle: string; period: string }>;
};

const manifest = JSON.parse(readFileSync(resolve("scripts/expectation-delivery-pilot-companies.json"), "utf8")) as PilotManifest;

const gate = (id: string, label: string, severity: "hard" | "soft"): QualityGateObservation => ({
  id, label, severity, result: "unknown", explanation: null, evidenceRefs: [],
});

const metric = (id: string, label: string, unit: string, tolerance: number, weight: number): DeliveryMetric => ({
  id, label, expected: null, actual: null, unit, tolerance, higherIsBetter: true, weight,
  expectationSource: "internal_baseline", evidenceRefs: [],
});

const inputs: ExpectationDeliveryInput[] = manifest.companies.map(company => ({
  symbol: company.symbol,
  companyName: company.companyName,
  lifecycle: company.lifecycle,
  lifecycleFreezeDate: manifest.lifecycleFreezeDate,
  assessmentMode: manifest.assessmentMode,
  expectationFreezeDate: manifest.expectationFreezeDate,
  outcomeDate: null,
  sectorValuationPercentile: null,
  qualityGates: [
    gate("cash_conversion", "Cash conversion", "hard"),
    gate("leverage_coverage", "Leverage and coverage", "hard"),
    gate("promoter_pledge", "Promoter pledge", "hard"),
    gate("auditor_integrity", "Auditor integrity", "hard"),
    gate("material_governance", "Material governance", "hard"),
    gate("working_capital", "Working-capital discipline", "soft"),
    gate("concentration", "Customer or product concentration", "soft"),
    gate("incremental_roce", "Incremental return on capital", "soft"),
    gate("acquisition_dependence", "Acquisition dependence", "soft"),
    gate("management_delivery_history", "Management delivery history", "soft"),
  ],
  deliveryMetrics: [
    metric("revenue_growth", "Revenue growth", "%", 3, 30),
    metric("operating_margin", "Operating margin", "%", 2, 30),
    metric("cash_conversion", "Operating cash conversion", "%", 10, 20),
    metric("management_target_delivery", "Management target delivery", "%", 10, 20),
  ],
  evidence: [],
}));

const result = {
  pilotId: manifest.pilotId,
  policy: "Evidence-empty fields remain unknown; zero is never substituted for missing history.",
  companies: inputs.map(input => ({ input, assessment: assessExpectationDelivery(input) })),
};

const outArg = process.argv.find(arg => arg.startsWith("--out="));
if (outArg) writeFileSync(resolve(outArg.slice(6)), `${JSON.stringify(result, null, 2)}\n`);
else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
