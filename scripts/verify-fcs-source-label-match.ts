import assert from "node:assert/strict";
import { containsReportedNumber, containsReportingPeriod, sourceLabelVariants } from "../src/fundamental-review-source-match.ts";

// Issuer row labels are searchable; generic or numeric fragments are not.
assert.deepEqual(sourceLabelVariants("Domestic Explosives"), ["domestic explosives"]);
assert.deepEqual(sourceLabelVariants("International Explosives 1364"), ["international explosives"]);
assert.deepEqual(sourceLabelVariants("Debt equity ratio"), ["debt equity ratio"]);
assert.deepEqual(sourceLabelVariants("Defence"), ["defence"], "distinctive one-word segment");
assert.deepEqual(sourceLabelVariants("Exports"), ["exports"]);
assert.deepEqual(sourceLabelVariants("CIL"), [], "short tokens are too ambiguous");
assert.deepEqual(sourceLabelVariants("Others"), []);
assert.deepEqual(sourceLabelVariants("Sales"), []);
assert.deepEqual(sourceLabelVariants("Total"), []);
assert.deepEqual(sourceLabelVariants("Total Income"), []);
assert.deepEqual(sourceLabelVariants("Revenue from Operations"), []);
assert.deepEqual(sourceLabelVariants("Net Sales (Rs. in Cr)"), []);
assert.deepEqual(sourceLabelVariants("Q1FY27"), []);
assert.deepEqual(sourceLabelVariants(""), []);
assert.deepEqual(sourceLabelVariants(undefined), []);

// Solar Industries Q1 FY27 presentation (BSE), segment table as extracted.
const presentation = "Net Sales QUARTERLY RESULT Customer Q4FY26 % of Sales Q1FY27 % of sales Q1FY26 % of sales Change QoQ "
  + "Domestic Explosives 1033 34% 1361 37% 898 42% 52% International Explosives 1006 33% 1364 37% 826 38% 65% "
  + "Defence 1008 33% 933 26% 418 19% 123% Others 6 0% 10 0% 12 1% (17%) Total 3053 3668 2154";

// Mirrors the server's untabled documentSupportsAnchor path.
function supported(text: string, labels: string[], a: { pp: string; cp: string; pe: string; ce: string; pv: number; cv: number }) {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  return labels.some((label) => {
    for (let index = lower.indexOf(label); index >= 0; index = lower.indexOf(label, index + label.length)) {
      if (/[a-z0-9]/.test(lower[index - 1] || "") || /[a-z0-9]/.test(lower[index + label.length] || "")) continue;
      const values = lower.slice(Math.max(0, index - 350), index + label.length + 350);
      const window = lower.slice(Math.max(0, index - 3000), index + label.length + 3000);
      if (containsReportedNumber(values, a.pv) && containsReportedNumber(values, a.cv)
        && containsReportingPeriod(window, a.pp, a.pe) && containsReportingPeriod(window, a.cp, a.ce)) return true;
    }
    return false;
  });
}
const q1 = { pp: "Q1FY26", cp: "Q1FY27", pe: "2025-06-30", ce: "2026-06-30" };

// Before the fix only the canonical name was searched and the row was rejected.
assert.equal(supported(presentation, ["segment revenue"], { ...q1, pv: 898, cv: 1361 }), false);
// After: the issuer's own row label is searched; exact values and periods still required.
const domestic = ["segment revenue", ...sourceLabelVariants("Domestic Explosives")];
assert.equal(supported(presentation, domestic, { ...q1, pv: 898, cv: 1361 }), true);
assert.equal(supported(presentation, ["segment revenue", ...sourceLabelVariants("International Explosives")], { ...q1, pv: 826, cv: 1364 }), true);
// Wrong values beside a real label still fail.
assert.equal(supported(presentation, domestic, { ...q1, pv: 898, cv: 1360 }), false);
assert.equal(supported(presentation, domestic, { ...q1, pv: 3888.2, cv: 1361 }), false);
// A missing period still fails.
assert.equal(supported(presentation, domestic, { ...q1, pp: "Q1FY25", pe: "2024-06-30", pv: 898, cv: 1361 }), false);
// "Total" cannot be used to admit the totals row as a segment.
assert.equal(supported(presentation, ["segment revenue", ...sourceLabelVariants("Total")], { ...q1, pv: 2154, cv: 3668 }), false);

// Shaped like Solar's Q4 FY26 customer-segment table (BSE, 15 May 2026); the
// Defence row values are the real 430 / 1008, other rows are illustrative.
const q4 = "quarterly result rs. in cr customer q3fy26 % of sales q4fy26 % of sales q4fy25 % of sales change yoy "
  + "cil 261 10% 269 09% 286 13% (6%) non-cil & institutional 287 11% 316 10% 279 13% 13% "
  + "defence 933 37% 1008 33% 430 20% 134% exports and overseas 1006 40% 1189 39% 963 44% 23% others 56 2% 271 9% 209 10% 30%";
const q4p = { pp: "Q4FY25", cp: "Q4FY26", pe: "2025-03-31", ce: "2026-03-31" };
assert.equal(supported(q4, ["segment revenue"], { ...q4p, pv: 430, cv: 1008 }), false, "before: one-word label refused");
assert.equal(supported(q4, ["segment revenue", ...sourceLabelVariants("Defence")], { ...q4p, pv: 430, cv: 1008 }), true);
assert.equal(supported(q4, ["segment revenue", ...sourceLabelVariants("Defence")], { ...q4p, pv: 430, cv: 1009 }), false);
assert.equal(supported(q4, ["segment revenue", ...sourceLabelVariants("Others")], { ...q4p, pv: 209, cv: 271 }), false, "generic one-word label");

// NSE iXBRL prints only the current value (0.2600) for debt equity ratio:
// a prior value of 0.23 is not in this filing and must stay rejected.
const ixbrl = "Debt equity ratio | 0.2600 | 0.2600 | 25 | Debt service coverage ratio | 8.6300 | 8.6300 |";
assert.equal(containsReportedNumber(ixbrl, 0.26), true);
assert.equal(containsReportedNumber(ixbrl, 0.23), false);

console.log("FCS source-label matching: issuer row labels admitted, generic labels refused, values and periods still exact.");
