import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const radar = readFileSync(new URL("../src/components/MomentumRadar.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/components/FundamentalChangeLibrary.tsx", import.meta.url), "utf8");

assert.match(
  radar,
  /onClick=\{\(\) => onBrowseLibrary\(company\.symbol\)\}[^>]*>.*View FCS &amp; lifecycle/s,
  "A lifecycle-ready Radar row must open the selected company in the FCS Library.",
);
assert.match(
  radar,
  /onClick=\{\(\) => onBrowseLibrary\(company\.symbol\)\}[^>]*>View FCS review<\/button>/s,
  "An FCS-ready Radar row must open the selected company in the FCS Library.",
);

const livePublicationBranch = library.indexOf("if(selectedRecord?.livePublication)");
const staticDetailBranch = library.indexOf("if (selectedRecord && selectedDetail)");
assert.ok(livePublicationBranch >= 0, "The FCS Library must render live publications.");
assert.ok(staticDetailBranch >= 0, "The FCS Library must retain static detail support.");
assert.ok(
  livePublicationBranch < staticDetailBranch,
  "A live on-demand publication must take precedence over an older static detail record.",
);
assert.doesNotMatch(
  library,
  /fundamentalChangeLibrary\.find\(record=>record\.symbol===selectedSymbol\)\|\|selectedRecord/,
  "The selected merged record must not be replaced by a stale static record.",
);

console.log("Momentum Radar selected-company navigation and live-publication precedence passed.");
