import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const activity = read("../src/components/FundamentalReviewActivity.tsx");
const radar = read("../src/components/MomentumRadar.tsx");
const tracker = read("../src/components/SignalTracker.tsx");
const app = read("../src/App.tsx");
const launcher = read("../src/components/FundamentalReviewLauncher.tsx");
const data = JSON.parse(read("../src/data/bmsMomentumRadarExpanded.json"));

assert.match(activity, /setOpen\(false\); onOpenExisting\(job\.symbol\)/, "A ready activity result must close the drawer and open the selected full FCS report.");
assert.doesNotMatch(activity, /openReport|FcsLifecycleSummary|setReport\(/, "The activity drawer must not render a second inline report.");
assert.match(activity, /Return to this company in Momentum Radar/, "A finished review without a report must offer a route back to the company in the radar.");
assert.match(activity, /Open company Deep Dive/, "A finished review without a report must offer the independent Deep Dive.");
assert.match(app, /onReturnToRadar=\{\(symbol\) => \{ setFcsActivitySymbol\(symbol\); openSignalTracker\('momentum'\); \}\}/, "The global activity control must carry the failed company's symbol into the radar.");
assert.match(tracker, /initialCompanySymbol && initialMode === "momentum"/, "The tracker must pass a selected activity symbol into the radar.");
assert.match(radar, /setQuery\(company\.symbol\)/, "The positive radar must focus the selected company.");
assert.match(radar, /setInactiveQuery\(company\.symbol\)/, "The negative and neutral radar must focus the selected company.");
assert.match(radar, /job\.resultAvailable && job\.status !== "incomplete" && job\.status !== "failed"[\s\S]*onBrowseLibrary\(job\.symbol\)/, "A ready activity card must open that company's full FCS report instead of only selecting its status.");
assert.match(radar, /aria-label=\{opensReport \? `Open \$\{job\.symbol\} FCS report` : `View \$\{job\.symbol\} review status`\}/, "Activity cards must explain whether they open a report or review status.");

const ready = data.companies.filter((company: any) => company.liquidity_gate?.qualified && company.data_status === "full_history");
const positive = ready.filter((company: any) => ["STARTING", "CONFIRMED", "EXTENDED"].includes(company.radar_state)).length;
const negative = ready.filter((company: any) => company.radar_state === "DETERIORATING").length;
const neutral = ready.filter((company: any) => company.radar_state === "DORMANT").length;
assert.equal(positive + negative + neutral, ready.length, "Every analysable fallback company must appear in exactly one directional bucket.");
assert.ok(positive > 0 && negative > 0 && neutral > 0, "The fallback snapshot must exercise positive, negative and neutral directions.");
assert.match(radar, /\["Active directional signals", `\$\{companies\.length \+ inactiveCounts\.deteriorating\}`/, "The headline must total positive and negative directional signals.");
assert.match(radar, /`\$\{companies\.length\} positive · \$\{inactiveCounts\.deteriorating\} negative`/, "The headline must explain its positive and negative split.");
assert.match(launcher, /Check Fundamental Change coverage/, "The library search must describe an availability check rather than promise universal generation.");
assert.match(launcher, /new review is offered only after deterministic preflight/i, "The availability boundary must be explained before a user searches.");
assert.match(launcher, /FCS evidence check incomplete/, "A blocked request must state that its evidence check is incomplete.");
assert.doesNotMatch(launcher, /No review requested in this session[\s\S]{0,500}typical processing time is 10–15 minutes/, "The idle state must not promise a processing time when no request is enabled or running.");

console.log("FCS UI closure verified: full-report routing, failed-review actions, focused radar return and complete directional-signal headline.");
