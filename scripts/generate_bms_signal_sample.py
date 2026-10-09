import json
import math
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "AlphaSynth-BMS-Signal-Report-Sample-SUNPHARMA.pdf"
TRACKER = ROOT / "src" / "data" / "signalTrackerCohort001.json"
DOSSIER = ROOT / "output" / "pdf" / "template-validation" / "SUNPHARMA-payload.json"

NAVY = HexColor("#172136")
GREEN = HexColor("#23845F")
GOLD = HexColor("#D4A62A")
INK = HexColor("#202A3D")
SLATE = HexColor("#63708A")
PALE = HexColor("#F2F5F8")
GREEN_PALE = HexColor("#E8F4EE")
WHITE = HexColor("#FFFFFF")
LINE = HexColor("#CED6E2")

W, H = A4
M = 43
CW = W - 2 * M


def wrap(text, font, size, width):
    words = str(text or "").split()
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def text_block(c, text, x, y, width, size=9, color=INK, font="Helvetica", leading=13, max_lines=None):
    lines = wrap(text, font, size, width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c, title, kicker="ALPHASYNTH INTELLIGENCE / BMS SIGNAL REPORT"):
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(M, H - 44, kicker)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 23)
    c.drawString(M, H - 72, title)
    c.setStrokeColor(GREEN)
    c.setLineWidth(1)
    c.line(M, H - 88, W - M, H - 88)


def footer(c, page):
    c.setFillColor(SLATE)
    c.setFont("Helvetica", 6.8)
    c.drawCentredString(W / 2, 22, f"AlphaSynth Intelligence | SUNPHARMA | Sample | Page {page} of 4")


def section(c, title, y):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M, y, title)
    c.setStrokeColor(GREEN)
    c.setLineWidth(0.7)
    c.line(M, y - 7, W - M, y - 7)
    return y - 24


def card(c, x, y, width, height, label, value, fill=GREEN_PALE, value_color=GREEN):
    c.setFillColor(fill)
    c.roundRect(x, y - height, width, height, 5, stroke=0, fill=1)
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x + 11, y - 16, label.upper())
    c.setFillColor(value_color)
    c.setFont("Helvetica-Bold", 14)
    for idx, line in enumerate(wrap(value, "Helvetica-Bold", 14, width - 22)[:2]):
        c.drawString(x + 11, y - 37 - idx * 15, line)


def bullet(c, text, y, max_lines=3):
    lines = wrap(text, "Helvetica", 8.4, CW - 12)[:max_lines]
    c.setFillColor(GREEN)
    c.circle(M + 3, y + 3, 2, stroke=0, fill=1)
    c.setFont("Helvetica", 8.4)
    c.setFillColor(INK)
    baseline = y + 7
    for line in lines:
        c.drawString(M + 12, baseline, line)
        baseline -= 11
    return y - max(17, len(lines) * 11 + 3)


def nearest(points, date):
    before = [p for p in points if p["date"] <= date]
    return before[-1] if before else None


tracker = json.loads(TRACKER.read_text(encoding="utf-8"))
payload = json.loads(DOSSIER.read_text(encoding="utf-8"))
company = next(item for item in tracker["companies"] if item["symbol"] == "SUNPHARMA")
dossier = payload["dossier"]

signal_date = tracker["signalDate"]
as_of = tracker["asOfDate"]
company_points = [p for p in company["priceHistory"] if company["resultEntryDate"] <= p["date"] <= as_of]
nifty_points = tracker["benchmarks"]["NIFTY_50"]
sector_points = tracker["benchmarks"][company["sectorBenchmarkId"]]

OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle("AlphaSynth BMS Signal Report - SUNPHARMA - Sample")
c.setAuthor("AlphaSynth Intelligence")

# Page 1 - company signal
c.setFillColor(NAVY)
c.rect(0, H - 132, W, 132, stroke=0, fill=1)
c.setFillColor(GOLD)
c.setFont("Helvetica-Bold", 8)
c.drawString(M, H - 42, "ALPHASYNTH INTELLIGENCE")
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 22)
c.drawString(M, H - 70, "BMS Signal Report")
c.setFont("Helvetica-Bold", 16)
c.drawString(M, H - 96, company["name"])
c.setFont("Helvetica", 8.5)
c.setFillColor(HexColor("#CBD5E1"))
c.drawString(M, H - 116, f"{company['symbol']} / {company['period']} / Frozen {signal_date}")

