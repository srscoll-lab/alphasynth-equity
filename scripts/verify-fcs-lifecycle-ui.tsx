import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FcsLifecycleSummary from "../src/components/FcsLifecycleSummary";

const value = { classification: "ESTABLISHED", latestPeriodEnd: "2026-06-30", informationCutoff: "2026-08-25",
  calculatedAt: "2026-10-06T00:00:00Z", reason: "STRONG_ACROSS_THREE_CHECKPOINTS",
  checkpoints: ["2025-12-31", "2026-03-31", "2026-06-30"].map((periodEnd) => ({ periodEnd, periodLabel: periodEnd, fcsScore: 65, rawScore: 0.5 })) };
const current = renderToStaticMarkup(<FcsLifecycleSummary value={value} latestReady />);
assert.match(current, /Three-period lifecycle/);
for (const date of ["2025-12-31", "2026-03-31", "2026-06-30", "2026-08-25", "2026-10-06"]) assert(current.includes(date));
assert.match(current, /not a predicted stock return/);
const stale = renderToStaticMarkup(<FcsLifecycleSummary value={value} latestReady={false} />);
assert.match(stale, /Last completed lifecycle — latest update incomplete/);
const pending = renderToStaticMarkup(<FcsLifecycleSummary value={null} latestReady={false} />);
assert.match(pending, /Lifecycle unavailable/);
assert.match(pending, /does not invalidate/);
console.log("Dated lifecycle UI: complete, retained and unavailable states verified.");
