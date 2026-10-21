// Indian listed companies must publish quarterly results within 45 days and
// annual (March) results within 60 days of the period end (SEBI LODR Reg. 33).
// A 100-day window also covers board-meeting slippage and later presentations.
const RESULT_WINDOW_DAYS = 100;
const DAY_MS = 86_400_000;

const structuredExchangeUrl = (url: string) =>
  /^https:\/\/nsearchives\.nseindia\.com\/corporate\/ixbrl\/[^?#]+\.html(?:[?#]|$)/i.test(url);

/**
 * Order discovered sources for a requested reporting period. Documents
 * published in that period's results window come first, undated discovery
 * hints next, and documents dated outside the window last. Within each group
 * NSE structured iXBRL filings lead, then the original order is kept.
 * Without a target, only the iXBRL preference applies.
 */
export function rankSourcesForTargetPeriod<T extends { url: string; published_at?: string | null }>(
  sources: readonly T[], targetPeriodEnd?: string,
): T[] {
  const target = targetPeriodEnd && /^\d{4}-\d{2}-\d{2}$/.test(targetPeriodEnd) ? Date.parse(`${targetPeriodEnd}T00:00:00Z`) : NaN;
  const windowRank = (source: T) => {
    if (!Number.isFinite(target)) return 0;
    const published = source.published_at ? Date.parse(String(source.published_at).slice(0, 10) + "T00:00:00Z") : NaN;
    if (!Number.isFinite(published)) return 1;
    return published > target && published <= target + RESULT_WINDOW_DAYS * DAY_MS ? 0 : 2;
  };
  return sources
    .map((source, index) => ({ source, index, window: windowRank(source), structured: structuredExchangeUrl(source.url) ? 0 : 1 }))
    .sort((a, b) => a.window - b.window || a.structured - b.structured || a.index - b.index)
    .map((item) => item.source);
}
