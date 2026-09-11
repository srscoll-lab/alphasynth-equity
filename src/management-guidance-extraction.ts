import type { ResearchDossier } from "./dossier.ts";
import type {
  CommentaryChange,
  CommitmentDelivery,
  ManagementCommentaryObservation,
  ManagementCommitmentStatement,
  ManagementDeliveryObservation,
  ManagementGuidanceDeliveryInput,
} from "./management-guidance-delivery.ts";

export const MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION = "1.0.0" as const;

export type OfficialManagementEvidenceDocument = {
  sourceId: string;
  url: string;
  publishedAt: string;
  title: string | null;
  /** Text supplied to Gemini. This may be a full document or admitted dossier claims. */
  text: string;
};

export type CommitmentIdentity = {
  topic: string;
  metric: string | null;
  scope: string | null;
  targetPeriod: string | null;
};

export type GeminiCommitmentCandidate = {
  candidateId: string;
  identity: CommitmentIdentity;
  existingCommitmentKey: string | null;
  statement: string;
  statedAt: string;
  targetDate: string | null;
  metric: string | null;
  specificity: number | null;
  measurability: number | null;
  deadlineClarity: number | null;
  evidenceRefs: string[];
};

export type GeminiCommentaryCandidate = {
  candidateId: string;
  commitmentCandidateId: string;
  change: CommentaryChange;
  observedAt: string;
  previousStatementId: string | null;
  revisionTimeliness: number | null;
  explanationQuality: number | null;
  internalConsistency: number | null;
  evidenceRefs: string[];
};

export type GeminiDeliveryCandidate = {
  candidateId: string;
  commitmentCandidateId: string;
  assessedAt: string;
  status: CommitmentDelivery;
  /** Must be explicit_outcome for delivered, partial, or missed. */
  basis: "explicit_outcome" | "pending_target" | "no_verifiable_outcome";
  explanation: string | null;
  materialityWeight: number | null;
  evidenceRefs: string[];
};

export type GeminiManagementGuidanceExtraction = {
  schemaVersion: typeof MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION;
  commitments: GeminiCommitmentCandidate[];
  commentary: GeminiCommentaryCandidate[];
  delivery: GeminiDeliveryCandidate[];
};

export type ManagementGuidanceExtractionRequest = {
  symbol: string;
  asOfDate: string;
  evidenceDocuments: OfficialManagementEvidenceDocument[];
  priorLedger: ManagementGuidanceDeliveryInput;
};

export type ExtractionRejection = {
  recordType: "commitment" | "commentary" | "delivery" | "payload";
  candidateId: string | null;
  reason: string;
};

export type ManagementGuidanceMergeProposal = {
  schemaVersion: typeof MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION;
  symbol: string;
  asOfDate: string;
  statements: ManagementCommitmentStatement[];
  commentary: ManagementCommentaryObservation[];
  delivery: ManagementDeliveryObservation[];
  rejected: ExtractionRejection[];
  mergedLedger: ManagementGuidanceDeliveryInput;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMENTARY_CHANGES = new Set<CommentaryChange>(["raised", "maintained", "lowered", "postponed", "withdrawn", "contradicted", "new", "unclear"]);
const DELIVERY_STATUSES = new Set<CommitmentDelivery>(["delivered", "partial", "missed", "pending", "unverifiable"]);
const SCOREABLE_DELIVERY = new Set<CommitmentDelivery>(["delivered", "partial", "missed"]);

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const bounded = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonEmpty);

function normalText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function stableCommitmentKey(symbol: string, identity: CommitmentIdentity): string {
  const canonical = [symbol, identity.topic, identity.metric, identity.scope, identity.targetPeriod]
    .map(value => normalText(value))
    .join("|");
  const readable = normalText(identity.metric ?? identity.topic).slice(0, 36) || "commitment";
  return `${normalText(symbol)}:${readable}:${fnv1a(canonical)}`;
}

function stableRecordId(prefix: string, key: string, date: string, evidenceRefs: string[]): string {
  return `${prefix}-${fnv1a(`${key}|${date}|${[...evidenceRefs].sort().join("|")}`)}`;
}

