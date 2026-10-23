/**
 * Banks, NBFCs and insurers are not yet supported by the beta FCS: their Earnings,
 * Economics and Execution need their own measures (net interest income, loan book,
 * disbursements, asset quality) and Tapetide's Sales/Operating Profit rows do not fit.
 * Turned away before any data call, with a plain message.
 */
export const FINANCIAL_SECTOR_NOT_SUPPORTED_MESSAGE = "Banks, NBFCs and insurance companies are not yet supported in the AlphaSynth FCS beta. "
  + "Their results need sector-specific measures (loan book, deposits, disbursements, asset quality), which are planned. No review was started.";

const FINANCIAL_NAME = /\bbank\b|\bfinanc(?:e|ial|ing)\b|\bfinserv\b|\binsurance\b|\bnbfc\b|\bhousing finance\b|\bcapital\s+(?:ltd|limited)\b|\bfincorp\b|\bcredit\b|\blending\b/i;

export function isUnsupportedFinancialSector(input: { companyName?: string; sector?: string | null }): boolean {
  // A known sector wins (Oracle Financial Services Software is IT); the name is used only without one.
  if (input.sector) return /financial services/i.test(input.sector);
  return FINANCIAL_NAME.test(String(input.companyName || ""));
}
