import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const root = "C:/Users/admin/Documents/ChatGPT/Alphasynth Intelligence/alphasynth-equity";
const skill = "C:/Users/admin/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const tmp = path.join(root, ".codex-carousel-walkthrough-v2");
const output = path.join(root, "carousel-output", "AlphaSynth-Product-Walkthrough-Carousel-v2.pptx");
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
const C = { bg: "#080D18", panel: "#111B2D", panel2: "#0C2430", white: "#F8FAFC", text: "#D3DCE8", muted: "#A8B6C9", teal: "#25D7C8", gold: "#E7B640", line: "#30415C", red: "#F47777", green: "#5FE09B" };
const p = (...x) => path.join(root, ...x);
const trackerTop = p("carousel-assets", "walkthrough-v2", "01-tracker-radico-top.png");
const trackerDetail = p("carousel-assets", "walkthrough-v2", "02-radico-signal-detail.png");
const deepEntry = p("carousel-assets", "screenshots", "deep-dive-entry.png");
const deepResult = p("carousel-assets", "screenshots", "deep-dive-result.png");
const pdf = n => p("output", "pdf", "rendered", `page-${n}.png`);

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
  shape(slide, "rect", 56, 48, 66, 6, C.teal);
  txt(slide, "ALPHASYNTH PRODUCT WALKTHROUGH", 56, 68, 700, 24, 13, C.teal, true);
  txt(slide, title, 56, 105, 930, 72, 39, C.white, true);
  if (subtitle) txt(slide, subtitle, 56, 184, 930, 54, 19, C.text);
  txt(slide, "AlphaSynth Intelligence", 56, 1010, 300, 22, 12, C.muted);
  txt(slide, String(number).padStart(2, "0"), 960, 1010, 64, 22, 12, C.muted, true, "right");
}
function notes(slide, value) { slide.speakerNotes.textFrame.setText(value); }
async function img(slide, file, position, alt) {
  const blob = await fs.readFile(file);
  shape(slide, "roundRect", position.left - 8, position.top - 8, position.width + 16, position.height + 16, "#0B1220", C.line, 12);
  return slide.images.add({ blob, contentType: "image/png", alt, fit: "contain", geometry: "rect", position });
}
function tag(slide, value, left, top, width, color = C.teal) {
  shape(slide, "roundRect", left, top, width, 38, C.panel, color, 10);
  txt(slide, value, left + 10, top + 6, width - 20, 25, 13, color, true, "center");
}
function point(slide, n, heading, body, left, top, width) {
  shape(slide, "ellipse", left, top + 2, 42, 42, C.gold);
  txt(slide, String(n), left, top + 8, 42, 24, 15, C.bg, true, "center");
  txt(slide, heading, left + 60, top, width - 60, 30, 19, C.white, true);
  txt(slide, body, left + 60, top + 34, width - 60, 58, 16, C.text);
}

// 1. Minimal cover
{
  const s = deck.slides.add(); s.background.fill = C.bg;
  shape(s, "rect", 70, 82, 86, 7, C.gold);
  txt(s, "ALPHASYNTH INTELLIGENCE", 70, 112, 600, 30, 16, C.gold, true);
  txt(s, "Find business change\nbefore it becomes obvious", 70, 225, 860, 190, 52, C.white, true);
  txt(s, "A guided product walkthrough", 70, 468, 720, 48, 27, C.teal, true);
  txt(s, "From a monitored momentum signal to its evidence trail, later-results check and full company Deep Dive.", 70, 548, 815, 96, 22, C.text);
  shape(s, "roundRect", 70, 740, 940, 120, C.panel2, C.teal, 16);
  txt(s, "477-company BMS tracker", 100, 768, 270, 30, 18, C.white, true);
  txt(s, "Evidence-first explanation", 405, 768, 280, 30, 18, C.white, true);
  txt(s, "Broader on-demand Deep Dive", 712, 768, 270, 30, 18, C.white, true);
  txt(s, "Research aid only · no buy/sell recommendation · verify material claims against cited filings", 70, 930, 940, 40, 16, C.gold, true, "center");
  notes(s, "Opening slide for AI peers and market users. AlphaSynth is a research workflow, not a prediction claim or investment recommendation. The presentation notes are presenter prompts, not an embedded voice-over.");
}

// 2. User journey
{
  const s = deck.slides.add(); base(s, 2, "The product has one simple research journey", "Each layer answers a different question. The user can stop as soon as they have enough evidence.");
  const items = [
    ["1", "FIND", "Which company’s business momentum is changing?"],
    ["2", "EXPLAIN", "What evidence produced the lifecycle and score?"],
    ["3", "CONFIRM", "Do later results support the earlier reading?"],
    ["4", "INVESTIGATE", "What does a fuller company review reveal?"],
  ];
  items.forEach(([n,h,b],i) => {
    const top = 300 + i * 155;
    shape(s, "roundRect", 105, top, 870, 116, i === 3 ? "#1C221F" : C.panel, i === 3 ? C.gold : C.line, 16);
    shape(s, "ellipse", 135, top + 31, 54, 54, i === 3 ? C.gold : C.teal);
    txt(s, n, 135, top + 43, 54, 28, 17, C.bg, true, "center");
    txt(s, h, 225, top + 22, 230, 34, 22, C.white, true);
    txt(s, b, 225, top + 61, 700, 38, 18, C.text);
  });
  notes(s, "The four layers are Signal Tracker, Evidence Report, later-results confirmation, and Deep Dive. PDF is an optional output within the evidence layer, not a required step for every company.");
}

