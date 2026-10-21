type FcsUnitFamily = 'percent' | 'inr_crore' | 'inr_million' | 'inr_billion'
  | 'usd_million' | 'usd_billion' | 'ratio';

/**
 * Purely representational aliases. Adding an entry here never permits currency,
 * accounting-basis, period or metric inference.
 */
export const FCS_UNIT_EQUIVALENCES: Readonly<Record<FcsUnitFamily, readonly string[]>> = {
  percent: ['%', 'percent', 'percentage'],
  inr_crore: ['Rs.Cr', 'Rs Cr', 'Rs. Cr', 'Rs crore', 'Rs. crore', 'INR crore',
    'INR crores', 'INR cr', 'INR cr.', 'INR in crore', 'INR in crores', '₹ Cr', '₹ crore',
    'Cr', 'Crore', 'Crores'],
  inr_million: ['INR million', 'INR millions', 'INR mn', 'INR in million', 'INR in millions', 'INR in mn'],
  inr_billion: ['Rs.Bn', 'Rs Bn', 'INR billion', 'INR billions', 'INR bn', 'INR in billion', 'INR in bn'],
  usd_million: ['USD.Mn', 'USD Mn', 'USD million', 'USD millions', 'USD mn'],
  usd_billion: ['USD.Bn', 'USD Bn', 'USD billion', 'USD billions', 'USD bn'],
  ratio: ['times', 'ratio', 'x'],
};

