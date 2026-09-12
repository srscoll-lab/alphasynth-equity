import type { DossierPdfPayload } from "./dossier-pdf";

export type DossierReadinessCheck = {
  ready: boolean;
  code: "DOSSIER_READY" | "DOSSIER_EVIDENCE_INCOMPLETE";
  reasons: string[];
  coverage: {
    officialSources: number;
    supportedClaims: number;
    populatedNarrativeSections: number;
    completeBmsFactors: number;
    observedQualityGates: number;
    deliveryComponents: number;
    quarterlyRows: number;
    pricePoints: number;
  };
};

const NARRATIVE_SECTIONS = [
  "developments",
  "operatingEvidence",
  "managementCommitments",
  "risks",
] as const;

/**
 * Prevents a visually complete PDF from being generated from a materially
 * incomplete research payload. Optional enrichment such as promoters and
 * public commentary deliberately does not determine readiness.
 */
export function assessDossierReadiness(payload: DossierPdfPayload): DossierReadinessCheck {
  const dossier = payload.dossier;
  const claims = Object.values(dossier.sections).flat();
  const supportedClaims = claims.filter((claim) => claim.status === "supported").length;
  const officialSources = new Set(dossier.sources
    .filter((source) => ["exchange", "company_official", "regulator"].includes(source.sourceClass))
    .map((source) => source.url)).size;
  const populatedNarrativeSections = NARRATIVE_SECTIONS.filter((section) =>
    dossier.sections[section].some((claim) => claim.status === "supported")).length;
  const risksPopulated = dossier.sections.risks.some((claim) => claim.status === "supported");
  const quarterlyRows = (payload.financials?.length
    ? payload.financials
    : dossier.quarterlyPerformance || []).filter((row) =>
    [row.revenueCr, row.ebitdaCr, row.ebitdaMarginPct, row.patCr, row.eps]
      .some((value) => value !== null && value !== undefined)).length;
  const pricePoints = payload.market?.priceHistory?.filter((point) =>
    point.date && Number.isFinite(point.close)).length || 0;
  const completeBmsFactors = payload.bms?.factorAnalysis?.factors.filter((factor) =>
    factor.availability === "complete"
      && factor.previous.metrics.length > 0
      && factor.current.metrics.length > 0).length || 0;
  const observedQualityGates = payload.deliveryCheck?.input.qualityGates.filter((gate) =>
    gate.result === "pass" || gate.result === "fail").length || 0;
  const deliveryComponents = payload.deliveryCheck?.assessment.deliveryComponents.length || 0;

  const reasons: string[] = [];
  if (officialSources < 2) reasons.push(`Only ${officialSources} distinct official source${officialSources === 1 ? " was" : "s were"} verified; at least 2 are required.`);
  if (supportedClaims < 8) reasons.push(`Only ${supportedClaims} company facts were verified; at least 8 are required.`);
  if (populatedNarrativeSections < 3) reasons.push(`Only ${populatedNarrativeSections} of 4 report sections contain verified information; at least 3 are required.`);
  if (!risksPopulated) reasons.push("No verified company-specific risk or watch item was found.");
  if (completeBmsFactors < 3) reasons.push(`Only ${completeBmsFactors} of 5 BMS factors have comparable previous and current figures; at least 3 are required.`);
  if (observedQualityGates < 3) reasons.push(`Only ${observedQualityGates} business-quality checks have supporting evidence; at least 3 are required. Checks that are not due this quarter do not count as completed.`);
  if (deliveryComponents < 2 || (payload.deliveryCheck?.assessment.deliveryCoverage || 0) < 60) {
    reasons.push("The later-results comparison needs at least 2 comparable measures covering 60% of the delivery assessment.");
  }
  if (quarterlyRows < 2) reasons.push("At least 2 usable quarterly financial rows are required.");
  if (pricePoints < 2) reasons.push("At least 2 dated price observations are required.");

  return {
    ready: reasons.length === 0,
    code: reasons.length === 0 ? "DOSSIER_READY" : "DOSSIER_EVIDENCE_INCOMPLETE",
    reasons,
    coverage: {
      officialSources,
      supportedClaims,
      populatedNarrativeSections,
      completeBmsFactors,
      observedQualityGates,
      deliveryComponents,
      quarterlyRows,
      pricePoints,
    },
  };
}