// 3. Complete tracker capture
{
  const s = deck.slides.add(); base(s, 3, "Start with the monitored BMS universe", "A complete screen capture: choose a lifecycle, search a company and see the current momentum snapshot.");
  await img(s, trackerTop, { left: 56, top: 270, width: 968, height: 545 }, "Complete Signal Tracker screen with RADICO selected");
  tag(s, "477 MONITORED COMPANIES", 56, 858, 265, C.gold);
  txt(s, "The tracker is a research queue, not a ranking of investment attractiveness.", 350, 860, 674, 36, 18, C.white, true);
  txt(s, "Lifecycle describes how business momentum has evolved through successive results.", 350, 906, 674, 42, 17, C.text);
  notes(s, "Live pilot capture from 15 September 2026. The 477-company count refers specifically to the monitored BMS universe.");
}

// 4. Complete signal/action capture
{
  const s = deck.slides.add(); base(s, 4, "Read the signal, then choose the next depth", "The lower part of the selected-company screen shows the human interpretation and the three research actions.");
  await img(s, trackerDetail, { left: 56, top: 270, width: 968, height: 545 }, "Complete lower Signal Tracker screen showing research actions");
  point(s, 1, "Research Signal", "Understand what changed and what would change the signal again.", 56, 855, 300);
  point(s, 2, "Evidence Report", "Open the supporting factors, confidence and confirmation checks.", 382, 855, 300);
  point(s, 3, "Deep Dive", "Move into a broader company, valuation and risk review.", 708, 855, 316);
  notes(s, "Live pilot capture from 15 September 2026. The Evidence Report and Deep Dive are separate layers; the tracker remains deliberately concise.");
}

// 5. Lifecycle method
{
  const s = deck.slides.add(); base(s, 5, "Lifecycle adds history to a single score", "One result can create a signal. Repeated evidence shows whether it broadens, persists or fades.");
  const rows = [
    ["WATCH", "First evidence; establish a baseline"], ["EMERGING", "A positive inflection begins"],
    ["BUILDING", "More factors or periods confirm it"], ["ESTABLISHED", "Improvement persists through results"],
    ["FADING", "Earlier momentum is weakening"],
  ];
  rows.forEach(([h,b],i) => {
    const top = 292 + i * 124;
    shape(s, "roundRect", 90, top, 900, 92, i === 4 ? "#27191E" : C.panel, i === 4 ? C.red : C.line, 14);
    txt(s, String(i + 1).padStart(2,"0"), 118, top + 27, 52, 26, 15, i === 4 ? C.red : C.teal, true);
    txt(s, h, 205, top + 19, 260, 38, 24, C.white, true);
    txt(s, b, 485, top + 24, 455, 34, 18, C.text);
  });
  txt(s, "Lifecycle is not company quality, valuation, price direction or a buy/sell view.", 90, 940, 900, 36, 18, C.gold, true, "center");
  notes(s, "Lifecycle is the time-based history of the BMS reading. It must stay separate from valuation and investment recommendations.");
}

// 6-11. One complete PDF page per slide
const pdfSlides = [
  [6, "A selective PDF begins with the decision context", "The cover preserves the recorded lifecycle, evidence coverage, central watch item and research-readiness status.", 1, [
    ["Recorded history", "The original BMS V1 lifecycle remains auditable."], ["Evidence coverage", "Sources and supported claims are counted."], ["Visible uncertainty", "A watch item is shown rather than concealed."]]],
  [7, "Score and confidence answer different questions", "The factor score measures direction within available comparisons. Confidence measures how complete that evidence is.", 2, [
    ["100 / 100", "Strong measured momentum in the factors supplied."], ["Medium confidence", "Only part of the five-factor model is comparable."], ["N/A stays N/A", "Missing evidence is never converted into zero or neutral."]]],
  [8, "Financial evidence makes the comparison inspectable", "The report shows prices, quarterly financials and the periods used for comparison — with explicit units.", 3, [
    ["Comparable periods", "Previous and current readings are labelled."], ["Explicit units", "₹ crore, percentages, EPS and score /100."], ["Source-linked", "Quantitative inputs remain traceable to their source."]]],
  [9, "Later results test the earlier lifecycle", "After a lifecycle is recorded, subsequent evidence checks whether that earlier reading still appears valid.", 4, [
    ["Preserve", "Do not rewrite the historical classification."], ["Compare", "Test delivery and business-quality evidence."], ["Prioritise", "Raise, lower or defer today’s research priority."]]],
  [10, "Management claims need memory before they need a score", "A statement becomes useful only when it is dated, measurable, remembered and checked against a later outcome.", 5, [
    ["Record", "Capture a measurable commitment and source."], ["Mature", "Wait until the target date or outcome exists."], ["Verify", "Assess delivery, revision discipline and disclosure quality."]]],
  [11, "The methodology preserves the source trail", "The final page explains the method, limitations and source register so the conclusion can be challenged.", 6, [
    ["Official-first", "Company and exchange evidence lead admission."], ["Bounded fallbacks", "Alternative evidence is labelled and constrained."], ["No invention", "Unknown or incomplete evidence remains visible."]]],
];
for (const [num,title,subtitle,page,bullets] of pdfSlides) {
  const s = deck.slides.add(); base(s, num, title, subtitle);
  await img(s, pdf(page), { left: 70, top: 270, width: 520, height: 690 }, `Complete page ${page} of the AlphaSynth sample evidence dossier`);
  tag(s, `SAMPLE PDF · PAGE ${page}`, 650, 290, 280, page === 4 ? C.gold : C.teal);
  bullets.forEach(([h,b],i) => point(s, i + 1, h, b, 650, 380 + i * 155, 350));
  txt(s, page === 1 ? "PDF appears only when report-readiness checks pass." : "Complete page shown without cropping.", 650, 880, 350, 52, 17, C.gold, true);
  notes(s, `Complete page ${page} of the generated RADICO professional dossier sample, September 2026. No portion of the page has been cropped.`);
}

