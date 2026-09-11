export const MANAGEMENT_GUIDANCE_DELIVERY_SCHEMA_VERSION = "1.0.0" as const;

export type CommentaryChange =
  | "raised"
  | "maintained"
  | "lowered"
  | "postponed"
  | "withdrawn"
  | "contradicted"
  | "new"
  | "unclear";

export type CommitmentDelivery =
  | "delivered"
  | "partial"
  | "missed"
  | "pending"
  | "unverifiable";

export type ManagementDeliveryBand =
  | "strong_delivery"
  | "generally_consistent"
  | "mixed_delivery"
  | "weak_delivery"
  | "insufficient_history";

export type EvidenceConfidence = "insufficient" | "low" | "medium" | "high";

export type ManagementEvidenceRef = {
  sourceId: string;
  url?: string | null;
  publishedAt?: string | null;
  page?: number | null;
};

/**
 * One published occurrence of a commitment. Repeated or restated guidance must
 * retain the same commitmentKey so it remains one economic promise.
 */
export type ManagementCommitmentStatement = {
  statementId: string;
  commitmentKey: string;
  statement: string;
  statedAt: string;
  targetDate: string | null;
  metric: string | null;
  /** 0..1 observations used for the disclosure-quality component. */
  specificity: number | null;
  measurability: number | null;
  deadlineClarity: number | null;
  evidenceRefs: string[];
};

/**
 * A dated comparison of current commentary with the preceding statement.
 * Direction is descriptive and is never itself converted into score points.
 */
export type ManagementCommentaryObservation = {
  observationId: string;
  commitmentKey: string;
  observedAt: string;
  change: CommentaryChange;
  previousStatementId: string | null;
  currentStatementId: string;
  /** 0..1 evidence assessments; null means the dimension is unknown. */
  revisionTimeliness: number | null;
  explanationQuality: number | null;
  internalConsistency: number | null;
  evidenceRefs: string[];
};

export type ManagementDeliveryObservation = {
  observationId: string;
  commitmentKey: string;
  assessedAt: string;
  status: CommitmentDelivery;
  materialityWeight?: number;
  explanation: string | null;
  evidenceRefs: string[];
};

export type ManagementGuidanceDeliveryInput = {
  symbol: string;
  asOfDate: string;
  statements: ManagementCommitmentStatement[];
  commentary: ManagementCommentaryObservation[];
  delivery: ManagementDeliveryObservation[];
};

export type ManagementGuidanceDeliveryAssessment = {
  schemaVersion: typeof MANAGEMENT_GUIDANCE_DELIVERY_SCHEMA_VERSION;
  symbol: string;
  asOfDate: string;
  score: number | null;
  band: ManagementDeliveryBand;
  evidenceConfidence: EvidenceConfidence;
  components: {
    maturedDelivery: { score: number | null; weight: 70; scorable: number; unverifiable: number };
    revisionDiscipline: { score: number | null; weight: 20; observations: number };
    disclosureQuality: { score: number | null; weight: 10; commitments: number };
  };
  commitmentCounts: {
    statementOccurrences: number;
    uniqueCommitments: number;
    duplicateStatementsCollapsed: number;
    matured: number;
    pending: number;
  };
  currentCommentary: Array<{
    commitmentKey: string;
    observedAt: string;
    change: CommentaryChange;
    evidenceRefs: string[];
  }>;
  deliveryRecord: Array<{
    commitmentKey: string;
    targetDate: string | null;
    status: CommitmentDelivery;
    assessedAt: string | null;
    evidenceRefs: string[];
  }>;
  reasons: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMENTARY_CHANGES = new Set<CommentaryChange>(["raised", "maintained", "lowered", "postponed", "withdrawn", "contradicted", "new", "unclear"]);
const DELIVERY_STATUSES = new Set<CommitmentDelivery>(["delivered", "partial", "missed", "pending", "unverifiable"]);
const SCOREABLE_DELIVERY = new Set<CommitmentDelivery>(["delivered", "partial", "missed"]);
const DELIVERY_POINTS: Record<"delivered" | "partial" | "missed", number> = {
  delivered: 100,
  partial: 50,
  missed: 0,
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const latestFirst = <T extends { observedAt?: string; assessedAt?: string; statedAt?: string }>(left: T, right: T) => {
  const leftDate = left.observedAt ?? left.assessedAt ?? left.statedAt ?? "";
  const rightDate = right.observedAt ?? right.assessedAt ?? right.statedAt ?? "";
  return rightDate.localeCompare(leftDate);
};

function latestByCommitment<T extends { commitmentKey: string; observedAt?: string; assessedAt?: string; statedAt?: string }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of [...rows].sort(latestFirst)) {
    if (!result.has(row.commitmentKey)) result.set(row.commitmentKey, row);
  }
  return result;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function boundedDimensions(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0 && value <= 1);
}

