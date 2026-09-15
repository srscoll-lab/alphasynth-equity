/**
 * Debt-to-equity values in the peer table are display ratios, not rupee amounts.
 * Values outside this deliberately broad range are more likely to be extraction
 * or field-mapping errors than decision-useful, comparable ratios. We do not
 * repair or estimate them: unsupported values are withheld as null / N/A.
 */
export const MAX_COMPARABLE_DEBT_EQUITY = 20;

export function sanitizeDebtEquity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string"
    ? Number(value.replace(/,/g, "").trim())
    : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_COMPARABLE_DEBT_EQUITY) {
    return null;
  }
  return parsed;
}
