import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:\\Users\\admin\\Documents\\ChatGPT\\Alphasynth Intelligence\\alphasynth-equity";
const SKILL_DIR = "C:\\Users\\admin\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.909.12148\\skills\\presentations";
const TMP_DIR = path.join(workspaceDir, "carousel-build");
const FINAL_PPTX = path.join(workspaceDir, "carousel-output", "AlphaSynth-BMS-V1-Carousel-Final-v4.pptx");
const RUNTIME_PYTHON = "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
process.env.RUNTIME_NODE ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
process.env.RUNTIME_NODE_MODULES ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
process.env.RUNTIME_BIN_DIR ||= "C:\\Users\\admin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\bin\\override";
process.env.RUNTIME_PYTHON ||= RUNTIME_PYTHON;

const { applyPresentationChartFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs")).href,
);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const font = "Aptos";
console.log("builder: runtime ready");
const deck = Presentation.create({ slideSize: { width: 1080, height: 1080 } });
console.log("builder: presentation created");

const C = {
  navy: "#080D18",
  navy2: "#0E1728",
  white: "#F7F9FC",
  text: "#B9C3D4",
  muted: "#718096",
  teal: "#22D3C5",
  gold: "#D8AA3D",
  line: "#26344B",
  red: "#F87171",
};

function shape(slide, geometry, left, top, width, height, fill = "none", line = "none", radius) {
  return slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill,
    line: { fill: line, width: line === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, left, top, width, height, size, color = C.white, bold = false, align = "left") {
  const box = shape(slide, "textbox", left, top, width, height);
  box.text = value;
  box.text.style = {
    typeface: font,
    fontSize: size,
    color,
    bold,
    autoFit: "none",
  };
  if (align !== "left") box.text.paragraphFormat = { alignment: align };
  return box;
}

function base(slide, number, title, kicker = "ALPHASYNTH BMS V1") {
  slide.background.fill = C.navy;
  shape(slide, "rect", 64, 62, 72, 6, C.teal);
  text(slide, kicker, 64, 78, 700, 34, 15, C.teal, true);
  text(slide, title, 64, 124, 940, 112, 44, C.white, true);
  text(slide, String(number).padStart(2, "0"), 932, 986, 84, 34, 14, C.muted, true, "right");
  text(slide, "AlphaSynth Intelligence", 64, 986, 360, 34, 14, C.muted, false);
}

function label(slide, value, left, top, width, color = C.teal) {
  text(slide, value.toUpperCase(), left, top, width, 28, 14, color, true);
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

// 1. Cover
{
  const slide = deck.slides.add();
  console.log("builder: slide 1 added");
  slide.background.fill = C.navy;
  const imageBytes = await fs.readFile(path.join(workspaceDir, "carousel-assets", "alphasynth-signal-background.png"));
  console.log("builder: image read");
  slide.images.add({ blob: imageBytes, contentType: "image/png", alt: "Abstract signal emerging from financial data", fit: "cover", position: { left: 0, top: 0, width: 1080, height: 1080 } });
  console.log("builder: image added");
  shape(slide, "rect", 0, 0, 700, 1080, "#08101D");
  console.log("builder: cover panel");
  shape(slide, "rect", 70, 116, 76, 7, C.gold);
  text(slide, "ALPHASYNTH INTELLIGENCE", 70, 140, 500, 42, 16, C.gold, true);
  text(slide, "Business momentum\nwith an evidence trail", 70, 238, 610, 250, 54, C.white, true);
  text(slide, "A research system that detects changes in business momentum and preserves the evidence behind each signal.", 72, 520, 565, 100, 22, C.text, false);
  text(slide, "WHAT IT DOES", 72, 670, 260, 34, 16, C.teal, true);
  text(slide, "Highlights where company momentum may be strengthening or weakening.", 72, 708, 565, 76, 20, C.white, true);
  text(slide, "WHAT IT DOES NOT CLAIM", 72, 820, 330, 34, 16, C.gold, true);
  text(slide, "It does not predict multibaggers, replace due diligence or recommend trades.", 72, 858, 565, 84, 20, C.text, false);
  text(slide, "BMS V1", 72, 990, 220, 28, 14, C.muted, true);
  console.log("builder: cover text");
  note(slide, "AlphaSynth highlights where a company's business momentum may be strengthening or weakening and preserves the evidence behind that reading. It helps users decide where deeper research may be worthwhile. It does not predict multibaggers, replace due diligence or recommend trades.");
  console.log("builder: cover note");
}
console.log("builder: slide 1");

// 2. Problem
{
  const slide = deck.slides.add();
  base(slide, 2, "Financial data is abundant. Early interpretation remains difficult");
  text(slide, "Revenue, profit and valuation ratios are available on many platforms.", 70, 300, 780, 80, 27, C.text);
  shape(slide, "rect", 70, 410, 820, 2, C.line);
  text(slide, "The harder questions", 70, 458, 420, 50, 22, C.gold, true);
  text(slide, "Is the change new or persistent?", 70, 540, 860, 66, 34, C.white, true);
  text(slide, "Is management delivering what it previously said?", 70, 638, 880, 66, 34, C.white, true);
  text(slide, "Does the available evidence justify deeper research?", 70, 736, 900, 66, 34, C.white, true);
  text(slide, "AlphaSynth organises these questions before a user commits time to a full company review.", 70, 864, 870, 70, 23, C.teal, false);
  note(slide, "AlphaSynth does not try to duplicate screeners. Its purpose is to organise the harder judgement: whether a change is early, whether it persists, and whether management and measurable outcomes support it.");
}
console.log("builder: slide 2");

// 3. BMS factors
{
  const slide = deck.slides.add();
  base(slide, 3, "The Business Momentum Score");
  text(slide, "Five evidence categories describe the direction of fundamental change.", 66, 245, 900, 54, 24, C.text);
  const chart = slide.charts.add("bar", {
    position: { left: 65, top: 330, width: 950, height: 390 },
    categories: ["Earnings", "Economics", "Execution", "Balance sheet", "Management"],
    series: [{ name: "Weight", values: [25, 25, 25, 15, 10], fill: C.teal }],
    barOptions: { direction: "column", grouping: "clustered" },
    hasLegend: false,
    dataLabels: { showValue: false },
    xAxis: { visible: false },
    valueAxis: { minimumScale: 0, maximumScale: 30, majorUnit: 5, numberFormatCode: "0\"%\"" },
  });
  applyPresentationChartFont(chart, { fontFamily: font });
  [["25%", 132, 374], ["25%", 316, 374], ["25%", 500, 374], ["15%", 684, 518], ["10%", 868, 575]].forEach(([value, left, top]) => {
    text(slide, value, left, top, 80, 30, 16, C.white, true, "center");
  });
  [["EARNINGS", 86], ["ECONOMICS", 271], ["EXECUTION", 455], ["BALANCE SHEET", 639], ["MANAGEMENT", 823]].forEach(([value, left]) => {
    text(slide, value, left, 700, 170, 34, 18, C.white, true, "center");
  });
  label(slide, "Score", 68, 772, 180, C.gold);
  text(slide, "Direction and strength of measured change", 68, 804, 410, 72, 21, C.white, true);
  label(slide, "Confidence", 560, 772, 210, C.gold);
  text(slide, "Completeness and comparability of supporting evidence", 560, 804, 420, 72, 21, C.white, true);
  text(slide, "A high score can still carry medium confidence.", 68, 920, 780, 42, 18, C.text);
  note(slide, "BMS uses five factors. Earnings, economics and execution receive twenty-five percent each. Balance sheet receives fifteen percent and management delivery receives ten percent. The score describes direction. Confidence describes how complete and comparable the evidence is.");
}
console.log("builder: slide 3");

// 4. Lifecycle
{
  const slide = deck.slides.add();
  base(slide, 4, "The momentum lifecycle");
  text(slide, "Successive results determine whether an early change broadens, persists or fades.", 66, 245, 900, 60, 24, C.text);
  const stages = [
    ["WATCH", "First evidence"],
    ["EMERGING", "New signal"],
    ["BUILDING", "Broader confirmation"],
    ["ESTABLISHED", "Persistent delivery"],
    ["FADING", "Momentum weakens"],
  ];
  stages.forEach(([stage, copy], i) => {
    const top = 350 + i * 112;
    text(slide, String(i + 1).padStart(2, "0"), 72, top, 64, 58, 18, i === 4 ? C.gold : C.teal, true);
    text(slide, stage, 150, top, 310, 58, 30, C.white, true);
    text(slide, copy, 500, top, 430, 58, 22, C.text);
    if (i < 4) shape(slide, "rect", 100, top + 67, 830, 1, C.line);
  });
  text(slide, "Lifecycle classifies momentum. It does not rate company quality or recommend a trade.", 70, 925, 900, 54, 20, C.gold, true);
  note(slide, "Lifecycle adds time to the score. Watch captures early evidence. Emerging marks a new signal. Building and Established require broader persistence. Fading warns that momentum has weakened. The lifecycle is not an investment recommendation.");
}
console.log("builder: slide 4");

// 5. Overlay
{
  const slide = deck.slides.add();
  base(slide, 5, "The confirmation overlay");
  text(slide, "After we record a lifecycle, we check later results to see whether the earlier reading still holds. We keep the original reading as history and use the new check to set today's research priority.", 66, 245, 920, 104, 23, C.text);
  const rows = [
    ["MEASURABLE DELIVERY", "Previous reading compared with current results"],
    ["BUSINESS QUALITY CHECKS", "Meets check, concern found, unavailable or not due"],
    ["MANAGEMENT HISTORY", "Commitments, revisions and reported outcomes"],
  ];
  rows.forEach(([head, copy], i) => {
    const top = 365 + i * 150;
    shape(slide, "rect", 70, top, 8, 95, i === 1 ? C.gold : C.teal);
    text(slide, head, 110, top, 420, 42, 20, C.white, true);
    text(slide, copy, 110, top + 46, 730, 48, 20, C.text);
  });
  shape(slide, "rect", 70, 835, 880, 2, C.line);
  text(slide, "Output", 70, 862, 130, 34, 15, C.gold, true);
  text(slide, "Qualified    Qualified with caution    Not qualified    Insufficient evidence", 70, 904, 900, 60, 24, C.white, true);
  note(slide, "After AlphaSynth records a lifecycle, it checks later results to see whether the earlier reading still holds. The original lifecycle remains part of the historical record. The new evidence can raise, lower or leave today's research priority unchanged.");
}
console.log("builder: slide 5");

// 6. Management memory
{
  const slide = deck.slides.add();
  base(slide, 6, "Management guidance and delivery history");
  text(slide, "Quarterly commentary becomes useful only when the system remembers what management said before.", 66, 245, 920, 78, 24, C.text);
  const steps = [
    ["1", "Commitment", "A measurable statement with a target date"],
    ["2", "Outcome", "The reported result after the target date"],
    ["3", "Revision discipline", "Whether guidance changed before delivery"],
    ["4", "Reliability record", "A score only after enough commitments mature"],
  ];
  steps.forEach(([num, head, copy], i) => {
    const top = 360 + i * 142;
    shape(slide, "ellipse", 72, top, 64, 64, i === 3 ? C.gold : C.teal);
    text(slide, num, 72, top, 64, 64, 22, C.navy, true, "center");
    text(slide, head, 172, top - 2, 380, 38, 25, C.white, true);
    text(slide, copy, 172, top + 38, 730, 46, 20, C.text);
  });
  text(slide, "Insufficient history remains a valid result. Unknown never becomes a pass.", 70, 936, 900, 44, 19, C.gold, true);
  note(slide, "The management ledger stores commitments quarter by quarter. A reliability score appears only after at least three commitments mature with verifiable outcomes. Until then, the system says insufficient history rather than guessing.");
}
console.log("builder: slide 6");

// 7. Validation
{
  const slide = deck.slides.add();
  base(slide, 7, "What happened when we tested 25 companies");
  text(slide, "We applied the same evidence process to five companies from each lifecycle category.", 66, 245, 900, 58, 24, C.text);
  const chart = slide.charts.add("bar", {
    position: { left: 70, top: 335, width: 940, height: 400 },
    categories: ["Evidence process completed", "Results comparison available", "Full report standard met"],
    series: [{ name: "Share of cohort", values: [96, 96, 8], fill: C.teal }],
    barOptions: { direction: "column", grouping: "clustered" },
    hasLegend: false,
    dataLabels: { showValue: false },
    xAxis: { visible: false },
    valueAxis: { minimumScale: 0, maximumScale: 100, majorUnit: 20, numberFormatCode: "0\"%\"" },
  });
  applyPresentationChartFont(chart, { fontFamily: font });
  [["96%", 190, 352], ["96%", 492, 352], ["8%", 795, 652]].forEach(([value, left, top]) => {
    text(slide, value, left, top, 92, 30, 17, C.white, true, "center");
  });
  [["EVIDENCE PROCESS\nCOMPLETED", 95], ["RESULTS COMPARISON\nAVAILABLE", 400], ["FULL REPORT\nSTANDARD MET", 705]].forEach(([value, left]) => {
    text(slide, value, left, 700, 280, 60, 17, C.white, true, "center");
  });
  text(slide, "24 of 25", 70, 790, 245, 60, 40, C.white, true);
  text(slide, "evidence workflows completed", 70, 852, 300, 48, 18, C.text);
  text(slide, "2 of 25", 540, 790, 245, 60, 40, C.gold, true);
  text(slide, "met the full report standard", 540, 852, 330, 48, 18, C.text);
  text(slide, "These figures measure system coverage and evidence handling, not investment accuracy.", 70, 930, 900, 42, 19, C.teal, true);
  note(slide, "The twenty-five-company test measured whether the evidence workflow completed and whether later results could be compared without inventing missing values. Twenty-four companies completed both steps. Two met the stricter full-report standard. These figures measure system coverage and evidence handling. They do not claim that the lifecycle signal predicts returns with ninety-six percent accuracy.");
}
console.log("builder: slide 7");

// 8. User experience
{
  const slide = deck.slides.add();
  base(slide, 8, "What the user sees");
  text(slide, "Progressive detail keeps the main tracker readable while preserving the evidence trail.", 66, 245, 920, 68, 24, C.text);
  const items = [
    ["SIGNAL TRACKER", "Lifecycle, BMS score and market context"],
    ["EVIDENCE WORKSPACE", "Methodology, delivery, business quality, management and sources"],
    ["SELECTIVE PDF", "Available only after every report-readiness check passes"],
  ];
  items.forEach(([head, copy], i) => {
    const left = 70 + i * 325;
    text(slide, String(i + 1).padStart(2, "0"), left, 375, 80, 48, 16, C.gold, true);
    text(slide, head, left, 445, 280, 86, 28, C.white, true);
    shape(slide, "rect", left, 553, 250, 3, i === 2 ? C.gold : C.teal);
    text(slide, copy, left, 590, 275, 150, 20, C.text);
  });
  text(slide, "The on-screen view remains available when evidence is incomplete. Missing values stay visible as missing.", 70, 842, 900, 92, 25, C.teal, true);
  note(slide, "The tracker remains compact. A separate evidence workspace provides the full explanation. Every company can show what is available on screen, while the PDF remains selective. Missing evidence stays visible instead of being filled with estimates.");
}
console.log("builder: slide 8");

// 9. Sample report
{
  const slide = deck.slides.add();
  base(slide, 9, "A sample downloadable report");
  text(slide, "The PDF appears only when the supporting evidence meets the full-report standard.", 66, 245, 920, 58, 24, C.text);
  shape(slide, "rect", 62, 322, 426, 614, C.white, C.gold);
  const reportPage = await fs.readFile(path.join(workspaceDir, "carousel-assets", "radico-dossier-sample-page.png"));
  slide.images.add({
    blob: reportPage,
    contentType: "image/png",
    alt: "First page of an illustrative AlphaSynth research dossier for Radico Khaitan",
    fit: "contain",
    position: { left: 70, top: 330, width: 410, height: 598 },
  });
  label(slide, "Company snapshot", 550, 350, 400, C.gold);
  text(slide, "A concise description of the business and its principal watch item.", 550, 390, 420, 76, 21, C.white, true);
  label(slide, "Lifecycle and BMS", 550, 505, 400, C.teal);
  text(slide, "The recorded lifecycle, score and evidence coverage appear together.", 550, 545, 420, 76, 21, C.white, true);
  label(slide, "Supporting explanation", 550, 660, 420, C.gold);
  text(slide, "Later pages explain the factors, subsequent result checks, management history and source evidence.", 550, 700, 420, 100, 21, C.white, true);
  text(slide, "Illustrative sample: Radico Khaitan. Research aid only. No buy or sell recommendation.", 550, 865, 420, 70, 18, C.text);
  note(slide, "This is the first page of the six-page AlphaSynth Professional Dossier sample for Radico Khaitan. It shows the format a user can expect when the available evidence meets the full-report standard. Later pages explain the BMS factors, later-results check, management history and sources. The dossier remains a research aid rather than a trading recommendation.");
}
console.log("builder: slide 9");

const stagingDir = path.join(workspaceDir, ".codex-finalizer-carousel");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);
console.log("builder: candidate exported");

const requirements = {
  explicitTotalSlideCount: 9,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [3, 7],
  materializeLiteralChartWorkbooks: true,
};
const expectedSlideSizeEmu = "10287000,10287000";
const finalExists = await fs.access(FINAL_PPTX).then(() => true).catch(() => false);
if (!finalExists) await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", expectedSlideSizeEmu,
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [3, 7],
  materializeLiteralChartWorkbooks: true,
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "AlphaSynth-BMS-V1-Carousel-Final-v4.validation.json"),
});

console.log(JSON.stringify({ final: FINAL_PPTX, font }, null, 2));