function unitToken(raw: unknown): string {
  return String(raw ?? '').normalize('NFKC').trim().toLowerCase()
    .replace(/₹/g, ' inr ')
    .replace(/\brupees?\b/g, 'inr')
    .replace(/\brs\.?\b/g, 'inr')
    .replace(/[().,_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unitFamily(raw: unknown): FcsUnitFamily | null {
  const token = unitToken(raw);
  for (const [family, aliases] of Object.entries(FCS_UNIT_EQUIVALENCES) as [FcsUnitFamily, readonly string[]][]) {
    if (aliases.some(alias => unitToken(alias) === token)) return family;
  }
  return null;
}

/** Representation-only normalization. Never changes values or frequency. */
export function normalizeFcsUnit(raw: unknown, allowed: readonly string[]): string {
  const value = String(raw ?? '').trim();
  if (allowed.includes(value)) return value;
  const family = unitFamily(value);
  if (!family) return value;
  return allowed.find(item => unitFamily(item) === family) ?? value;
}

export interface NormalizedFcsValues {
  unit: string;
  previousValue: number;
  currentValue: number;
  sourceUnit: string;
  sourcePreviousValue: number;
  sourceCurrentValue: number;
  conversion: string;
}

/**
 * Normalize an explicitly declared INR denomination. Callers must verify the
 * source values in sourceUnit before publishing the converted values. Bare
 * "lakhs" is deliberately insufficient: the source must establish currency.
 * This does not infer currency, exchange rates, percentage scales or periods.
 */
export function normalizeFcsValues(
  rawUnit: unknown,
  previousValue: number,
  currentValue: number,
  allowed: readonly string[],
): NormalizedFcsValues {
  const sourceUnit = String(rawUnit ?? '').trim();
  const result: NormalizedFcsValues = {
    unit: normalizeFcsUnit(sourceUnit, allowed),
    previousValue,
    currentValue,
    sourceUnit,
    sourcePreviousValue: previousValue,
    sourceCurrentValue: currentValue,
    conversion: 'none',
  };
  if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) return result;
  // If the metric already accepts this denomination, no value scaling is needed.
  if (allowed.includes(result.unit)) return result;
  const croreUnit = allowed.find(unit => normalizeFcsUnit(unit, ['INR crore']) === 'INR crore');
  const divisor = inrCroreDivisor(sourceUnit);
  if (croreUnit && divisor !== null) {
    result.unit = croreUnit;
    result.previousValue = previousValue / divisor;
    result.currentValue = currentValue / divisor;
    result.conversion = divisor === 1 ? 'none'
      : divisor === 100 ? 'INR_lakh_to_crore'
      : divisor === 10 ? 'INR_million_to_crore'
      : divisor === 0.01 ? 'INR_billion_to_crore'
      : divisor === 0.001 ? 'INR_thousand_crore_to_crore'
      : `INR_${divisor}_to_crore`;
  }
  return result;
}

export interface NormalizedFcsComparisonValues {
  unit: string;
  previousValue: number;
  currentValue: number;
  previousSourceUnit: string;
  currentSourceUnit: string;
  previousConversion: string;
  currentConversion: string;
}

function inrCroreDivisor(rawUnit: string): number | null {
  const token = unitToken(rawUnit);
  if (/^inr (?:in )?(?:actuals?|actual|rupee)$/.test(token) || token === 'inr') return 10_000_000;
  if (/^inr (?:in )?(?:lakhs?|lacs?)$/.test(token)) return 100;
  if (/^inr (?:in )?(?:millions?|mn)$/.test(token)) return 10;
  if (/^inr (?:in )?(?:crores?|cr)$/.test(token)) return 1;
  if (/^inr (?:in )?thousand crores?$/.test(token)) return 0.001;
  if (/^inr (?:in )?(?:billions?|bn)$/.test(token)) return 0.01;
  return null;
}

function bareInrScaleDivisor(rawUnit: string): number | null {
  const token = unitToken(rawUnit);
  if (/^(?:lakhs?|lacs?)$/.test(token)) return 100;
  if (/^(?:millions?|mn)$/.test(token)) return 10;
  if (/^(?:crores?|cr)$/.test(token)) return 1;
  if (/^thousand crores?$/.test(token)) return 0.001;
  if (/^(?:billions?|bn)$/.test(token)) return 0.01;
  return null;
}

/**
 * Compare two exact, source-printed values without assuming both filings use
 * the same denomination. This is representation-only: source verification must
 * happen independently for each raw value and its declared unit before use.
 */
export function normalizeFcsComparisonValues(
  previousRawUnit: unknown,
  currentRawUnit: unknown,
  previousValue: number,
  currentValue: number,
  allowed: readonly string[],
): NormalizedFcsComparisonValues | null {
  if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) return null;
  const previousSourceUnit = String(previousRawUnit ?? '').trim();
  const currentSourceUnit = String(currentRawUnit ?? '').trim();
  const previousCanonical = normalizeFcsUnit(previousSourceUnit, allowed);
  const currentCanonical = normalizeFcsUnit(currentSourceUnit, allowed);
  if (previousCanonical === currentCanonical && allowed.includes(currentCanonical)) {
    return { unit: currentCanonical, previousValue, currentValue, previousSourceUnit,
      currentSourceUnit, previousConversion: 'none', currentConversion: 'none' };
  }
  const croreUnit = allowed.find(unit => normalizeFcsUnit(unit, ['INR crore']) === 'INR crore');
  let previousDivisor = inrCroreDivisor(previousSourceUnit);
  let currentDivisor = inrCroreDivisor(currentSourceUnit);
  // Some exchange iXBRL pages put `INR` in presentation-currency metadata and
  // only `Lakhs` in the table. Infer currency from the paired explicitly-INR
  // period only; sourceSupportsFcsUnit must still confirm INR + scale in each
  // cited original before the comparison can be admitted.
  if (previousDivisor !== null && currentDivisor === null) currentDivisor = bareInrScaleDivisor(currentSourceUnit);
  if (currentDivisor !== null && previousDivisor === null) previousDivisor = bareInrScaleDivisor(previousSourceUnit);
  if (!croreUnit || previousDivisor === null || currentDivisor === null) return null;
  return {
    unit: croreUnit,
    previousValue: previousValue / previousDivisor,
    currentValue: currentValue / currentDivisor,
    previousSourceUnit,
    currentSourceUnit,
    previousConversion: previousDivisor === 1 ? 'none' : `INR_${previousDivisor}_to_crore`,
    currentConversion: currentDivisor === 1 ? 'none' : `INR_${currentDivisor}_to_crore`,
  };
}

/** Require a currency denomination to be visible in the cited original. */
export function sourceSupportsFcsUnit(documentText: string, rawUnit: unknown): boolean {
  const sourceUnit = String(rawUnit ?? '').trim();
  const text = documentText.replace(/\s+/g, ' ');
  const bareDivisor = bareInrScaleDivisor(sourceUnit);
  if (bareDivisor !== null) {
    // A bare scale from the model is acceptable only when the cited original
    // itself names INR/rupees with that scale; normalization alone is not proof.
    if (bareDivisor === 1 && /(?:INR|Rs\.?|₹)\s*(?:in\s*)?(?:crores?|cr\.?)\b/i.test(text)) return true;
    const declaresInr = /(?:presentation\s+currency|currency)[^\n]{0,120}\bINR\b|\bINR\b[^\n]{0,120}(?:presentation\s+currency|currency)/i.test(documentText);
    if (!declaresInr) return false;
    if (bareDivisor === 100) return /(?:amount\s+in|level\s+of\s+rounding[^\n]{0,80})(?:lakhs?|lacs?)\b/i.test(text);
    if (bareDivisor === 10) return /(?:amount\s+in|level\s+of\s+rounding[^\n]{0,80})(?:millions?|mn)\b/i.test(text);
    if (bareDivisor === 1) return /(?:amount\s+in|level\s+of\s+rounding[^\n]{0,80})(?:crores?|cr\.?)\b/i.test(text);
    if (bareDivisor === 0.001) return /(?:amount\s+in|level\s+of\s+rounding[^\n]{0,80})thousand\s+crores?\b/i.test(text);
    return /(?:amount\s+in|level\s+of\s+rounding[^\n]{0,80})(?:billions?|bn)\b/i.test(text);
  }
  const divisor = inrCroreDivisor(sourceUnit);
  if (!divisor) return true; // Percent and ratios have no currency denomination.
  if (divisor === 10_000_000) return /INR\s*\(\s*in\s*actuals?\s*\)|(?:INR|Rs\.?)\s*(?:in\s*)?rupees?/i.test(text);
  if (divisor === 100) return /(?:INR|Rs\.?)\s*(?:in\s*)?(?:lakhs?|lacs?)|(?:lakhs?|lacs?)\s*of\s*(?:INR|rupees?)/i.test(text);
  if (divisor === 10) return /(?:INR|Rs\.?)\s*(?:in\s*)?(?:millions?|mn)\b/i.test(text);
  if (divisor === 1) return /(?:INR|Rs\.?|₹)\s*(?:in\s*)?(?:crores?|cr\.?)\b/i.test(text);
  if (divisor === 0.001) return /(?:INR|Rs\.?)\s*(?:in\s*)?thousand\s+crores?\b/i.test(text);
  return /(?:INR|Rs\.?)\s*(?:in\s*)?(?:billions?|bn)\b/i.test(text);
}

export function normalizeFcsPeriodLabel(raw: unknown, endDate: string | null): string {
  const label = String(raw ?? '').trim();
  // Only incomplete headers are enriched. Dates remain subject to source verification.
  return endDate && /^(quarter ended|year ended|period ended|as on|as at)$/i.test(label)
    ? `${label} ${endDate}` : label;
}