y = H - 158
gap = 8
width = (CW - gap * 3) / 4
card(c, M, y, width, 60, "BMS score", f"{company['rawBms']:.2f}")
card(c, M + width + gap, y, width, 60, "Lifecycle", company["lifecycle"].upper())
card(c, M + 2 * (width + gap), y, width, 60, "BMS change", f"{company['bmsChange']:+.2f}")
card(c, M + 3 * (width + gap), y, width, 60, "Evidence", f"{company['evidenceStrength']} / {company['evidenceCount']}")

y = section(c, "What the frozen signal means", y - 83)
y = text_block(c, "An Emerging classification means that a meaningful new positive change in business fundamentals has appeared. It is a research-prioritisation signal: the system is saying that this company deserves deeper investigation now.", M, y, CW, 10, INK, leading=15)

y = section(c, "What is unique in AlphaSynth", y - 15)
features = [
    ("Deterministic scoring", "The BMS score is calculated by fixed rules. Gemini may explain the result but cannot calculate or alter it."),
    ("Lifecycle classification", "The score is translated into a research state - Watch, Emerging, Sustained or Fading - rather than a buy or sell label."),
    ("Frozen record", "The company, score, lifecycle and cohort membership were recorded before subsequent market outcomes were observed."),
    ("Independent research layer", "The Research Signal examines durability, contrary evidence and risks without rewriting the original BMS."),
]
for label, body in features:
    c.setFillColor(PALE)
    c.roundRect(M, y - 42, CW, 38, 4, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(M + 11, y - 17, label)
    text_block(c, body, M + 130, y - 14, CW - 141, 8, INK, leading=10, max_lines=2)
    y -= 47

y = section(c, "Interpretation boundary", y - 3)
text_block(c, "BMS measures change in business fundamentals. It does not measure valuation or overall company quality, predict a share price, or issue investment advice. An Emerging signal can later strengthen, remain unconfirmed or fail.", M, y, CW, 8.5, SLATE, leading=12)
footer(c, 1)
c.showPage()

# Page 2 - methodology
header(c, "How BMS V1 works")
y = H - 112
y = text_block(c, "BMS V1 is frozen. Every company is processed through the same five-factor structure and fixed weights; changing those rules would require a separately identified BMS V2.", M, y, CW, 9.5, INK, leading=14)
y = section(c, "Five-factor structure and fixed weights", y - 17)
weights = [("Earnings", 25), ("Economics", 25), ("Execution", 25), ("Balance sheet", 15), ("Management delivery", 10)]
chart_x, chart_y, chart_w = M + 125, y - 8, CW - 125
for label, value in weights:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(chart_x - 10, chart_y - 3, label)
    c.setFillColor(PALE)
    c.roundRect(chart_x, chart_y - 11, chart_w, 14, 3, stroke=0, fill=1)
    c.setFillColor(GREEN if value == 25 else GOLD)
    c.roundRect(chart_x, chart_y - 11, chart_w * value / 25, 14, 3, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(chart_x + chart_w + 8, chart_y - 2, f"{value}%")
    chart_y -= 32
y = chart_y - 3
c.setFillColor(GREEN_PALE)
c.roundRect(M, y - 53, CW, 48, 5, stroke=0, fill=1)
text_block(c, "Company-level factor scores are not printed in this sample because the frozen tracker record does not contain all five component values. Missing factors must be labelled unavailable - never displayed as zero.", M + 12, y - 21, CW - 24, 8.5, INK, leading=12)
y -= 72

y = section(c, "Signal production chain", y)
steps = [
    ("1", "Observe", "Record dated evidence and comparable fundamental change."),
    ("2", "Score", "Apply the deterministic five-factor calculation."),
    ("3", "Classify", "Assign the lifecycle state using frozen thresholds."),
    ("4", "Explain", "Show the evidence drivers and appropriate research action."),
    ("5", "Freeze", "Preserve the signal before tracking subsequent outcomes."),
]
box_w = (CW - 8 * 4) / 5
for idx, (number, label, body) in enumerate(steps):
    x = M + idx * (box_w + 8)
    c.setFillColor(PALE)
    c.roundRect(x, y - 103, box_w, 96, 5, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.circle(x + 15, y - 23, 10, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + 15, y - 26, number)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x + 10, y - 47, label)
    text_block(c, body, x + 10, y - 61, box_w - 20, 6.8, SLATE, leading=8, max_lines=4)
y -= 126

y = section(c, "Lifecycle interpretation", y)
stages = [
    ("WATCH", "Monitor; directional change is not sufficiently confirmed."),
    ("EMERGING", "A meaningful new positive fundamental inflection has appeared."),
    ("SUSTAINED", "Positive momentum has persisted beyond the initial inflection."),
    ("FADING", "Previously meaningful positive momentum has deteriorated materially."),
]
for idx, (label, body) in enumerate(stages):
    x = M + (idx % 2) * (CW / 2 + 5)
    row_y = y - (idx // 2) * 58
    w = CW / 2 - 5
    c.setFillColor(GREEN_PALE if label == "EMERGING" else PALE)
    c.roundRect(x, row_y - 45, w, 40, 4, stroke=0, fill=1)
    c.setFillColor(GREEN if label == "EMERGING" else INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 10, row_y - 20, label)
    text_block(c, body, x + 80, row_y - 16, w - 90, 7.1, SLATE, leading=9, max_lines=3)
footer(c, 2)
c.showPage()

# Page 3 - forward validation
header(c, "Does the signal survive contact with the market?")
y = H - 112
y = text_block(c, "AlphaSynth does not rewrite a historical signal after seeing the price. The cohort was frozen on 25 August 2026; only later trading sessions count as prospective validation.", M, y, CW, 9.5, INK, leading=14)

def series_for(points):
    by_date = {p["date"]: p["adjustedClose"] for p in points}
    base = nearest(points, signal_date)
    if not base:
        return {}
    return {date: value / base["adjustedClose"] * 100 for date, value in by_date.items()}

company_idx = series_for(company_points)
nifty_idx = series_for(nifty_points)
sector_idx = series_for(sector_points)
dates = [p["date"] for p in company_points]
chart_top, chart_bottom = y - 25, y - 250
chart_left, chart_right = M + 46, W - M
all_values = [v for date in dates for v in (company_idx.get(date), nifty_idx.get(date), sector_idx.get(date)) if v is not None]
low, high = min(all_values) - 2, max(all_values) + 2
for tick in range(5):
    value = high - (high - low) * tick / 4
    yy = chart_top - (chart_top - chart_bottom) * tick / 4
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(chart_left, yy, chart_right, yy)
    c.setFillColor(SLATE)
    c.setFont("Helvetica", 6.5)
    c.drawRightString(chart_left - 7, yy - 2, f"{value:.1f}")

def plot(indexed, color, width=1.6):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    started = False
    for i, date in enumerate(dates):
        if date not in indexed:
            continue
        x = chart_left + (chart_right - chart_left) * i / max(1, len(dates) - 1)
        yy = chart_bottom + (indexed[date] - low) / max(1, high - low) * (chart_top - chart_bottom)
        if started:
            c.line(last_x, last_y, x, yy)
        last_x, last_y, started = x, yy, True

plot(company_idx, GREEN, 2.2)
plot(nifty_idx, NAVY, 1.3)
plot(sector_idx, GOLD, 1.3)
signal_i = max(i for i, date in enumerate(dates) if date <= signal_date)
signal_x = chart_left + (chart_right - chart_left) * signal_i / max(1, len(dates) - 1)
c.setStrokeColor(GOLD)
c.setDash(3, 2)
c.line(signal_x, chart_bottom, signal_x, chart_top)
c.setDash()
c.setFillColor(GOLD)
c.setFont("Helvetica-Bold", 7)
c.drawString(min(signal_x + 5, chart_right - 90), chart_top - 10, "FROZEN SIGNAL")
c.setFillColor(SLATE)
c.setFont("Helvetica", 6.5)
c.drawString(chart_left, chart_bottom - 15, company["resultEntryDate"])
c.drawCentredString(signal_x, chart_bottom - 15, signal_date)
c.drawRightString(chart_right, chart_bottom - 27, as_of)

legend_y = chart_bottom - 35
for idx, (label, color) in enumerate([("SUNPHARMA", GREEN), ("NIFTY 50", NAVY), (company["sectorBenchmarkLabel"].upper(), GOLD)]):
    x = M + idx * 135
    c.setStrokeColor(color)
    c.setLineWidth(3)
    c.line(x, legend_y, x + 18, legend_y)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 24, legend_y - 2, label)

freeze_company = company_idx.get(signal_date)
latest_date = max(date for date in dates if date <= as_of)
company_return = company_idx[latest_date] / freeze_company - 1 if freeze_company else None
nifty_return = nifty_idx.get(latest_date, 100) / nifty_idx.get(signal_date, 100) - 1
relative = company_return - nifty_return if company_return is not None else None
y = section(c, "Prospective reading", legend_y - 33)
metric_w = (CW - 16) / 3
card(c, M, y, metric_w, 57, "Forward sessions", str(tracker["forwardSessionsObserved"]), PALE, INK)
card(c, M + metric_w + 8, y, metric_w, 57, "Company return", f"{company_return * 100:+.2f}%", GREEN_PALE, GREEN)
card(c, M + 2 * (metric_w + 8), y, metric_w, 57, "Vs Nifty 50", f"{relative * 100:+.2f} pp", GREEN_PALE, GREEN)
y -= 77
y = text_block(c, "This observation window is too short to support an efficacy conclusion. Its value is methodological: the signal, cohort and benchmark were fixed first, and the outcome is being recorded without hindsight adjustment.", M, y, CW, 8.5, SLATE, leading=12)
y = section(c, "Validation protocol", y - 12)
for item in [
    "The displayed cohort contains five companies from each lifecycle; the complete frozen universe contains 477 companies.",
    "Company returns are compared with Nifty 50 and a predeclared sector benchmark over identical dates.",
    "Future sessions remain blank until observed; no prices are projected or filled.",
]:
    y = bullet(c, item, y, 2)
footer(c, 3)
c.showPage()

# Page 4 - research layer and evidence
header(c, "From signal to an investable research question")
y = H - 112
y = text_block(c, "The BMS answers 'where is change occurring?'. The Research Signal then asks whether that change is durable, sufficiently evidenced and worth deeper independent work. It does not alter the frozen BMS score.", M, y, CW, 9.5, INK, leading=14)

sections = dossier["sections"]
for title, key, limit in [
    ("What supports further investigation", "developments", 3),
    ("Operating evidence to test", "operatingEvidence", 3),
    ("Risks and contrary evidence", "risks", 3),
]:
    y = section(c, title, y - 12)
    claims = [claim for claim in sections.get(key, []) if claim.get("status") == "supported"][:limit]
    if not claims:
        y = text_block(c, "No verified claim was available in this category.", M, y, CW, 8.5, SLATE, leading=12) - 4
    for claim in claims:
        y = bullet(c, claim["text"], y, 3)

y = section(c, "Practical research action", y - 7)
actions = [
    ("Confirm", "Check whether the Emerging improvement broadens beyond the currently limited evidence set."),
    ("Challenge", "Test acquisition execution, exceptional costs, U.S. generic erosion and specialty-growth durability."),
    ("Monitor", "Update after the next result while keeping the original frozen signal unchanged."),
]
for idx, (label, body) in enumerate(actions):
    x = M + idx * ((CW - 16) / 3 + 8)
    w = (CW - 16) / 3
    c.setFillColor(PALE)
    c.roundRect(x, y - 67, w, 60, 5, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 10, y - 23, label.upper())
    text_block(c, body, x + 10, y - 37, w - 20, 7, INK, leading=9, max_lines=4)
y -= 87

y = section(c, "Evidence and governance record", y)
source = dossier["sources"][0]
records = [
    f"BMS V1 specification: frozen five-factor weights and lifecycle definitions.",
    f"Frozen cohort: {tracker['cohortId']}; signal date {signal_date}; source hash {tracker['sourceBmsSha256'][:16]}...",
    f"Matching result date: {company['resultDate']} ({company['resultDateStatus'].replace('_', ' ')}).",
    f"Official dossier source: {source['url']}",
]
for record in records:
    y = bullet(c, record, y, 2)

c.setFillColor(GREEN_PALE)
c.roundRect(M, 64, CW, 55, 5, stroke=0, fill=1)
text_block(c, "Sample conclusion: AlphaSynth has identified SUNPHARMA as an Emerging research priority, but the evidence strength is Limited and the prospective observation window is only three sessions. The correct action is further research and continued validation - not an investment recommendation.", M + 12, 99, CW - 24, 8.2, INK, leading=11, max_lines=4)
footer(c, 4)
c.save()
print(OUT)
