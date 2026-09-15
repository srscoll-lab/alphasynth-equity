import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const root = "C:/Users/admin/Documents/ChatGPT/Alphasynth Intelligence/alphasynth-equity";
const skill = "C:/Users/admin/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const tmp = path.join(root, ".codex-final-walkthrough");
const output = path.join(root, "carousel-output", "AlphaSynth-Product-Walkthrough-Carousel-Final-v8.pptx");
const python = "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
process.env.RUNTIME_NODE ||= "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
process.env.RUNTIME_NODE_MODULES ||= "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
process.env.RUNTIME_BIN_DIR ||= "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override";
process.env.RUNTIME_PYTHON ||= python;

const { finalizePresentation } = await import(pathToFileURL(path.join(skill, "container_tools", "artifact_tool_utils.mjs")).href);
await fs.mkdir(tmp, { recursive: true });
await fs.mkdir(path.dirname(output), { recursive: true });

const deck = Presentation.create({ slideSize: { width: 1080, height: 1080 } });
const font = "Aptos";
const C = { bg: "#080D18", panel: "#111B2D", panel2: "#0D2430", white: "#F8FAFC", text: "#D4DDEA", muted: "#9EADC2", teal: "#27D9C8", gold: "#E7B640", line: "#33445F", red: "#F47777", green: "#67E0A1" };
const asset = (name) => path.join(root, "carousel-assets", "final-user-captures", name);
const pdfPage = path.join(root, "output", "pdf", "rendered", "page-2.png");

function shape(slide, geometry, left, top, width, height, fill = "none", line = "none", radius = 0) {
  return slide.shapes.add({ geometry, position: { left, top, width, height }, fill, line: { fill: line, width: line === "none" ? 0 : 1 }, ...(radius ? { borderRadius: radius } : {}) });
}
function txt(slide, value, left, top, width, height, size, color = C.white, bold = false, align = "left") {
  const box = shape(slide, "textbox", left, top, width, height);
  box.text = value;
  box.text.style = { typeface: font, fontSize: size, color, bold, autoFit: "none" };
  if (align !== "left") box.text.paragraphFormat = { alignment: align };
  return box;
}
function base(slide, number, title, subtitle = "") {
  slide.background.fill = C.bg;
  shape(slide, "rect", 56, 46, 70, 6, C.teal);
  txt(slide, "ALPHASYNTH PRODUCT WALKTHROUGH", 56, 66, 600, 25, 13, C.teal, true);
  txt(slide, title, 56, 102, 968, 66, 37, C.white, true);
  if (subtitle) txt(slide, subtitle, 56, 174, 968, 52, 18, C.text);
  txt(slide, "AlphaSynth Intelligence", 56, 1016, 320, 22, 12, C.muted);
  txt(slide, String(number).padStart(2, "0"), 950, 1016, 74, 22, 12, C.muted, true, "right");
}
async function screenshot(slide, file, top = 250, height = 700, alt = "AlphaSynth application screen") {
  const blob = await fs.readFile(file);
  const width = 968;
  shape(slide, "roundRect", 48, top - 8, 984, height + 16, "#0A1220", C.line, 13);
  return slide.images.add({ blob, contentType: "image/png", alt, fit: "contain", geometry: "rect", position: { left: 56, top, width, height } });
}
function caption(slide, heading, body) {
  txt(slide, heading, 72, 916, 280, 30, 16, C.gold, true);
  txt(slide, body, 352, 912, 656, 62, 17, C.text);
}
function notes(slide, value) { slide.speakerNotes.textFrame.setText(value); }
function stage(slide, name, body, left, top, accent = C.teal) {
  txt(slide, name, left, top, 170, 30, 18, accent, true);
  txt(slide, body, left, top + 37, 170, 68, 15, C.text);
}

