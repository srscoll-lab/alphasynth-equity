/** NSE integrated filings declare their symbol in the document itself. A
 * search result's title or URL is not enough to associate it with an issuer. */
export function nseStructuredFilingMatchesSymbol(url: string, visibleText: string, symbol: string): boolean {
  if (!/^https:\/\/nsearchives\.nseindia\.com\/corporate\/ixbrl\/[^?#]+\.html(?:[?#]|$)/i.test(url)) return true;
  // The HTML reader preserves financial table cells with `|` and newlines.
  // NSE's identity table commonly renders as `NSE Symbol |\nSOLARINDS |`.
  const declared = visibleText.match(/\bNSE\s+Symbol\s*(?:[|:]\s*)?([A-Z0-9&.-]{1,30})(?=\s|\||$)/i)?.[1];
  return Boolean(declared && declared.toUpperCase() === symbol.trim().toUpperCase());
}
