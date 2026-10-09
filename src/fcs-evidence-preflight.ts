import expandedRadarData from "./data/bmsMomentumRadarExpanded.json" with { type: "json" };
import { fundamentalChangeLibrary } from "./data/fundamentalChangeLibrary.ts";
import preflightEvidenceApprovals from "./data/fcsPreflightEvidenceApprovals.json" with { type: "json" };

export const FCS_PREFLIGHT_SCHEMA_VERSION = "1.0.0";

export type FcsEvidencePreflightStatus =
  | "report_ready"
  | "high_probability"
  | "partial"
  | "unavailable";

export type FcsEvidencePreflightRecord = {
  symbol: string;
  companyName: string;
  capSegment: string;
  status: FcsEvidencePreflightStatus;
  requestEnabled: boolean;
  action: "view_report" | "request_fcs" | "deep_dive_only";
  reasonCodes: string[];
  reason: string;
  evidenceCheckedAt: string;
  evidenceCutoff: string;
  evidence: {
    publishedFourFactorReport: boolean;
    approvedFourFactorEvidence: boolean;
    currentComparableDocumentsVerified: boolean;
  };
};

export type FcsEvidencePreflightSnapshot = {
  schemaVersion: string;
  generatedAt: string;
  evidenceCutoff: string;
  policy: {
    baselineUsesModelCalls: false;
    requestEnablementRule: string;
    largeCapRule: string;
  };
  priorityBatch: {
    selection: "all_large_cap_companies";
    targetCount: number;
    records: FcsEvidencePreflightRecord[];
  };
  summary: {
    total: number;
    byStatus: Record<FcsEvidencePreflightStatus, number>;
    byCapSegment: Record<string, Record<FcsEvidencePreflightStatus, number>>;
  };
};

export type FcsPreflightEvidenceApproval = {
  symbol: string;
  checkedAt: string;
  evidenceCutoff: string;
  currentDocument: { url: string; publishedAt: string; readable: boolean; official: boolean };
  comparableDocument: { url: string; publishedAt: string; readable: boolean; official: boolean };
  factorFamilies: string[];
};

const radarCompanies = expandedRadarData.companies;
const reportBySymbol = new Map(fundamentalChangeLibrary.map((record) => [record.symbol, record] as const));
const approvalBySymbol = new Map((preflightEvidenceApprovals.records as FcsPreflightEvidenceApproval[])
  .map((record) => [record.symbol, record] as const));
const REQUIRED_FACTOR_FAMILIES = new Set(["earnings", "economics", "execution", "balance_sheet"]);

export function approvedHighProbabilityEvidence(approval: FcsPreflightEvidenceApproval | null | undefined): boolean {
  if (!approval || !/^\d{4}-\d{2}-\d{2}$/.test(approval.evidenceCutoff) || !/^\d{4}-\d{2}-\d{2}/.test(approval.checkedAt)) return false;
  const documents = [approval.currentDocument, approval.comparableDocument];
  if (documents.some((document) => !document?.readable || !document?.official || !/^https:\/\//.test(document.url)
    || !/^\d{4}-\d{2}-\d{2}$/.test(document.publishedAt) || document.publishedAt > approval.evidenceCutoff)) return false;
  const factors = new Set(approval.factorFamilies);
  return factors.size === REQUIRED_FACTOR_FAMILIES.size && [...REQUIRED_FACTOR_FAMILIES].every((factor) => factors.has(factor));
}

function unavailableRecord(symbol: string): FcsEvidencePreflightRecord {
  const company = radarCompanies.find((item) => item.symbol === symbol);
  return {
    symbol,
    companyName: company?.company_name || symbol,
    capSegment: company?.market_cap_segment.label || "Unclassified",
    status: "unavailable",
    requestEnabled: false,
    action: "deep_dive_only",
    reasonCodes: ["outside_verified_preflight_batch"],
    reason: "No deterministic evidence preflight has been completed for this company. Deep Dive remains available.",
    evidenceCheckedAt: expandedRadarData.generated_at,
    evidenceCutoff: expandedRadarData.market_data.as_of_date,
    evidence: {
      publishedFourFactorReport: false,
      approvedFourFactorEvidence: false,
      currentComparableDocumentsVerified: false,
    },
  };
}