export function managementGuidanceDeliveryInputErrors(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Input must be an object."];
  const input = value as Partial<ManagementGuidanceDeliveryInput>;
  const errors: string[] = [];
  if (typeof input.symbol !== "string" || !/^[A-Z0-9&.-]{1,24}$/.test(input.symbol.trim().toUpperCase())) errors.push("A valid symbol is required.");
  if (typeof input.asOfDate !== "string" || !ISO_DATE.test(input.asOfDate)) errors.push("asOfDate must be YYYY-MM-DD.");
  if (!Array.isArray(input.statements)) errors.push("statements must be an array.");
  if (!Array.isArray(input.commentary)) errors.push("commentary must be an array.");
  if (!Array.isArray(input.delivery)) errors.push("delivery must be an array.");

  input.statements?.forEach((row, index) => {
    if (!row.statementId?.trim()) errors.push(`statements[${index}].statementId is required.`);
    if (!row.commitmentKey?.trim()) errors.push(`statements[${index}].commitmentKey is required.`);
    if (!ISO_DATE.test(row.statedAt)) errors.push(`statements[${index}].statedAt must be YYYY-MM-DD.`);
    if (row.targetDate !== null && !ISO_DATE.test(row.targetDate)) errors.push(`statements[${index}].targetDate must be null or YYYY-MM-DD.`);
    if (!Array.isArray(row.evidenceRefs)) errors.push(`statements[${index}].evidenceRefs must be an array.`);
    if (row.targetDate !== null && !ISO_DATE.test(row.targetDate)) errors.push(`statements[${index}].targetDate must be null or YYYY-MM-DD.`);
    for (const [name, score] of [["specificity", row.specificity], ["measurability", row.measurability], ["deadlineClarity", row.deadlineClarity]] as const) {
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) errors.push(`statements[${index}].${name} must be null or between 0 and 1.`);
    }
  });
  input.commentary?.forEach((row, index) => {
    if (!row.commitmentKey?.trim()) errors.push(`commentary[${index}].commitmentKey is required.`);
    if (!ISO_DATE.test(row.observedAt)) errors.push(`commentary[${index}].observedAt must be YYYY-MM-DD.`);
    for (const [name, score] of [["revisionTimeliness", row.revisionTimeliness], ["explanationQuality", row.explanationQuality], ["internalConsistency", row.internalConsistency]] as const) {
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) errors.push(`commentary[${index}].${name} must be null or between 0 and 1.`);
    }
  });
  input.commentary?.forEach((row, index) => {
    if (!row.observationId?.trim()) errors.push(`commentary[${index}].observationId is required.`);
    if (!row.commitmentKey?.trim()) errors.push(`commentary[${index}].commitmentKey is required.`);
    if (!ISO_DATE.test(row.observedAt)) errors.push(`commentary[${index}].observedAt must be YYYY-MM-DD.`);
    if (!COMMENTARY_CHANGES.has(row.change)) errors.push(`commentary[${index}].change is invalid.`);
    if (!Array.isArray(row.evidenceRefs)) errors.push(`commentary[${index}].evidenceRefs must be an array.`);
    for (const [name, score] of [["revisionTimeliness", row.revisionTimeliness], ["explanationQuality", row.explanationQuality], ["internalConsistency", row.internalConsistency]] as const) {
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) errors.push(`commentary[${index}].${name} must be null or between 0 and 1.`);
    }
  });
  input.delivery?.forEach((row, index) => {
    if (!row.observationId?.trim()) errors.push(`delivery[${index}].observationId is required.`);
    if (!row.commitmentKey?.trim()) errors.push(`delivery[${index}].commitmentKey is required.`);
    if (!ISO_DATE.test(row.assessedAt)) errors.push(`delivery[${index}].assessedAt must be YYYY-MM-DD.`);
    if (!DELIVERY_STATUSES.has(row.status)) errors.push(`delivery[${index}].status is invalid.`);
    if (!Array.isArray(row.evidenceRefs)) errors.push(`delivery[${index}].evidenceRefs must be an array.`);
    if (row.materialityWeight !== undefined && (!Number.isFinite(row.materialityWeight) || row.materialityWeight <= 0)) errors.push(`delivery[${index}].materialityWeight must be positive.`);
  });
  return errors;
}

