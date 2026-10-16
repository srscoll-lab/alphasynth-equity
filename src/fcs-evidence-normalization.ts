/** Representation-only normalization. Never converts values or changes frequency. */
export function normalizeFcsUnit(raw: unknown, allowed: readonly string[]): string {
  const value = String(raw ?? '').trim();
  if (allowed.includes(value)) return value;
  const groups = [
    ['%', 'percent', 'percentage'],
    ['Rs.Cr', 'INR crore', 'Rs crore', 'Rs. crore', 'Rs. Cr', 'Rs. In Cr', 'INR in crore'],
    ['Rs.Bn', 'INR billion'],
    ['USD.Mn', 'USD million'],
    ['USD.Bn', 'USD billion'],
    ['times', 'ratio', 'x'],
  ];
  const group = groups.find(items => items.some(item => item.toLowerCase() === value.toLowerCase()));
  return group ? allowed.find(item => group.includes(item)) ?? value : value;
}

export interface NormalizedFcsValues {
  unit: string;
  previousValue: number;
  currentValue: number;
  sourceUnit: string;
  sourcePreviousValue: number;
  sourceCurrentValue: number;
  conversion: 'none' | 'INR_lakh_to_crore';
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
  if (croreUnit && /^(?:INR|Rs\.?|₹)\s*lakhs?$/i.test(sourceUnit)) {
    result.unit = croreUnit;
    result.previousValue = previousValue / 100;
    result.currentValue = currentValue / 100;
    result.conversion = 'INR_lakh_to_crore';
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
  if (/^(?:INR|Rs\.?)\s*(?:\(in\s*)?(?:actuals?|rupees?)(?:\))?$/i.test(rawUnit)) return 10_000_000;
  if (/^(?:INR|Rs\.?)\s*(?:lakhs?|lacs?)$/i.test(rawUnit)) return 100;
  if (/^(?:INR|Rs\.?)\s*(?:in\s*)?(?:crores?|cr\.?)$/i.test(rawUnit)) return 1;
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
  const previousDivisor = inrCroreDivisor(previousSourceUnit);
  const currentDivisor = inrCroreDivisor(currentSourceUnit);
  if (!croreUnit || !previousDivisor || !currentDivisor) return null;
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
  const divisor = inrCroreDivisor(sourceUnit);
  if (!divisor) return true; // Percent and ratios have no currency denomination.
  const text = documentText.replace(/\s+/g, ' ');
  if (divisor === 10_000_000) return /INR\s*\(\s*in\s*actuals?\s*\)|(?:INR|Rs\.?)\s*(?:in\s*)?rupees?/i.test(text);
  if (divisor === 100) return /(?:INR|Rs\.?)\s*(?:in\s*)?(?:lakhs?|lacs?)|(?:lakhs?|lacs?)\s*of\s*(?:INR|rupees?)/i.test(text);
  return /(?:INR|Rs\.?)\s*(?:in\s*)?(?:crores?|cr\.?)/i.test(text);
}

export function normalizeFcsPeriodLabel(raw: unknown, endDate: string | null): string {
  const label = String(raw ?? '').trim();
  // Only incomplete headers are enriched. Dates remain subject to source verification.
  return endDate && /^(quarter ended|year ended|period ended|as on|as at)$/i.test(label)
    ? `${label} ${endDate}` : label;
}
