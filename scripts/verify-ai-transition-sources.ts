import assert from "node:assert/strict";
import { discoverOfficialDisclosures, isOfficialDisclosureUrl, isWithinStudyWindow } from "../src/ai-transition-sources";

const html = `
  <a href="/investors/q3/transcript.pdf">Q3 Earnings Call Transcript</a>
  <a href="https://company.example/investors/fy24-annual-report.pdf">Integrated Annual Report FY24</a>
  <a href="https://unverified.example/transcript.pdf">Transcript mirror</a>
  <a href="/solutions/corporate-treasury-exchange">Corporate Treasury Exchange</a>
  <a href="/investors/media-release-product-launch.pdf">Media Release - Product Launch</a>
  <a href="/careers">Careers</a>
`;
const links = discoverOfficialDisclosures(html, "https://company.example/investors", ["company.example"]);
assert.equal(links.length, 2);
assert.equal(links[0].sourceType, "earnings_transcript");
assert.equal(links[1].sourceType, "annual_report");
assert.equal(isOfficialDisclosureUrl("https://media.company.example/file.pdf", ["company.example"]), true);
assert.equal(isOfficialDisclosureUrl("https://company.example.attacker.test/file.pdf", ["company.example"]), false);
assert.equal(isWithinStudyWindow("Q3 FY24 earnings transcript", 2023), true);
assert.equal(isWithinStudyWindow("Annual report 2021-2022", 2023), false);
console.log("AI transition source discovery verification passed.");
