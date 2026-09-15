import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:\\Users\\admin\\Documents\\ChatGPT\\Alphasynth Intelligence\\alphasynth-equity";
const SKILL_DIR = "C:\\Users\\admin\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.909.12148\\skills\\presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-carousel-walkthrough");
const FINAL_PPTX = path.join(workspaceDir, "carousel-output", "AlphaSynth-Product-Walkthrough-Carousel-v1.pptx");
const RUNTIME_PYTHON = "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
process.env.RUNTIME_NODE ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
process.env.RUNTIME_NODE_MODULES ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
process.env.RUNTIME_BIN_DIR ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\bin\\override";
process.env.RUNTIME_PYTHON ||= RUNTIME_PYTHON;

const { finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const font = "Aptos";
const deck = Presentation.create({ slideSize: { width: 1080, height: 1080 } });
const C = {
  navy: "#080D18", navy2: "#101A2C", white: "#F7F9FC", text: "#CBD5E1",
  muted: "#8FA0B7", teal: "#22D3C5", teal2: "#0E776F", gold: "#E3B341",
  line: "#2A3952", panel: "#121E31", red: "#F87171", green: "#4ADE80",
};

const asset = (...parts) => path.join(workspaceDir, ...parts);
const liveTracker = asset("carousel-assets", "screenshots", "signal-tracker-radico.png");
const deepEntry = asset("carousel-assets", "screenshots", "deep-dive-entry.png");
const deepResult = asset("carousel-assets", "screenshots", "deep-dive-result.png");
const pdf = n => asset("output", "pdf", "rendered", `page-${n}.png`);

function shape(slide, geometry, left, top, width, height, fill = "none", line = "none", radius) {
  return slide.shapes.add({ geometry, position: { left, top, width, height }, fill,
    line: { fill: line, width: line === "none" ? 0 : 1 }, ...(radius ? { borderRadius: radius } : {}) });
}
function text(slide, value, left, top, width, height, size, color = C.white, bold = false, align = "left") {
  const box = shape(slide, "textbox", left, top, width, height);
  box.text = value;
  box.text.style = { typeface: font, fontSize: size, color, bold, autoFit: "none" };
  if (align !== "left") box.text.paragraphFormat = { alignment: align };
  return box;
}
function base(slide, number, title, kicker = "ALPHASYNTH PRODUCT WALKTHROUGH") {
  slide.background.fill = C.navy;
  shape(slide, "rect", 56, 54, 70, 6, C.teal);
  text(slide, kicker, 56, 72, 740, 28, 14, C.teal, true);
  text(slide, title, 56, 111, 920, 90, 42, C.white, true);
  text(slide, String(number).padStart(2, "0"), 956, 1000, 68, 26, 13, C.muted, true, "right");
  text(slide, "AlphaSynth Intelligence", 56, 1000, 300, 26, 13, C.muted);
}
function note(slide, value) { slide.speakerNotes.textFrame.setText(value); }
async function image(slide, file, pos, opts = {}) {
  const bytes = await fs.readFile(file);
  return slide.images.add({ blob: bytes, contentType: "image/png", alt: opts.alt || "AlphaSynth product screen",
    fit: opts.fit || "cover", crop: opts.crop, geometry: opts.geometry || "roundRect",
    borderRadius: opts.borderRadius || "rounded-xl", position: pos });
}
function chip(slide, value, left, top, width, color = C.teal) {
  shape(slide, "roundRect", left, top, width, 42, C.panel, color, 12);
  text(slide, value, left + 12, top + 7, width - 24, 28, 14, color, true, "center");
}
function callout(slide, num, heading, body, left, top, width) {
  shape(slide, "roundRect", left, top, width, 130, C.panel, C.line, 14);
  shape(slide, "ellipse", left + 18, top + 20, 42, 42, C.gold);
  text(slide, String(num), left + 18, top + 25, 42, 26, 15, C.navy, true, "center");
  text(slide, heading, left + 76, top + 17, width - 94, 32, 20, C.white, true);
  text(slide, body, left + 76, top + 54, width - 94, 60, 16, C.text);
}

// 1 — product in one view
{
  const s = deck.slides.add(); s.background.fill = C.navy;
  await image(s, liveTracker, { left: 390, top: 0, width: 690, height: 1080 }, { crop: { left: 0.15, top: 0, right: 0, bottom: 0.03 } });
  shape(s, "rect", 0, 0, 485, 1080, "#08101D");
  shape(s, "rect", 58, 92, 72, 7, C.gold);
  text(s, "ALPHASYNTH INTELLIGENCE", 58, 118, 370, 32, 15, C.gold, true);
  text(s, "Find business change\nbefore it becomes obvious", 58, 210, 390, 210, 46, C.white, true);
  text(s, "A live research workflow that tracks fundamental momentum, preserves the evidence and opens a deeper company review.", 58, 470, 370, 118, 20, C.text);
  text(s, "WHAT IT DOES", 58, 658, 250, 28, 14, C.teal, true);
  text(s, "Prioritises where further research may be worthwhile.", 58, 692, 370, 68, 19, C.white, true);
  text(s, "WHAT IT DOES NOT CLAIM", 58, 810, 300, 28, 14, C.gold, true);
  text(s, "It does not predict multibaggers, replace due diligence or recommend trades.", 58, 844, 370, 84, 18, C.text);
  note(s, "Opening message for both peer developers and market users. The right side is a live AlphaSynth Signal Tracker capture from 15 September 2026. The text below each slide in PowerPoint is a presenter note, not a voice-over track. Source: live pilot URL, captured 2026-09-15.");
}

// 2 — tracker experience
{
  const s = deck.slides.add(); base(s, 2, "Start with a monitored signal universe");
  text(s, "The tracker turns 477 company histories into a compact research queue.", 56, 205, 930, 42, 21, C.text);
  await image(s, liveTracker, { left: 56, top: 278, width: 968, height: 576 }, { crop: { left: 0, top: 0.03, right: 0, bottom: 0.21 } });
  callout(s, 1, "Choose a lifecycle", "Watch, Emerging, Building, Established or Fading.", 56, 874, 300);
  callout(s, 2, "Inspect the signal", "Read the score, direction, evidence maturity and market context.", 378, 874, 330);
  callout(s, 3, "Choose the next action", "Open the evidence report or move into Deep Dive.", 730, 874, 294);
  note(s, "Live Signal Tracker capture, RADICO selected, 15 September 2026. The 477-company number refers to the monitored BMS universe, not the broader on-demand Deep Dive search universe.");
}

// 3 — lifecycle
{
  const s = deck.slides.add(); base(s, 3, "Lifecycle adds time to the score");
  text(s, "One quarter can create a signal. Repeated evidence determines whether it broadens, persists or fades.", 56, 215, 930, 56, 22, C.text);
  const rows = [
    ["WATCH", "First evidence; gather a baseline"], ["EMERGING", "A new positive inflection appears"],
    ["BUILDING", "More factors and periods confirm it"], ["ESTABLISHED", "Improvement persists across results"],
    ["FADING", "The earlier momentum is weakening"],
  ];
  rows.forEach(([head, body], i) => {
    const top = 325 + i * 118;
    shape(s, "roundRect", 66, top, 930, 88, i === 4 ? "#241A20" : C.panel, i === 4 ? C.red : C.line, 14);
    text(s, String(i + 1).padStart(2, "0"), 88, top + 24, 58, 32, 16, i === 4 ? C.red : C.teal, true);
    text(s, head, 170, top + 19, 270, 42, 26, C.white, true);
    text(s, body, 458, top + 23, 500, 36, 19, C.text);
  });
  text(s, "Lifecycle describes business-momentum history — not company quality, valuation or a buy/sell view.", 66, 942, 930, 42, 18, C.gold, true);
  note(s, "Lifecycle is a time-based classification layered on the current BMS reading. It remains separate from valuation and investment recommendations.");
}

// 4 — evidence report
{
  const s = deck.slides.add(); base(s, 4, "Open ‘Why this signal?’ for the evidence trail");
  text(s, "The main tracker stays concise. The evidence layer explains what the score means and what remains uncertain.", 56, 212, 925, 62, 21, C.text);
  await image(s, pdf(1), { left: 70, top: 305, width: 455, height: 640 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  text(s, "THE USER CAN SEE", 590, 330, 360, 30, 15, C.gold, true);
  [
    ["Recorded lifecycle", "The original BMS V1 state is preserved as history."],
    ["Evidence coverage", "Official sources and supported claims are counted."],
    ["Principal watch item", "The report surfaces uncertainty rather than hiding it."],
    ["Research readiness", "The on-screen layer can remain useful even when a PDF is withheld."],
  ].forEach(([h,b],i)=>{ const top=385+i*130; shape(s,"rect",590,top,7,92,i===2?C.gold:C.teal); text(s,h,620,top,370,34,21,C.white,true); text(s,b,620,top+39,370,52,17,C.text); });
  note(s, "The screenshot is page 1 of the generated RADICO evidence dossier. In the live application the same information is reached through View Evidence Report. Missing evidence remains visible; it is not backfilled with invented values. Source: generated sample dossier, September 2026.");
}

// 5 — factor anatomy
{
  const s = deck.slides.add(); base(s, 5, "See how the score was formed — and how confident it is");
  text(s, "Score describes the measured direction. Confidence describes evidence completeness. They answer different questions.", 56, 210, 930, 58, 21, C.text);
  await image(s, pdf(2), { left: 55, top: 294, width: 648, height: 650 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  chip(s, "SCORE ≠ CONFIDENCE", 745, 330, 280, C.gold);
  text(s, "100", 745, 408, 220, 66, 48, C.teal, true);
  text(s, "Momentum score", 745, 474, 250, 30, 16, C.white, true);
  text(s, "A strong change reading in the available comparison.", 745, 510, 270, 72, 18, C.text);
  text(s, "MEDIUM", 745, 635, 260, 54, 34, C.gold, true);
  text(s, "Evidence confidence", 745, 692, 250, 30, 16, C.white, true);
  text(s, "Some required factors are not yet comparable. N/A is not treated as zero or neutral.", 745, 728, 270, 105, 18, C.text);
  text(s, "Units stay explicit: ₹ crore, %, EPS and score /100.", 745, 882, 275, 48, 17, C.teal, true);
  note(s, "Generated RADICO dossier, page 2. The apparent 100 versus medium-confidence tension is intentional: the first measures momentum in the supplied comparable factors; the second states how complete the evidence set is. Source: generated sample dossier, September 2026.");
}

// 6 — later-results confirmation
{
  const s = deck.slides.add(); base(s, 6, "Later results test whether the earlier lifecycle still holds");
  text(s, "The historical lifecycle is preserved. New results change today’s research priority, not yesterday’s record.", 56, 210, 930, 58, 21, C.text);
  await image(s, pdf(4), { left: 58, top: 294, width: 600, height: 660 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  callout(s, 1, "Compare delivery", "Previous reading versus the next published result.", 696, 320, 328);
  callout(s, 2, "Check business quality", "Financial resilience, governance, operating discipline and allocation.", 696, 475, 328);
  callout(s, 3, "Set research priority", "Qualified, caution, not qualified or more evidence needed.", 696, 630, 328);
  text(s, "This is confirmation — not retrospective rewriting.", 696, 820, 310, 62, 20, C.gold, true);
  note(s, "Generated RADICO dossier, page 4. The confirmation overlay compares subsequent published evidence with the recorded lifecycle. It can raise or lower research priority while preserving the original classification as an auditable historical record.");
}

// 7 — management memory
{
  const s = deck.slides.add(); base(s, 7, "Management commentary becomes evidence only when remembered");
  text(s, "AlphaSynth separates what management says now from whether earlier measurable commitments were delivered.", 56, 208, 930, 62, 21, C.text);
  await image(s, pdf(5), { left: 56, top: 294, width: 560, height: 650 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  const steps = [
    ["1", "Record", "Capture a dated, measurable commitment."],
    ["2", "Wait", "Keep it pending until its target date."],
    ["3", "Verify", "Compare the reported outcome and any revisions."],
    ["4", "Score", "Create a reliability band only after enough commitments mature."],
  ];
  steps.forEach(([n,h,b],i)=>{ const top=315+i*142; shape(s,"ellipse",665,top,48,48,i===3?C.gold:C.teal); text(s,n,665,top+7,48,28,16,C.navy,true,"center"); text(s,h,735,top-1,250,32,21,C.white,true); text(s,b,735,top+36,270,66,17,C.text); });
  text(s, "‘Insufficient history’ is a valid outcome. Unknown never becomes a pass.", 665, 895, 340, 58, 18, C.gold, true);
  note(s, "Generated RADICO dossier, page 5, alongside the implemented management-guidance ledger methodology. Commentary and delivery are related but separate: commentary records tone and commitments; delivery scores only matured commitments with verifiable outcomes.");
}

// 8 — deep dive
{
  const s = deck.slides.add(); base(s, 8, "Move from a signal to a full company Deep Dive");
  text(s, "The Signal Tracker finds where to look. Deep Dive investigates valuation, sector, earnings, ownership and risks.", 56, 207, 930, 62, 21, C.text);
  await image(s, deepEntry, { left: 56, top: 294, width: 468, height: 500 }, { crop: { left: 0, top: 0.02, right: 0, bottom: 0.18 } });
  await image(s, deepResult, { left: 556, top: 294, width: 468, height: 500 }, { crop: { left: 0, top: 0.02, right: 0, bottom: 0.18 } });
  text(s, "1  HANDOFF", 72, 820, 220, 32, 15, C.gold, true);
  text(s, "The selected company carries into the research workflow.", 72, 856, 410, 66, 18, C.white, true);
  text(s, "2  RESEARCH OUTPUT", 572, 820, 280, 32, 15, C.teal, true);
  text(s, "A fuller report adds bull and bear cases, valuation context and supporting tables.", 572, 856, 410, 72, 18, C.white, true);
  text(s, "Deep Dive supports a broader on-demand universe, including additional small and mid caps — subject to data availability. Coverage does not imply a BMS lifecycle.", 56, 954, 968, 42, 16, C.text);
  note(s, "Both images are live pilot captures from 15 September 2026. Deep Dive can research a broader on-demand universe than the 477-company BMS tracker. A company found through Deep Dive should not be described as having a BMS lifecycle unless it is actually included in the monitored BMS universe.");
}

// 9 — evidence discipline and PDF
{
  const s = deck.slides.add(); base(s, 9, "The full report is selective by design");
  text(s, "On-screen evidence remains available. A downloadable PDF appears only when stricter report-readiness checks pass.", 56, 208, 930, 62, 21, C.text);
  await image(s, pdf(1), { left: 55, top: 306, width: 270, height: 380 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  await image(s, pdf(3), { left: 352, top: 306, width: 270, height: 380 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  await image(s, pdf(6), { left: 649, top: 306, width: 270, height: 380 }, { fit: "contain", geometry: "rect", borderRadius: 0 });
  text(s, "Company view", 55, 700, 270, 32, 17, C.white, true, "center");
  text(s, "Financial evidence", 352, 700, 270, 32, 17, C.white, true, "center");
  text(s, "Source register", 649, 700, 270, 32, 17, C.white, true, "center");
  shape(s, "roundRect", 55, 770, 425, 150, C.panel, C.line, 14);
  text(s, "24 of 25", 83, 794, 190, 54, 36, C.teal, true);
  text(s, "Evidence workflows completed in the bounded test.", 83, 850, 360, 50, 17, C.text);
  shape(s, "roundRect", 518, 770, 425, 150, C.panel, C.line, 14);
  text(s, "2 of 25", 546, 794, 190, 54, 36, C.gold, true);
  text(s, "Met the stricter full-PDF readiness standard.", 546, 850, 360, 50, 17, C.text);
  text(s, "Coverage evidence — not predictive accuracy.", 55, 948, 888, 36, 18, C.gold, true, "center");
  note(s, "The three images are pages 1, 3 and 6 from the generated RADICO dossier. The bounded 25-company test measured system completion and PDF readiness, not stock-return accuracy: 24 workflows completed; 2 met the full report standard.");
}

// 10 — close
{
  const s = deck.slides.add(); base(s, 10, "One journey, two depths of research");
  text(s, "Use BMS to decide where to look. Use the evidence layer and Deep Dive to decide what deserves further work.", 56, 210, 930, 62, 22, C.text);
  const nodes = [
    ["1", "SIGNAL TRACKER", "477 monitored companies\nLifecycle + BMS"],
    ["2", "EVIDENCE REPORT", "Factors + confidence\nLater-results confirmation"],
    ["3", "DEEP DIVE", "Broader on-demand universe\nCompany + valuation + risks"],
    ["4", "SELECTIVE PDF", "Downloaded only when\nreport-ready"],
  ];
  nodes.forEach(([n,h,b],i)=>{ const left=56+i*246; shape(s,"roundRect",left,355,214,270,C.panel,i===2?C.gold:C.line,16); shape(s,"ellipse",left+76,382,62,62,i===2?C.gold:C.teal); text(s,n,left+76,394,62,32,19,C.navy,true,"center"); text(s,h,left+18,472,178,56,19,C.white,true,"center"); text(s,b,left+18,540,178,62,16,C.text,false,"center"); if(i<3){ text(s,"→",left+216,455,28,42,24,C.muted,true,"center"); }});
  shape(s, "roundRect", 126, 716, 828, 134, "#0B2928", C.teal, 18);
  text(s, "OPEN THE LIVE PILOT", 126, 743, 828, 32, 16, C.teal, true, "center");
  text(s, "expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app", 146, 791, 788, 34, 19, C.white, true, "center");
  text(s, "Research aid only · no buy/sell recommendation · verify material claims against cited filings", 96, 903, 888, 52, 17, C.gold, true, "center");
  note(s, "Closing slide. Suggested live demonstration: choose a lifecycle, select one company, open View Evidence Report, then use Deep Dive. The pilot URL is shown for the peer-review session. The application is a research aid and does not replace due diligence or provide investment advice.");
}

const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  materializeLiteralChartWorkbooks: false,
};
const finalExists = await fs.access(FINAL_PPTX).then(() => true).catch(() => false);
if (finalExists) throw new Error(`Refusing to overwrite existing output: ${FINAL_PPTX}`);
await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "10287000,10287000", "--validate-bullet-geometry", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, "AlphaSynth-Product-Walkthrough-Carousel-v1.validation.json"),
});

console.log(JSON.stringify({ final: FINAL_PPTX, slides: deck.slides.items.length, font }, null, 2));