export const MANAGEMENT_GUIDANCE_GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "commitments", "commentary", "delivery"],
  properties: {
    schemaVersion: { type: "string", enum: [MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION] },
    commitments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["candidateId", "identity", "existingCommitmentKey", "statement", "statedAt", "targetDate", "metric", "specificity", "measurability", "deadlineClarity", "evidenceRefs"],
        properties: {
          candidateId: { type: "string" },
          identity: {
            type: "object", additionalProperties: false,
            required: ["topic", "metric", "scope", "targetPeriod"],
            properties: {
              topic: { type: "string" }, metric: { type: ["string", "null"] }, scope: { type: ["string", "null"] }, targetPeriod: { type: ["string", "null"] },
            },
          },
          existingCommitmentKey: { type: ["string", "null"] }, statement: { type: "string" }, statedAt: { type: "string" }, targetDate: { type: ["string", "null"] }, metric: { type: ["string", "null"] },
          specificity: { type: ["number", "null"], minimum: 0, maximum: 1 }, measurability: { type: ["number", "null"], minimum: 0, maximum: 1 }, deadlineClarity: { type: ["number", "null"], minimum: 0, maximum: 1 },
          evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
    commentary: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["candidateId", "commitmentCandidateId", "change", "observedAt", "previousStatementId", "revisionTimeliness", "explanationQuality", "internalConsistency", "evidenceRefs"],
        properties: {
          candidateId: { type: "string" }, commitmentCandidateId: { type: "string" }, change: { type: "string", enum: [...COMMENTARY_CHANGES] }, observedAt: { type: "string" }, previousStatementId: { type: ["string", "null"] },
          revisionTimeliness: { type: ["number", "null"], minimum: 0, maximum: 1 }, explanationQuality: { type: ["number", "null"], minimum: 0, maximum: 1 }, internalConsistency: { type: ["number", "null"], minimum: 0, maximum: 1 }, evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
    delivery: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["candidateId", "commitmentCandidateId", "assessedAt", "status", "basis", "explanation", "materialityWeight", "evidenceRefs"],
        properties: {
          candidateId: { type: "string" }, commitmentCandidateId: { type: "string" }, assessedAt: { type: "string" }, status: { type: "string", enum: [...DELIVERY_STATUSES] }, basis: { type: "string", enum: ["explicit_outcome", "pending_target", "no_verifiable_outcome"] }, explanation: { type: ["string", "null"] }, materialityWeight: { type: ["number", "null"], exclusiveMinimum: 0 }, evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function buildManagementGuidanceGeminiRequest(input: ManagementGuidanceExtractionRequest) {
  return {
    systemInstruction: [
      "You extract management guidance and subsequent delivery evidence; you do not score management or recommend securities.",
      "Use only supplied dated official evidence. Every proposed record must cite one or more supplied sourceId values.",
      "Preserve the same economic promise across restatements by reusing an existing commitmentKey when its identity matches.",
      "A lowered, postponed, withdrawn, or contradicted statement is commentary direction, not automatically a delivery miss.",
      "Never infer missed delivery from silence. Without explicit outcome evidence use pending when the target is not due, otherwise unverifiable.",
      "Do not manufacture dates, targets, outcomes, metrics, or precision. Use null when the evidence does not state them.",
    ].join(" "),
    prompt: JSON.stringify({
      task: "Propose structured management commitments, commentary changes, and delivery observations.",
      symbol: input.symbol,
      asOfDate: input.asOfDate,
      priorLedger: input.priorLedger,
      evidenceDocuments: input.evidenceDocuments,
    }),
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: MANAGEMENT_GUIDANCE_GEMINI_RESPONSE_SCHEMA,
      temperature: 0,
    },
  };
}

export function buildManagementGuidanceExtractionRequestFromDossier(
  dossier: ResearchDossier,
  priorLedger: ManagementGuidanceDeliveryInput,
): ManagementGuidanceExtractionRequest {
  const claimBySource = new Map<string, string[]>();
  for (const claim of dossier.sections.managementCommitments.filter(row => row.status === "supported")) {
    for (const sourceId of claim.sourceIds) claimBySource.set(sourceId, [...(claimBySource.get(sourceId) ?? []), claim.text]);
  }
  const evidenceDocuments = dossier.sources.flatMap(source => {
    const text = [...new Set(claimBySource.get(source.sourceId) ?? [])].join("\n");
    if (!source.publishedAt || !text || !["exchange", "company_official", "regulator"].includes(source.sourceClass)) return [];
    return [{ sourceId: source.sourceId, url: source.url, publishedAt: source.publishedAt, title: null, text }];
  });
  const asOfDate = dossier.generatedAt.slice(0, 10);
  return {
    symbol: dossier.company.symbol,
    asOfDate,
    evidenceDocuments,
    priorLedger: {
      ...priorLedger,
      asOfDate,
      statements: priorLedger.statements.filter(row => row.statedAt <= asOfDate),
      commentary: priorLedger.commentary.filter(row => row.observedAt <= asOfDate),
      delivery: priorLedger.delivery.filter(row => row.assessedAt <= asOfDate),
    },
  };
}

function payloadErrors(value: unknown): string[] {
  if (!isObject(value)) return ["Payload must be an object."];
  const errors: string[] = [];
  if (value.schemaVersion !== MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION) errors.push("Unsupported schemaVersion.");
  for (const field of ["commitments", "commentary", "delivery"] as const) if (!Array.isArray(value[field])) errors.push(`${field} must be an array.`);
  return errors;
}

function candidateCommitment(value: unknown): value is GeminiCommitmentCandidate {
  if (!isObject(value) || !isObject(value.identity)) return false;
  return nonEmpty(value.candidateId) && nonEmpty(value.identity.topic) && nullableString(value.identity.metric) && nullableString(value.identity.scope)
    && nullableString(value.identity.targetPeriod) && nullableString(value.existingCommitmentKey) && nonEmpty(value.statement) && validDate(value.statedAt)
    && (value.targetDate === null || validDate(value.targetDate)) && nullableString(value.metric) && bounded(value.specificity) && bounded(value.measurability)
    && bounded(value.deadlineClarity) && stringArray(value.evidenceRefs) && value.evidenceRefs.length > 0;
}

function candidateCommentary(value: unknown): value is GeminiCommentaryCandidate {
  return isObject(value) && nonEmpty(value.candidateId) && nonEmpty(value.commitmentCandidateId) && COMMENTARY_CHANGES.has(value.change as CommentaryChange)
    && validDate(value.observedAt) && nullableString(value.previousStatementId) && bounded(value.revisionTimeliness) && bounded(value.explanationQuality)
    && bounded(value.internalConsistency) && stringArray(value.evidenceRefs) && value.evidenceRefs.length > 0;
}

function candidateDelivery(value: unknown): value is GeminiDeliveryCandidate {
  return isObject(value) && nonEmpty(value.candidateId) && nonEmpty(value.commitmentCandidateId) && validDate(value.assessedAt)
    && DELIVERY_STATUSES.has(value.status as CommitmentDelivery) && ["explicit_outcome", "pending_target", "no_verifiable_outcome"].includes(String(value.basis))
    && nullableString(value.explanation) && (value.materialityWeight === null || (typeof value.materialityWeight === "number" && Number.isFinite(value.materialityWeight) && value.materialityWeight > 0))
    && stringArray(value.evidenceRefs) && value.evidenceRefs.length > 0;
}

function evidenceProblem(refs: string[], knownSources: Map<string, OfficialManagementEvidenceDocument>, recordDate: string, asOfDate: string): string | null {
  const unknown = refs.find(ref => !knownSources.has(ref));
  if (unknown) return `Unknown evidence reference: ${unknown}.`;
  if (recordDate > asOfDate) return "Record date is after the assessment date.";
  const futureEvidence = refs.find(ref => (knownSources.get(ref)?.publishedAt ?? "") > asOfDate);
  if (futureEvidence) return `Evidence ${futureEvidence} was published after the assessment date.`;
  return null;
}

function uniqueById<T>(prior: T[], proposed: T[], id: (row: T) => string): T[] {
  const rows = new Map(prior.map(row => [id(row), row]));
  for (const row of proposed) rows.set(id(row), row);
  return [...rows.values()];
}

export function normalizeManagementGuidanceExtraction(
  request: ManagementGuidanceExtractionRequest,
  modelOutput: unknown,
): ManagementGuidanceMergeProposal {
  const rejected: ExtractionRejection[] = [];
  const topErrors = payloadErrors(modelOutput);
  if (topErrors.length) {
    return {
      schemaVersion: MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION, symbol: request.symbol, asOfDate: request.asOfDate,
      statements: [], commentary: [], delivery: [], rejected: topErrors.map(reason => ({ recordType: "payload", candidateId: null, reason })), mergedLedger: request.priorLedger,
    };
  }
  const payload = modelOutput as GeminiManagementGuidanceExtraction;
  const knownSources = new Map(request.evidenceDocuments.map(row => [row.sourceId, row]));
  const priorKeys = new Set(request.priorLedger.statements.map(row => row.commitmentKey));
  const statements: ManagementCommitmentStatement[] = [];
  const candidateStatement = new Map<string, ManagementCommitmentStatement>();

  for (const raw of payload.commitments) {
    const candidateId = isObject(raw) && typeof raw.candidateId === "string" ? raw.candidateId : null;
    if (!candidateCommitment(raw)) { rejected.push({ recordType: "commitment", candidateId, reason: "Invalid commitment candidate shape." }); continue; }
    const evidenceError = evidenceProblem(raw.evidenceRefs, knownSources, raw.statedAt, request.asOfDate);
    if (evidenceError) { rejected.push({ recordType: "commitment", candidateId: raw.candidateId, reason: evidenceError }); continue; }
    const generatedKey = stableCommitmentKey(request.symbol, raw.identity);
    if (raw.existingCommitmentKey !== null && !priorKeys.has(raw.existingCommitmentKey)) {
      rejected.push({ recordType: "commitment", candidateId: raw.candidateId, reason: `Unknown existing commitment key: ${raw.existingCommitmentKey}.` }); continue;
    }
    const commitmentKey = raw.existingCommitmentKey ?? generatedKey;
    const statement: ManagementCommitmentStatement = {
      statementId: stableRecordId("statement", commitmentKey, raw.statedAt, raw.evidenceRefs), commitmentKey,
      statement: raw.statement.trim(), statedAt: raw.statedAt, targetDate: raw.targetDate, metric: raw.metric?.trim() || null,
      specificity: raw.specificity, measurability: raw.measurability, deadlineClarity: raw.deadlineClarity, evidenceRefs: [...new Set(raw.evidenceRefs)].sort(),
    };
    statements.push(statement);
    candidateStatement.set(raw.candidateId, statement);
  }

  const commentary: ManagementCommentaryObservation[] = [];
  for (const raw of payload.commentary) {
    const candidateId = isObject(raw) && typeof raw.candidateId === "string" ? raw.candidateId : null;
    if (!candidateCommentary(raw)) { rejected.push({ recordType: "commentary", candidateId, reason: "Invalid commentary candidate shape." }); continue; }
    const statement = candidateStatement.get(raw.commitmentCandidateId);
    if (!statement) { rejected.push({ recordType: "commentary", candidateId: raw.candidateId, reason: "Referenced commitment candidate was not admitted." }); continue; }
    const evidenceError = evidenceProblem(raw.evidenceRefs, knownSources, raw.observedAt, request.asOfDate);
    if (evidenceError) { rejected.push({ recordType: "commentary", candidateId: raw.candidateId, reason: evidenceError }); continue; }
    if (raw.change !== "new" && raw.previousStatementId === null) {
      rejected.push({ recordType: "commentary", candidateId: raw.candidateId, reason: "A non-new commentary change requires a previousStatementId." }); continue;
    }
    commentary.push({
      observationId: stableRecordId("commentary", statement.commitmentKey, raw.observedAt, raw.evidenceRefs), commitmentKey: statement.commitmentKey,
      observedAt: raw.observedAt, change: raw.change, previousStatementId: raw.previousStatementId, currentStatementId: statement.statementId,
      revisionTimeliness: raw.revisionTimeliness, explanationQuality: raw.explanationQuality, internalConsistency: raw.internalConsistency,
      evidenceRefs: [...new Set(raw.evidenceRefs)].sort(),
    });
  }

  const delivery: ManagementDeliveryObservation[] = [];
  for (const raw of payload.delivery) {
    const candidateId = isObject(raw) && typeof raw.candidateId === "string" ? raw.candidateId : null;
    if (!candidateDelivery(raw)) { rejected.push({ recordType: "delivery", candidateId, reason: "Invalid delivery candidate shape." }); continue; }
    const statement = candidateStatement.get(raw.commitmentCandidateId);
    if (!statement) { rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: "Referenced commitment candidate was not admitted." }); continue; }
    const evidenceError = evidenceProblem(raw.evidenceRefs, knownSources, raw.assessedAt, request.asOfDate);
    if (evidenceError) { rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: evidenceError }); continue; }
    if (raw.status === "missed" && raw.basis !== "explicit_outcome") {
      rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: "Silence or absent evidence cannot be classified as missed." }); continue;
    }
    if (SCOREABLE_DELIVERY.has(raw.status) && (raw.basis !== "explicit_outcome" || !raw.explanation?.trim())) {
      rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: "Scored delivery status requires explicit outcome evidence and an explanation." }); continue;
    }
    if (statement.targetDate === null || statement.targetDate > request.asOfDate) {
      if (raw.status !== "pending") { rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: "A commitment without a matured target can only be pending." }); continue; }
    } else if (raw.status === "pending") {
      rejected.push({ recordType: "delivery", candidateId: raw.candidateId, reason: "A matured target without explicit outcome evidence must be unverifiable, not pending." }); continue;
    }
    delivery.push({
      observationId: stableRecordId("delivery", statement.commitmentKey, raw.assessedAt, raw.evidenceRefs), commitmentKey: statement.commitmentKey,
      assessedAt: raw.assessedAt, status: raw.status, ...(raw.materialityWeight === null ? {} : { materialityWeight: raw.materialityWeight }),
      explanation: raw.explanation?.trim() || null, evidenceRefs: [...new Set(raw.evidenceRefs)].sort(),
    });
  }

  return {
    schemaVersion: MANAGEMENT_GUIDANCE_EXTRACTION_SCHEMA_VERSION, symbol: request.symbol, asOfDate: request.asOfDate,
    statements, commentary, delivery, rejected,
    mergedLedger: {
      symbol: request.symbol, asOfDate: request.asOfDate,
      statements: uniqueById(request.priorLedger.statements, statements, row => row.statementId),
      commentary: uniqueById(request.priorLedger.commentary, commentary, row => row.observationId),
      delivery: uniqueById(request.priorLedger.delivery, delivery, row => row.observationId),
    },
  };
}