/**
 * A company is never enabled because it is large-cap alone. The baseline is
 * deliberately conservative and free of model/provider calls:
 * - a published four-factor report is ready to view;
 * - a future high_probability record requires separately persisted proof of
 *   approved four-factor evidence and current/comparable verified documents;
 * - membership in the priority batch without that proof stays partial.
 */
export function deterministicFcsPreflight(symbol: string): FcsEvidencePreflightRecord {
  const clean = String(symbol || "").trim().toUpperCase();
  const company = radarCompanies.find((item) => item.symbol === clean);
  if (!company) return unavailableRecord(clean);
  const report = reportBySymbol.get(clean);
  if (report) {
    return {
      symbol: clean,
      companyName: company.company_name,
      capSegment: company.market_cap_segment.label,
      status: "report_ready",
      requestEnabled: false,
      action: "view_report",
      reasonCodes: ["published_four_factor_report"],
      reason: "A four-factor FCS report is already published. Open the existing report; no new paid review is required.",
      evidenceCheckedAt: report.fcsAsOf,
      evidenceCutoff: report.fcsAsOf,
      evidence: {
        publishedFourFactorReport: true,
        approvedFourFactorEvidence: true,
        currentComparableDocumentsVerified: true,
      },
    };
  }
  const approval = approvalBySymbol.get(clean);
  if (approvedHighProbabilityEvidence(approval)) {
    return {
      symbol: clean,
      companyName: company.company_name,
      capSegment: company.market_cap_segment.label,
      status: "high_probability",
      requestEnabled: true,
      action: "request_fcs",
      reasonCodes: ["verified_official_quarter_pair", "four_factor_families_detected"],
      reason: "Official current and comparable documents are readable and all four factor families were detected. FCS generation remains subject to the publication gate.",
      evidenceCheckedAt: approval!.checkedAt,
      evidenceCutoff: approval!.evidenceCutoff,
      evidence: {
        publishedFourFactorReport: false,
        approvedFourFactorEvidence: true,
        currentComparableDocumentsVerified: true,
      },
    };
  }
  if (company.market_cap_segment.label === "Large cap") {
    return {
      symbol: clean,
      companyName: company.company_name,
      capSegment: company.market_cap_segment.label,
      status: "partial",
      requestEnabled: false,
      action: "deep_dive_only",
      reasonCodes: ["priority_large_cap", "four_factor_evidence_not_verified"],
      reason: "Selected for large-cap preflight, but current and comparable documents have not yet passed the four-factor evidence check.",
      evidenceCheckedAt: expandedRadarData.generated_at,
      evidenceCutoff: expandedRadarData.market_data.as_of_date,
      evidence: {
        publishedFourFactorReport: false,
        approvedFourFactorEvidence: false,
        currentComparableDocumentsVerified: false,
      },
    };
  }
  return unavailableRecord(clean);
}

function blankStatusCounts(): Record<FcsEvidencePreflightStatus, number> {
  return { report_ready: 0, high_probability: 0, partial: 0, unavailable: 0 };
}

export function buildFcsEvidencePreflightSnapshot(): FcsEvidencePreflightSnapshot {
  const records = radarCompanies
    .filter((company) => company.market_cap_segment.label === "Large cap")
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
    .map((company) => deterministicFcsPreflight(company.symbol));
  const byStatus = blankStatusCounts();
  const byCapSegment: Record<string, Record<FcsEvidencePreflightStatus, number>> = {};
  for (const record of records) {
    byStatus[record.status] += 1;
    byCapSegment[record.capSegment] ||= blankStatusCounts();
    byCapSegment[record.capSegment][record.status] += 1;
  }
  return {
    schemaVersion: FCS_PREFLIGHT_SCHEMA_VERSION,
    generatedAt: expandedRadarData.generated_at,
    evidenceCutoff: expandedRadarData.market_data.as_of_date,
    policy: {
      baselineUsesModelCalls: false,
      requestEnablementRule: "Enable a new FCS request only after all four factor families and current/comparable official documents pass deterministic preflight.",
      largeCapRule: "Large-cap membership determines priority, never evidence eligibility.",
    },
    priorityBatch: {
      selection: "all_large_cap_companies",
      targetCount: records.length,
      records,
    },
    summary: { total: records.length, byStatus, byCapSegment },
  };
}

export function fcsEvidencePreflightForSymbol(symbol: string): FcsEvidencePreflightRecord {
  return deterministicFcsPreflight(symbol);
}