// 1. Cover and boundaries
{
  const s = deck.slides.add(); s.background.fill = C.bg;
  shape(s, "rect", 70, 76, 88, 7, C.gold);
  txt(s, "ALPHASYNTH INTELLIGENCE", 70, 106, 610, 28, 16, C.gold, true);
  txt(s, "Business momentum with an evidence trail", 70, 215, 870, 130, 49, C.white, true);
  txt(s, "A product walkthrough for AI builders and market researchers", 70, 376, 850, 50, 24, C.teal, true);
  txt(s, "AlphaSynth monitors a 477-company BMS universe, explains why a signal appeared, checks later results and opens a broader company review when more research is needed.", 70, 478, 900, 125, 22, C.text);
  shape(s, "roundRect", 70, 682, 940, 158, C.panel2, C.teal, 16);
  txt(s, "What it does", 100, 712, 230, 28, 17, C.teal, true);
  txt(s, "Prioritises companies whose reported business momentum may deserve further research.", 100, 750, 390, 62, 17, C.white);
  txt(s, "Investment boundary", 550, 712, 280, 28, 17, C.gold, true);
  txt(s, "BMS does not generate entry or exit calls. Deep Dive may show traceable analyst targets or recommendations as attributed external views, not as AlphaSynth advice.", 550, 750, 390, 82, 17, C.white);
  txt(s, "Live pilot: expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app", 70, 925, 940, 34, 17, C.gold, true, "center");
  notes(s, "Opening. BMS itself does not generate trading calls. Deep Dive may aggregate traceable analyst targets and recommendations, which must remain attributed external views rather than AlphaSynth advice. The URL points to the current AlphaSynth pilot.");
}

// 2. Journey
{
  const s = deck.slides.add(); base(s, 2, "The research journey", "Each layer answers a separate question. A user can stop after any layer.");
  const items = [
    ["1", "Signal Tracker", "Which companies show a change in reported business momentum?"],
    ["2", "Evidence Report", "What inputs support the signal and where is the evidence incomplete?"],
    ["3", "Later Results", "Do subsequent results still support the earlier lifecycle reading?"],
    ["4", "Deep Dive", "What does a broader company, valuation and risk review reveal?"],
  ];
  items.forEach(([n, h, b], i) => {
    const top = 286 + i * 155;
    txt(s, n, 80, top, 64, 60, 38, i === 3 ? C.gold : C.teal, true, "center");
    txt(s, h, 180, top, 290, 40, 24, C.white, true);
    txt(s, b, 480, top, 500, 66, 18, C.text);
    if (i < 3) shape(s, "rect", 108, top + 82, 4, 55, C.line);
  });
  txt(s, "The 477-company BMS tracker and the broader on-demand Deep Dive have different coverage. A Deep Dive result does not create a BMS lifecycle by itself.", 90, 925, 900, 60, 18, C.gold, true, "center");
  notes(s, "The tracker, evidence workspace, later-results check and Deep Dive form one research journey. Coverage differs between the BMS tracker and the wider Deep Dive workflow.");
}

// 3. Tracker
{
  const s = deck.slides.add(); base(s, 3, "Signal Tracker", "A lifecycle filter and company list turn the universe into a research queue.");
  await screenshot(s, asset("01-signal-tracker-crop.png"), 245, 650, "Signal Tracker showing several Emerging companies and the selected ICICI AMC signal");
  caption(s, "What the user sees", "Several companies remain visible while the selected company shows its current BMS reading, change since the previous result and a plain-language research brief.");
  notes(s, "User-supplied live app capture from 15 September 2026. The redundant Research Signal action shown in this capture has been removed from the final code. Evidence Report and Deep Dive remain the two clear next actions.");
}

// 4. Evidence workspace
{
  const s = deck.slides.add(); base(s, 4, "Why this signal?", "The evidence workspace separates the recorded BMS score from the strength of evidence supporting it.");
  await screenshot(s, asset("02-evidence-report-crop.png"), 245, 650, "Signal Evidence Workspace with factors, periods, units and evidence confidence");
  caption(s, "Inspectable inputs", "Previous and current periods, rupee crore units, percentages and evidence confidence remain visible. Missing factors stay unavailable rather than becoming neutral scores.");
  notes(s, "User-supplied live app capture. Explain that score direction and evidence confidence answer different questions.");
}

// 5. Interpretation
{
  const s = deck.slides.add(); base(s, 5, "How to read the lifecycle", "A score describes the measured direction. A lifecycle describes how that evidence has behaved over successive results.");
  const stages = [
    ["WATCH", "A baseline or early reading"], ["EMERGING", "A positive inflection begins"],
    ["BUILDING", "More results or factors confirm it"], ["ESTABLISHED", "The improvement persists"],
    ["FADING", "Earlier momentum is weakening"],
  ];
  stages.forEach(([name, body], i) => stage(s, name, body, 55 + i * 202, 335, i === 4 ? C.gold : C.teal));
  shape(s, "rect", 82, 505, 916, 2, C.line);
  txt(s, "Score", 90, 585, 250, 38, 26, C.white, true);
  txt(s, "Direction within the factors that have comparable previous and current evidence.", 90, 635, 380, 90, 19, C.text);
  txt(s, "Evidence confidence", 570, 585, 360, 38, 26, C.white, true);
  txt(s, "Completeness, comparability and source quality. Medium confidence can accompany strong direction when only part of the model is populated.", 570, 635, 390, 115, 19, C.text);
  shape(s, "roundRect", 90, 824, 870, 100, C.panel2, C.teal, 14);
  txt(s, "N/A means no comparable evidence. It never means zero, neutral or poor performance.", 130, 854, 790, 42, 20, C.white, true, "center");
  notes(s, "Use this slide to explain the former 100 score and medium-confidence confusion. Direction and confidence must remain visibly separate.");
}