// 12. Deep Dive entry
{
  const s = deck.slides.add(); base(s, 12, "Deep Dive begins with a deliberate handoff", "The selected company carries from the BMS experience into the broader research workflow.");
  await img(s, deepEntry, { left: 86, top: 260, width: 908, height: 724 }, "Complete Deep Dive entry screen for RADICO");
  tag(s, "SELECT COMPANY", 115, 892, 190, C.gold);
  txt(s, "The user initiates the fuller analysis only when the signal deserves additional work.", 335, 895, 620, 40, 17, C.white, true);
  notes(s, "Complete live pilot capture from 15 September 2026. Deep Dive is a deliberate next action, not an automatic claim attached to every signal.");
}

// 13. Deep Dive result
{
  const s = deck.slides.add(); base(s, 13, "Deep Dive returns a broader company review", "The output adds an executive narrative, quantitative scoring and risk identification beyond the concise tracker.");
  await img(s, deepResult, { left: 86, top: 260, width: 908, height: 724 }, "Complete Deep Dive result screen for RADICO");
  tag(s, "BROADER ON-DEMAND COVERAGE", 115, 892, 300, C.teal);
  txt(s, "Additional small and mid caps may be researched subject to data availability. Deep Dive coverage does not itself confer a BMS lifecycle.", 445, 886, 515, 58, 16, C.text);
  notes(s, "Complete live pilot capture from 15 September 2026. The on-demand Deep Dive universe is broader than the 477-company BMS tracker; those two coverage claims must not be conflated.");
}

// 14. Validation and close
{
  const s = deck.slides.add(); base(s, 14, "Finish with evidence discipline, not more claims", "The build is ready for demonstration when the workflow completes reliably and weak evidence is stopped visibly.");
  shape(s, "roundRect", 72, 285, 438, 235, C.panel2, C.teal, 18);
  txt(s, "24 of 25", 102, 320, 250, 70, 46, C.teal, true);
  txt(s, "Evidence workflows completed in the bounded validation cohort.", 102, 405, 360, 70, 18, C.white, true);
  shape(s, "roundRect", 570, 285, 438, 235, C.panel, C.gold, 18);
  txt(s, "2 of 25", 600, 320, 250, 70, 46, C.gold, true);
  txt(s, "Met the stricter standard for a downloadable full PDF.", 600, 405, 360, 70, 18, C.white, true);
  txt(s, "WHAT THIS PROVES", 72, 610, 300, 28, 15, C.teal, true);
  txt(s, "The workflow can finish, expose limitations, and selectively withhold a report when evidence is too thin.", 72, 652, 925, 70, 23, C.white, true);
  txt(s, "WHAT THIS DOES NOT PROVE", 72, 770, 330, 28, 15, C.gold, true);
  txt(s, "It is not predictive-accuracy evidence and it does not replace due diligence or provide an investment recommendation.", 72, 812, 925, 70, 20, C.text);
  shape(s, "roundRect", 180, 925, 720, 58, "#0B2928", C.teal, 14);
  txt(s, "expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app", 200, 940, 680, 28, 17, C.white, true, "center");
  notes(s, "Closing slide. The bounded cohort measured technical completion and report readiness, not stock-return prediction. Suggested live demo: select a lifecycle, choose a company, open Evidence Report, then open Deep Dive.");
}

const candidate = path.join(tmp, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidate);
if (await fs.access(output).then(() => true).catch(() => false)) throw new Error(`Refusing to overwrite ${output}`);
await finalizePresentation({
  explicitTotalSlideCount: 14,
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
  receiptPath: path.join(tmp, "AlphaSynth-Product-Walkthrough-Carousel-v2.validation.json"),
});
console.log(JSON.stringify({ output, slides: deck.slides.items.length }, null, 2));
