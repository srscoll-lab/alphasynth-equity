import assert from "node:assert/strict";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { InMemoryFundamentalReviewStore } from "../src/fundamental-review-store.ts";
import { InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { DATA_PROVIDER_DAILY_LIMIT, fcsEvidenceFailureMessage, nextIstMidnight } from "../src/fcs-evidence-failure.ts";
import { isUnsupportedFinancialSector } from "../src/fcs-sector-support.ts";
import { lifecyclePendingExplanation } from "../src/fcs-lifecycle-pending.ts";
import { TapetideMcpClient } from "../src/tapetide-fcs-provider.ts";

// 1. Banks, NBFCs and insurers are turned away before any data call; a known sector wins over the name.
assert.equal(isUnsupportedFinancialSector({ companyName: "HDFC Bank Limited", sector: "Financial Services" }), true);
assert.equal(isUnsupportedFinancialSector({ companyName: "Bajaj Finance Limited" }), true);
assert.equal(isUnsupportedFinancialSector({ companyName: "Bajaj Finserv Ltd." }), true);
assert.equal(isUnsupportedFinancialSector({ companyName: "SBI Life Insurance Company Limited" }), true);
assert.equal(isUnsupportedFinancialSector({ companyName: "Oracle Financial Services Software Limited", sector: "Information Technology" }), false);
for (const name of ["Eicher Motors Limited", "Havells India Limited", "Glenmark Pharmaceuticals Limited", "Larsen & Toubro Limited", "Thermax Limited"])
  assert.equal(isUnsupportedFinancialSector({ companyName: name }), false, name);

// 2. Daily limit: one helper for the 00:00 IST reset, a plain message.
assert.equal(new Date(nextIstMidnight(Date.parse("2026-10-23T06:15:00Z"))).toISOString(), "2026-10-23T18:30:00.000Z");
assert.equal(TapetideMcpClient.nextIstMidnight(Date.parse("2026-10-23T19:00:00Z")), Date.parse("2026-10-24T18:30:00Z"));
assert.match(fcsEvidenceFailureMessage(2, [{ outcome: "tapetide_quota_exhausted" }]), /^Review paused: .*daily limit.*after midnight IST \(00:00\)/);
assert.match(fcsEvidenceFailureMessage(3, [{ outcome: "model_returned_no_verified_factor_comparison" }]), /^Review finished: 3 of 4/);
assert.match(lifecyclePendingExplanation("data_provider_daily_limit", [])[0], /daily limit while reading the earlier quarters.*after midnight IST/);

// 3. Worker: a review that hits the limit is paused, and repeat requests return it until the reset.
let clock = Date.parse("2026-10-23T08:00:00Z");
let evidenceCalls = 0;
const service = new FundamentalReviewService({ store: new InMemoryFundamentalReviewStore(), queue: new InMemoryFundamentalReviewQueue(),
  evidenceUrl: "https://test/evidence", scoringUrl: "https://test/score", now: () => new Date(clock),
  fetch: async () => { evidenceCalls += 1; return Response.json({ candidates: [], documents: [], validations: [],
    diagnostics: [{ outcome: "tapetide_quota_exhausted", detail: "daily limit reached before any evidence; nothing else was attempted" }] }); } });
const first = await service.request({ symbol: "TVSMOTOR", companyName: "TVS Motor Company Limited", informationCutoff: "2026-10-23" });
const paused = await service.execute({ jobId: first.jobId!, symbol: "TVSMOTOR" });
assert.equal(paused.failureCode, DATA_PROVIDER_DAILY_LIMIT);
assert.match(paused.message, /daily limit/);
clock = Date.parse("2026-10-23T17:00:00Z");   // 22:30 IST, same day
const again = await service.request({ symbol: "TVSMOTOR", companyName: "TVS Motor Company Limited", informationCutoff: "2026-10-23" });
assert.equal(again.jobId, first.jobId, "no new job (and no data calls) before the reset");
clock = Date.parse("2026-10-23T18:45:00Z");   // 00:15 IST next day
const fresh = await service.request({ symbol: "TVSMOTOR", companyName: "TVS Motor Company Limited", informationCutoff: "2026-10-24" });
assert.notEqual(fresh.jobId, first.jobId, "a new review is allowed after 00:00 IST");
assert.equal(evidenceCalls, 1);

console.log("Beta readiness: financial-sector gate, daily-limit pause until 00:00 IST, plain messages verified.");