// 6. Later results and management memory
{
  const s = deck.slides.add(); base(s, 6, "Later results and management delivery", "The confirmation layer tests an earlier lifecycle without rewriting the historical record.");
  const steps = [
    ["Record", "Store the original lifecycle, period and supporting evidence."],
    ["Remember", "Save dated, measurable management commitments quarter by quarter."],
    ["Compare", "Check later reported outcomes against financial factors and matured commitments."],
    ["Qualify", "Raise, lower or defer today’s research priority according to evidence coverage."],
  ];
  steps.forEach(([h, b], i) => {
    const top = 300 + i * 150;
    txt(s, String(i + 1), 80, top, 70, 55, 34, i === 3 ? C.gold : C.teal, true, "center");
    txt(s, h, 185, top, 240, 34, 23, C.white, true);
    txt(s, b, 430, top, 530, 70, 18, C.text);
  });
  txt(s, "Management commentary records what was said. Management delivery checks what happened after the commitment matured.", 90, 925, 900, 52, 18, C.gold, true, "center");
  notes(s, "Management commentary and delivery remain separate but connected. The ledger needs at least three matured, verifiable commitments before producing a reliability score.");
}

// 7. One PDF sample
{
  const s = deck.slides.add(); base(s, 7, "Selective PDF output", "A downloadable report appears only when the evidence-readiness checks pass.");
  const blob = await fs.readFile(pdfPage);
  shape(s, "roundRect", 72, 248, 545, 714, "#FFFFFF", C.line, 10);
  s.images.add({ blob, contentType: "image/png", alt: "Sample AlphaSynth PDF page with the five-factor evidence bridge", fit: "contain", geometry: "rect", position: { left: 80, top: 256, width: 529, height: 698 } });
  txt(s, "What this page demonstrates", 670, 300, 330, 34, 20, C.teal, true);
  txt(s, "The five BMS factors\n\nPrevious and current evidence\n\nFactor weight and evidence confidence\n\nUnavailable evidence shown honestly", 670, 370, 330, 280, 19, C.white);
  shape(s, "roundRect", 660, 720, 350, 120, C.panel2, C.gold, 14);
  txt(s, "When evidence is too thin, the on-screen report remains available but the PDF is withheld.", 690, 750, 290, 62, 18, C.gold, true, "center");
  notes(s, "This is the only PDF sample in the carousel. The PDF remains a selective output, not the main product experience.");
}

// 8. Deep Dive entry
{
  const s = deck.slides.add(); base(s, 8, "Deep Dive handoff", "The chosen company carries from the BMS tracker into the broader AlphaSynth research workflow.");
  await screenshot(s, asset("03-deep-dive-entry-crop.png"), 245, 650, "Deep Dive entry screen with ICICI AMC selected from BMS");
  caption(s, "A deliberate next step", "The user decides whether the signal deserves a fuller company review. Deep Dive covers a broader universe, including additional small and mid-cap companies when data is available.");
  notes(s, "User-supplied live app capture. Deep Dive coverage exceeds the 477-company BMS universe, but the research result does not itself assign a BMS lifecycle.");
}

// 9. Deep Dive and BMS confirmation
{
  const s = deck.slides.add(); base(s, 9, "Broader company review", "The full report adds company context, risks and an independent check against the recorded BMS direction.");
  await screenshot(s, asset("08-bms-deep-dive-confirmation-crop.png"), 245, 650, "Deep Dive result with BMS momentum confirmation and risk panels");
  caption(s, "Two readings stay separate", "BMS preserves the multi-quarter momentum record. Deep Dive examines the company using the latest evidence and states whether that evidence supports or challenges the earlier direction.");
  notes(s, "User-supplied live app capture. The code now uses plainer research-review terminology and removes unsupported decorative metrics.");
}

// 10. Earnings intelligence
{
  const s = deck.slides.add(); base(s, 10, "Earnings and management commentary", "The earnings view brings quarterly results, management statements and analyst questions into one review.");
  await screenshot(s, asset("05-earnings-intelligence-crop.png"), 245, 650, "Earnings Intelligence screen for ICICI AMC");
  caption(s, "A history-dependent score", "Management reliability should appear only after enough dated commitments have matured and can be checked against reported outcomes. Otherwise the app shows insufficient history.");
  notes(s, "User-supplied live app capture. Do not interpret a single call or quarter as a management reliability record.");
}