function bandFor(score: number | null): ManagementDeliveryBand {
  if (score === null) return "insufficient_history";
  if (score >= 80) return "strong_delivery";
  if (score >= 65) return "generally_consistent";
  if (score >= 40) return "mixed_delivery";
  return "weak_delivery";
}

export function assessManagementGuidanceDelivery(input: ManagementGuidanceDeliveryInput): ManagementGuidanceDeliveryAssessment {
  const errors = managementGuidanceDeliveryInputErrors(input);
  if (errors.length) throw new Error(`Invalid management guidance and delivery input: ${errors.join(" ")}`);

  const asOfStatements = input.statements.filter(row => row.statedAt <= input.asOfDate);
  const asOfCommentary = input.commentary.filter(row => row.observedAt <= input.asOfDate);
  const asOfDelivery = input.delivery.filter(row => row.assessedAt <= input.asOfDate);
  const latestStatements = latestByCommitment(asOfStatements);
  const latestCommentary = latestByCommitment(asOfCommentary);
  const latestDelivery = latestByCommitment(asOfDelivery);

  const pendingKeys = new Set([...latestStatements.values()]
    .filter(row => row.targetDate === null || row.targetDate > input.asOfDate)
    .map(row => row.commitmentKey));
  const maturedKeys = new Set([...latestStatements.values()]
    .filter(row => row.targetDate !== null && row.targetDate <= input.asOfDate)
    .map(row => row.commitmentKey));

  const deliveryRows = [...maturedKeys].map(key => latestDelivery.get(key)).filter((row): row is ManagementDeliveryObservation => Boolean(row));
  const scorableDelivery = deliveryRows.filter((row): row is ManagementDeliveryObservation & { status: "delivered" | "partial" | "missed" } => SCOREABLE_DELIVERY.has(row.status));
  const deliveryWeight = scorableDelivery.reduce((sum, row) => sum + (row.materialityWeight ?? 1), 0);
  const maturedDeliveryScore = deliveryWeight
    ? scorableDelivery.reduce((sum, row) => sum + DELIVERY_POINTS[row.status] * (row.materialityWeight ?? 1), 0) / deliveryWeight
    : null;

  // Each commitment contributes at most one (its latest) commentary observation.
  const revisionRows = [...latestCommentary.values()];
  const revisionScores = revisionRows.flatMap(row => {
    const dimensions = boundedDimensions([row.revisionTimeliness, row.explanationQuality, row.internalConsistency]);
    const score = mean(dimensions);
    return score === null ? [] : [score * 100];
  });
  const revisionDisciplineScore = mean(revisionScores);

  // Restatements do not increase disclosure weight: only the current effective
  // statement for each stable commitment key contributes.
  const disclosureScores = [...latestStatements.values()].flatMap(row => {
    const dimensions = boundedDimensions([row.specificity, row.measurability, row.deadlineClarity]);
    const score = mean(dimensions);
    return score === null ? [] : [score * 100];
  });
  const disclosureQualityScore = mean(disclosureScores);

  const reasons: string[] = [];
  if (scorableDelivery.length < 3) reasons.push(`At least 3 matured, verifiable commitments are required; ${scorableDelivery.length} available.`);
  if (revisionDisciplineScore === null) reasons.push("Revision-discipline evidence is unavailable.");
  if (disclosureQualityScore === null) reasons.push("Disclosure-quality evidence is unavailable.");
  const canScore = scorableDelivery.length >= 3 && maturedDeliveryScore !== null && revisionDisciplineScore !== null && disclosureQualityScore !== null;
  const score = canScore ? round1(maturedDeliveryScore * 0.7 + revisionDisciplineScore * 0.2 + disclosureQualityScore * 0.1) : null;

  const evidencedScorable = scorableDelivery.filter(row => row.evidenceRefs.length > 0).length;
  const sourceCoverage = scorableDelivery.length ? evidencedScorable / scorableDelivery.length : 0;
  let evidenceConfidence: EvidenceConfidence = "insufficient";
  if (canScore) {
    evidenceConfidence = scorableDelivery.length >= 8 && sourceCoverage >= 0.9 && revisionRows.length >= 5
      ? "high"
      : scorableDelivery.length >= 5 && sourceCoverage >= 0.75 && revisionRows.length >= 3
        ? "medium"
        : "low";
  }

  return {
    schemaVersion: MANAGEMENT_GUIDANCE_DELIVERY_SCHEMA_VERSION,
    symbol: input.symbol,
    asOfDate: input.asOfDate,
    score,
    band: bandFor(score),
    evidenceConfidence,
    components: {
      maturedDelivery: {
        score: maturedDeliveryScore === null ? null : round1(maturedDeliveryScore),
        weight: 70,
        scorable: scorableDelivery.length,
        unverifiable: deliveryRows.filter(row => row.status === "unverifiable").length,
      },
      revisionDiscipline: { score: revisionDisciplineScore === null ? null : round1(revisionDisciplineScore), weight: 20, observations: revisionScores.length },
      disclosureQuality: { score: disclosureQualityScore === null ? null : round1(disclosureQualityScore), weight: 10, commitments: disclosureScores.length },
    },
    commitmentCounts: {
      statementOccurrences: asOfStatements.length,
      uniqueCommitments: latestStatements.size,
      duplicateStatementsCollapsed: asOfStatements.length - latestStatements.size,
      matured: maturedKeys.size,
      pending: pendingKeys.size,
    },
    currentCommentary: [...latestCommentary.values()].map(row => ({
      commitmentKey: row.commitmentKey,
      observedAt: row.observedAt,
      change: row.change,
      evidenceRefs: row.evidenceRefs,
    })),
    deliveryRecord: [...latestStatements.values()].map(statement => {
      const observation = statement.targetDate !== null && statement.targetDate <= input.asOfDate
        ? latestDelivery.get(statement.commitmentKey)
        : undefined;
      return {
        commitmentKey: statement.commitmentKey,
        targetDate: statement.targetDate,
        status: statement.targetDate === null || statement.targetDate > input.asOfDate
          ? "pending"
          : observation?.status === "pending"
            ? "unverifiable"
            : observation?.status ?? "unverifiable",
        assessedAt: observation?.assessedAt ?? null,
        evidenceRefs: observation?.evidenceRefs ?? [],
      };
    }),
    reasons,
  };
}

export const MANAGEMENT_GUIDANCE_DELIVERY_RULES = {
  separation: "Commentary direction is descriptive context; only matured delivery, revision discipline, and disclosure quality contribute to the factor score.",
  deduplication: "Every economic promise has one stable commitmentKey. Repeated or restated statements never create additional scoring weight.",
  maturity: "Pending commitments are not scored. Matured but unsupported commitments remain unverifiable rather than becoming misses.",
  weighting: "The factor is 70 percent matured delivery, 20 percent revision discipline, and 10 percent disclosure quality.",
  history: "A factor score requires at least three matured, verifiable commitments plus revision-discipline and disclosure-quality evidence.",
} as const;
