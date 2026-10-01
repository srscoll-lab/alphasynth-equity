import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

import { cleanFundamentalReviewSymbol } from "./fundamental-review-contract.ts";

const REQUIRED_FACTORS = new Set(["earnings", "economics", "execution", "balance_sheet"]);

type CanonicalReport = {
  candidates?: Record<string, any>[];
  documents?: Record<string, any>[];
  validations?: Record<string, any>[];
};

type EvidenceApproval = {
  approval_id?: string;
  approved_company_symbols?: string[];
  approved_factor_ids?: string[];
  approved_factor_slot_count?: number;
  approved_comparison_count?: number;
  approval_scope?: string;
  qualifications?: Record<string, any>[];
  approved_at?: string;
};

export type CanonicalEvidenceBundle = {
  approval: EvidenceApproval;
  candidates: Record<string, any>[];
  documents: Record<string, any>[];
  validations: Record<string, any>[];
};

function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export function loadCanonicalEvidenceBundle(options: {
  reportPaths: string[];
  approvalPath: string;
}): CanonicalEvidenceBundle {
  if (!options.reportPaths.length || !options.approvalPath) {
    throw new Error("Canonical evidence reports and approval record must be configured.");
  }

  const approval = readJson(options.approvalPath) as EvidenceApproval;
  const approvedSymbols = new Set((approval.approved_company_symbols ?? []).map(cleanFundamentalReviewSymbol));
  const approvedFactors = new Set((approval.approved_factor_ids ?? []).map((factor) => String(factor).trim().toLowerCase()));
  if (!approvedSymbols.size || approvedFactors.size !== REQUIRED_FACTORS.size
    || [...REQUIRED_FACTORS].some((factor) => !approvedFactors.has(factor))) {
    throw new Error("Evidence approval does not cover the controlled four-factor contract.");
  }

  const reports = options.reportPaths.map((path) => readJson(path) as CanonicalReport);
  const candidates = reports.flatMap((report) => Array.isArray(report.candidates) ? report.candidates : []);
  const documents = reports.flatMap((report) => Array.isArray(report.documents) ? report.documents : []);
  const validations = reports.flatMap((report) => Array.isArray(report.validations) ? report.validations : []);
  const approvedCandidates = candidates.filter((candidate) => approvedSymbols.has(cleanFundamentalReviewSymbol(candidate?.company_symbol)));
  const candidateIds = new Set(approvedCandidates.map((candidate) => String(candidate?.candidate_id || "")));
  const approvedValidations = validations.filter((validation) => candidateIds.has(String(validation?.candidate_id || "")));
  const documentIds = new Set(approvedCandidates.flatMap((candidate) => [
    String(candidate?.previous_document_id || ""),
    String(candidate?.current_document_id || ""),
  ]));
  const approvedDocuments = documents.filter((document) => documentIds.has(String(document?.document_id || "")));

  if (approvedCandidates.length !== approval.approved_comparison_count) {
    throw new Error(`Approved comparison count mismatch: expected ${approval.approved_comparison_count}, found ${approvedCandidates.length}.`);
  }
  if (approvedValidations.length !== approvedCandidates.length) {
    throw new Error("Every approved evidence candidate must have an independent validation record.");
  }
  const factorSlots = new Set(approvedCandidates.map((candidate) => `${candidate.company_symbol}:${candidate.factor_id}`));
  if (factorSlots.size !== approval.approved_factor_slot_count) {
    throw new Error(`Approved factor-slot count mismatch: expected ${approval.approved_factor_slot_count}, found ${factorSlots.size}.`);
  }

  return { approval, candidates: approvedCandidates, documents: approvedDocuments, validations: approvedValidations };
}

export function canonicalEvidenceForSymbol(bundle: CanonicalEvidenceBundle, rawSymbol: unknown) {
  const symbol = cleanFundamentalReviewSymbol(rawSymbol);
  const approvedSymbols = new Set((bundle.approval.approved_company_symbols ?? []).map(cleanFundamentalReviewSymbol));
  if (!symbol || !approvedSymbols.has(symbol)) {
    return {
      schema_version: "2.0.0",
      symbol,
      candidates: [],
      documents: [],
      validations: [],
      diagnostics: [{
        outcome: "no_approved_canonical_evidence",
        detail: "This company is outside the currently approved canonical evidence gate. No FCS can be estimated.",
      }],
    };
  }

  const candidates = bundle.candidates.filter((candidate) => cleanFundamentalReviewSymbol(candidate?.company_symbol) === symbol);
  const candidateIds = new Set(candidates.map((candidate) => String(candidate.candidate_id)));
  const validations = bundle.validations.filter((validation) => candidateIds.has(String(validation?.candidate_id || "")));
  const documentIds = new Set(candidates.flatMap((candidate) => [candidate.previous_document_id, candidate.current_document_id]));
  const documents = bundle.documents.filter((document) => documentIds.has(document?.document_id));
  const qualifiedByCandidate = new Map(validations.map((validation) => [validation.candidate_id, validation.status]));
  const qualifiedFactors = new Set(candidates
    .filter((candidate) => ["qualified", "qualified_provisional"].includes(String(qualifiedByCandidate.get(candidate.candidate_id))))
    .map((candidate) => candidate.factor_id));

  return {
    schema_version: "2.0.0",
    symbol,
    approval: {
      approval_id: bundle.approval.approval_id,
      approval_scope: bundle.approval.approval_scope,
      approved_at: bundle.approval.approved_at,
      qualifications: (bundle.approval.qualifications ?? []).filter((item) => item.company_symbol === symbol),
    },
    candidates,
    documents,
    validations,
    diagnostics: [{
      outcome: qualifiedFactors.size === REQUIRED_FACTORS.size ? "approved_four_factor_evidence_ready" : "approved_evidence_incomplete",
      factor_count: qualifiedFactors.size,
      comparison_count: candidates.length,
    }],
  };
}

export function createCanonicalEvidenceProviderFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const defaultReportPath = resolve(process.cwd(), "data", "fundamental-review-approved-five-company-v2.json");
  const defaultApprovalPath = resolve(process.cwd(), "data", "fundamental-review-approved-five-company-v2-approval.json");
  const rawPaths = String(environment.FUNDAMENTAL_REVIEW_EVIDENCE_REPORT_PATHS || defaultReportPath).trim();
  const approvalPath = String(environment.FUNDAMENTAL_REVIEW_EVIDENCE_APPROVAL_PATH || defaultApprovalPath).trim();
  if (!rawPaths || !approvalPath || !existsSync(approvalPath)) return null;
  const reportPaths = rawPaths.split(delimiter).map((path) => path.trim()).filter(Boolean);
  if (!reportPaths.length || reportPaths.some((path) => !existsSync(path))) return null;
  const bundle = loadCanonicalEvidenceBundle({ reportPaths, approvalPath });
  return (symbol: unknown) => canonicalEvidenceForSymbol(bundle, symbol);
}