// 11. Explain the move
{
  const s = deck.slides.add(); base(s, 11, "Explain the Move", "This research view asks what public catalysts and market context may explain a recent price move.");
  await screenshot(s, asset("06-explain-the-move-crop.png"), 255, 590, "Explain the Move report summary for ICICI AMC");
  caption(s, "Evidence before labels", "The final code removes the previous fixed RSI, delivery-ratio and breakout cards. The screen now relies on retrieved report evidence instead of reusable placeholder values.");
  notes(s, "User-supplied capture cropped before the obsolete fixed metric cards. Those cards were not company-specific and have been removed from the application.");
}

// 12. Filings
{
  const s = deck.slides.add(); base(s, 12, "Filings and management commentary", "The filings view reviews dated disclosures and tracks whether management language changes over time.");
  const checks = [
    ["Transcript clarity", "Did management answer material analyst questions directly?", C.teal],
    ["Disclosure completeness", "Are the required facts and periods available in dated filings?", C.green],
    ["Guidance realism", "Are outlook statements measurable and consistent with later outcomes?", C.gold],
    ["Governance evidence", "What do dated filings support—and what remains unverified?", C.red],
  ];
  checks.forEach(([heading, body, accent], index) => {
    const left = index % 2 === 0 ? 70 : 565;
    const top = index < 2 ? 300 : 545;
    shape(s, "roundRect", left, top, 445, 190, C.panel, C.line, 16);
    shape(s, "rect", left, top, 7, 190, accent);
    txt(s, heading, left + 30, top + 28, 380, 34, 22, accent, true);
    txt(s, body, left + 30, top + 80, 370, 75, 18, C.text);
  });
  shape(s, "roundRect", 100, 810, 880, 105, C.panel2, C.teal, 14);
  txt(s, "Missing evidence remains unavailable. The app does not turn a missing disclosure into a favourable or neutral score.", 145, 837, 790, 55, 20, C.white, true, "center");
  notes(s, "The supplied filing screenshot used older technical terminology, so this slide presents the final user-facing labels directly. Replace it with a fresh live capture after the corrected build is deployed.");
}

// 13. Withholding and demo close
{
  const s = deck.slides.add(); base(s, 13, "When AlphaSynth withholds a report", "A successful workflow can still decide that the evidence is not strong enough for a downloadable PDF.");
  txt(s, "On-screen evidence report", 75, 300, 410, 42, 27, C.teal, true);
  txt(s, "Available when the workflow has enough evidence to explain what it found and what remains missing.", 75, 365, 410, 105, 20, C.text);
  txt(s, "Downloadable PDF", 595, 300, 410, 42, 27, C.gold, true);
  txt(s, "Available only after stricter checks for official sources, supported claims, narrative coverage, comparable BMS factors and later-results evidence.", 595, 365, 410, 140, 20, C.text);
  shape(s, "rect", 75, 565, 930, 2, C.line);
  txt(s, "Bounded validation cohort", 75, 640, 400, 36, 22, C.white, true);
  txt(s, "24 of 25 workflows completed. Only 2 of 25 met the stricter PDF-readiness standard. Withholding the other PDFs was an intended safety result.", 75, 695, 910, 105, 22, C.text);
  shape(s, "roundRect", 100, 875, 880, 70, C.panel2, C.teal, 14);
  txt(s, "Live pilot: expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app", 130, 895, 820, 32, 18, C.white, true, "center");
  notes(s, "Close with a live demonstration rather than a separate ready-for-peer-review claim. The cohort measured workflow completion and evidence readiness, not investment performance.");
}

const candidate = path.join(tmp, "candidate-v8.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidate);
if (await fs.access(output).then(() => true).catch(() => false)) throw new Error(`Refusing to overwrite ${output}`);
await finalizePresentation({
  explicitTotalSlideCount: 13,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  materializeLiteralChartWorkbooks: false,
  workspaceDir: root,
  candidatePath: candidate,
  finalPath: output,
  pythonExecutable: python,
  integrityValidatorPath: path.join(skill, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skill, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "10287000,10287000", "--validate-bullet-geometry", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(tmp, "AlphaSynth-Product-Walkthrough-Carousel-Final-v8.validation.json"),
});
console.log(JSON.stringify({ output, slides: deck.slides.items.length }, null, 2));
