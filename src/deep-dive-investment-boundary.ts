const EXTERNAL_VIEW_HEADING = /^(#{1,6}\s+)ANALYST TARGETS\s*$/gim;
const EXTERNAL_VIEW_SECTION = /(^#{1,6}\s+EXTERNAL ANALYST VIEWS\s*$)([\s\S]*?)(?=^#{1,6}\s+|^Valuation Intelligence\s*:|(?![\s\S]))/gim;
const FORBIDDEN_LEVEL = /^.*(?:tactical\s+entry\s+zone|strategic\s+stop\s+loss|suggested\s+entry|suggested\s+exit).*$(?:\r?\n)?/gim;
const MATERIAL_VIEW = /(?:target(?:\s+price)?|recommendation|rating|\bbuy\b|\bsell\b|\bhold\b|overweight|underweight|accumulate|reduce)/i;
const TRACEABLE_URL = /https?:\/\//i;
const PUBLISHED_DATE = /(?:\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b)/i;

export const NO_TRACEABLE_ANALYST_VIEW = "No traceable external analyst target or recommendation was available in the retrieved evidence. AlphaSynth has not estimated one.";

/**
 * Enforces the product boundary on generated Deep Dive Markdown.
 *
 * AlphaSynth-created trading levels are removed. A published target or rating is
 * retained only when the same row identifies a traceable http(s) source.
 */
export function enforceDeepDiveInvestmentBoundary(text: string): string {
  if (!text) return text;
  let cleaned = text
    .replace(FORBIDDEN_LEVEL, "")
    .replace(EXTERNAL_VIEW_HEADING, "$1EXTERNAL ANALYST VIEWS");

  cleaned = cleaned.replace(EXTERNAL_VIEW_SECTION, (_match, heading: string, body: string) => {
    const rows = body.split(/\r?\n/);
    const filtered = rows.filter((line: string) => {
      const materialView = MATERIAL_VIEW.test(line);
      if (!materialView || /^\s*(?:\||[-:| ]+)\s*$/.test(line)) return true;
      // Preserve a Markdown table's descriptive header; its data rows are checked below.
      if (/^\s*\|.*(?:firm|brokerage|analyst).*source.*\|\s*$/i.test(line)) return true;
      if (/no traceable external analyst/i.test(line)) return true;
      return TRACEABLE_URL.test(line) && PUBLISHED_DATE.test(line);
    });
    const retained = filtered.join("\n").trim();
    if (!TRACEABLE_URL.test(retained)) return `${heading}\n\n${NO_TRACEABLE_ANALYST_VIEW}`;
    return `${heading}\n${retained}`;
  });

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}
