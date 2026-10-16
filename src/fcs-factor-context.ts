export type FcsFactor = 'earnings' | 'economics' | 'execution' | 'balance_sheet';

type SourceText = { sourceUrl: string; sourceDate: string | null; text: string };

const TERMS: Record<FcsFactor, RegExp> = {
  earnings: /\b(?:revenue|income|sales|profit|earnings|ebitda|eps|turnover)\b/gi,
  economics: /\b(?:margin|realization|realisation|yield|spread|pricing|unit economics|ebitda|nim)\b/gi,
  execution: /\b(?:order book|order inflow|volume|capacity|utili[sz]ation|commissioning|delivery|deal wins|contract value|market share|production|offtake|attrition|client additions)\b/gi,
  balance_sheet: /\b(?:debt|equity|net worth|cash flow|cash and cash|liquidity|working capital|receivables|inventory|coverage|capital adequacy|asset quality|gnpa|nnpa)\b/gi,
};

/** A retrieval aid, never evidence admission. The verifier still reads the full
 * original and checks exact values, periods, issuer, publication date and unit.
 * Keep metadata/header text and bounded local passages instead of repeating six
 * entire filings in each of four model calls. */
export function selectFcsFactorContext(documents: readonly SourceText[], factor: FcsFactor): SourceText[] {
  return documents.map(document => {
    const text = document.text;
    if (text.length <= 6000) return { ...document, text };
    const ranges: Array<[number, number]> = [[0, Math.min(1600, text.length)]];
    const pattern = new RegExp(TERMS[factor].source, 'gi');
    const candidates: Array<{ start: number; end: number; score: number }> = [];
    for (const match of text.matchAll(pattern)) {
      if (candidates.length >= 250) break;
      const start = Math.max(0, match.index - 350);
      const end = Math.min(text.length, match.index + 850);
      const passage = text.slice(start, end);
      // Financial tables are numerically dense. Rank those above repeated
      // narrative mentions, then retain source order in the final prompt.
      const numbers = [...passage.matchAll(/(?<![\w])\d[\d,]*(?:\.\d+)?%?/g)].length;
      const dates = [...passage.matchAll(/\b(?:20\d{2}|\d{1,2}[-./]\d{1,2}[-./]20\d{2})\b/g)].length;
      candidates.push({ start, end, score: Math.min(numbers, 30) + Math.min(dates, 5) * 2 });
    }
    candidates.sort((a, b) => b.score - a.score || a.start - b.start);
    ranges.push(...candidates.slice(0, 12).map(({ start, end }): [number, number] => [start, end]));
    // If the issuer uses unfamiliar labels, expose both ends rather than an
    // empty context. This does not grant any exemption from source verification.
    if (ranges.length === 1) ranges.push([Math.max(0, text.length - 2400), text.length]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [start, end] of ranges) {
      const previous = merged.at(-1);
      if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
      else merged.push([start, end]);
    }
    const selected = merged.map(([start, end]) => text.slice(start, end)).join('\n[Unrelated filing text omitted]\n');
    return { ...document, text: selected.slice(0, 12000) };
  });
}
