from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Flowable
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "ai-transition-pilot-comparison.pdf"
PUBLIC = ROOT / "public" / "reports" / "ai-transition-pilot-comparison.pdf"

NAVY = colors.HexColor("#101722")
TEAL = colors.HexColor("#16A394")
GOLD = colors.HexColor("#C7A348")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#637083")
PALE = colors.HexColor("#F2F5F7")
WHITE = colors.white

companies = [
    {"symbol": "INTELLECT", "name": "Intellect Design Arena", "model": "Vertical banking software", "exposure": 25.8, "readiness": 71.0, "status": "RESILIENT", "revenue": "+22.7%", "margin": "-1.8 pp", "evidence": "Platform revenue +140.7%", "market": "-16.5 pp"},
    {"symbol": "TCS", "name": "Tata Consultancy Services", "model": "Scaled IT services", "exposure": 61.3, "readiness": 81.8, "status": "CREDIBLE TRANSITION", "revenue": "-0.5%", "margin": "+0.7 pp", "evidence": "Employees -3.9%", "market": "-6.6 pp"},
    {"symbol": "TATAELXSI", "name": "Tata Elxsi", "model": "Design-led engineering services", "exposure": 61.3, "readiness": 64.9, "status": "CREDIBLE TRANSITION", "revenue": "+0.8%", "margin": "Not comparable", "evidence": "Growth slowed FY24-FY26", "market": "-15.5 pp"},
]

trajectory = {
    "years": ["FY23", "FY24", "FY25", "FY26"],
    "INTELLECT": [43.8, 52.2, 53.2, 71.0],
    "TCS": [39.0, 51.2, 63.5, 81.8],
    "TATAELXSI": [36.9, 45.1, 53.3, 64.9],
}

market = [
    ["INTELLECT", "+46.5", "-25.6", "+9.0", "-16.5"],
    ["TCS", "+0.5", "-11.3", "-14.0", "-6.6"],
    ["TATAELXSI", "-15.4", "-27.7", "-0.5", "-15.5"],
]

sources = [
    ("TCS FY23-FY26", "TCS annual report and official Q4 results releases"),
    ("Tata Elxsi FY23-FY26", "Tata Elxsi official full-year results releases"),
    ("Intellect FY23-FY26", "Intellect official earnings transcript and investor decks"),
    ("Market outcomes", "Yahoo Finance adjusted-close observations; Nifty IT benchmark"),
]

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=NAVY, spaceAfter=7)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=NAVY, spaceBefore=4, spaceAfter=10)
KICKER = ParagraphStyle("Kicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=TEAL, tracking=1.4, spaceAfter=7)
BODY = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.5, textColor=INK, spaceAfter=7)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=7.7, leading=10.5, textColor=MUTED)
CALLOUT = ParagraphStyle("Callout", parent=BODY, fontName="Helvetica-Bold", fontSize=10.2, leading=14.2, textColor=NAVY)
WHITE_H = ParagraphStyle("WhiteH", parent=H2, textColor=WHITE, fontSize=12, leading=15, spaceAfter=2)
WHITE_S = ParagraphStyle("WhiteS", parent=SMALL, textColor=colors.HexColor("#D9E0E7"), fontSize=7.3)


class Band(Flowable):
    def __init__(self, width, height=4, color=TEAL):
        super().__init__(); self.width = width; self.height = height; self.color = color
    def draw(self):
        self.canv.setFillColor(self.color); self.canv.roundRect(0, 0, self.width, self.height, 2, fill=1, stroke=0)


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(MUTED); canvas.setFont("Helvetica", 7)
    canvas.drawString(18*mm, 10*mm, "AI Transition Observatory | Reconstructed pilot | 9 September 2026")
    canvas.drawRightString(w - 18*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()


def page_header():
    t = Table([["ALPHASYNTH INTELLIGENCE"]], colWidths=[172*mm], rowHeights=[12*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY), ("TEXTCOLOR", (0,0), (-1,-1), GOLD),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    return [t, Spacer(1, 6*mm)]


def score_card(company):
    data = [
        [Paragraph(company["symbol"], WHITE_H), Paragraph(company["status"], WHITE_S)],
        [Paragraph(company["name"], WHITE_S), ""],
        [Paragraph(f'<font color="#C7A348"><b>{company["exposure"]:.1f}</b></font><br/><font size="6">EXPOSURE</font>', WHITE_S),
         Paragraph(f'<font color="#49D7C6"><b>{company["readiness"]:.1f}</b></font><br/><font size="6">READINESS</font>', WHITE_S)],
    ]
    t = Table(data, colWidths=[105*mm, 67*mm], rowHeights=[12*mm, 9*mm, 17*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY), ("SPAN", (0,1), (1,1)),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#2B3848")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7), ("ALIGN", (1,0), (1,0), "RIGHT"),
    ]))
    return t


def readiness_chart():
    d = Drawing(470, 185)
    chart = HorizontalLineChart()
    chart.x = 48; chart.y = 35; chart.height = 125; chart.width = 370
    chart.data = [trajectory["INTELLECT"], trajectory["TCS"], trajectory["TATAELXSI"]]
    chart.categoryAxis.categoryNames = trajectory["years"]
    chart.valueAxis.valueMin = 0; chart.valueAxis.valueMax = 100; chart.valueAxis.valueStep = 20
    chart.lines[0].strokeColor = TEAL; chart.lines[1].strokeColor = GOLD; chart.lines[2].strokeColor = NAVY
    for i in range(3):
        chart.lines[i].strokeWidth = 2.4; chart.lines[i].symbol = None
    chart.categoryAxis.labels.fontSize = 8; chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.gridStrokeColor = colors.HexColor("#D9DEE4"); chart.valueAxis.gridStrokeDashArray = [2,2]
    d.add(chart)
    legend = Legend(); legend.x = 95; legend.y = 9; legend.dx = 8; legend.dy = 8; legend.deltax = 105
    legend.fontSize = 7; legend.columnMaximum = 1; legend.colorNamePairs = [(TEAL,"Intellect"),(GOLD,"TCS"),(NAVY,"Tata Elxsi")]
    d.add(legend)
    return d


def latest_bar_chart():
    d = Drawing(470, 170)
    chart = VerticalBarChart(); chart.x = 54; chart.y = 35; chart.width = 360; chart.height = 105
    chart.data = [[c["exposure"] for c in companies], [c["readiness"] for c in companies]]
    chart.categoryAxis.categoryNames = ["Intellect", "TCS", "Tata Elxsi"]
    chart.valueAxis.valueMin = 0; chart.valueAxis.valueMax = 100; chart.valueAxis.valueStep = 20
    chart.bars[0].fillColor = GOLD; chart.bars[1].fillColor = TEAL
    chart.groupSpacing = 14; chart.barSpacing = 3
    chart.categoryAxis.labels.fontSize = 7.5; chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.gridStrokeColor = colors.HexColor("#D9DEE4"); chart.valueAxis.gridStrokeDashArray = [2,2]
    d.add(chart)
    return d


def styled_table(rows, widths, header=True, font=7.4):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    commands = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), font), ("TEXTCOLOR", (0,1), (-1,-1), INK),
        ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#D8DEE5")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, PALE]),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]
    if header:
        commands += [("BACKGROUND", (0,0), (-1,0), NAVY), ("TEXTCOLOR", (0,0), (-1,0), WHITE), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold")]
    t.setStyle(TableStyle(commands)); return t


def build_pdf(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=20*mm, bottomMargin=17*mm,
                            title="AlphaSynth AI Transition Observatory - Three-company pilot")
    story = []

    story += [Paragraph("AI TRANSITION OBSERVATORY", KICKER), Paragraph("Three-company pilot comparison", H1),
              Paragraph("A compact evidence bridge from AI exposure to organisational readiness, operating delivery and subsequent market outcomes.", BODY),
              Spacer(1, 3*mm), Band(doc.width), Spacer(1, 6*mm)]
    story.append(Table([[score_card(companies[0])], [score_card(companies[1])], [score_card(companies[2])]], colWidths=[doc.width], rowHeights=[42*mm]*3,
                       style=[("VALIGN",(0,0),(-1,-1),"TOP"),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
    story += [Spacer(1, 3*mm), Paragraph("How to read the pilot", H2),
              Paragraph("Exposure measures how vulnerable the existing revenue engine is to AI-led automation or pricing pressure. Readiness measures evidence of platform migration, domain moat, productivity conversion and management delivery. A high score on one axis does not cancel the other.", BODY),
              Paragraph("Important: every historical score was reconstructed on 9 September 2026 from dated official disclosures. This avoids pretending that we made the call in real time.", CALLOUT), PageBreak()]

    story += [Paragraph("SCORE TRAJECTORY", KICKER), Paragraph("Readiness strengthened - by different routes", H1),
              Paragraph("All three companies improved their reconstructed readiness score. Intellect entered with lower disruption exposure because of its product-led model. TCS built the strongest readiness evidence but retains high exposure to changes in effort-led services. Tata Elxsi improved, while its design-engineering revenue growth slowed.", BODY),
              readiness_chart(), Spacer(1, 7*mm), Paragraph("FY26 exposure versus readiness", H2),
              Paragraph('<font color="#C7A348"><b>GOLD</b></font> = exposure &nbsp;&nbsp; <font color="#16A394"><b>TEAL</b></font> = readiness', SMALL),
              latest_bar_chart(), Spacer(1, 3*mm),
              Paragraph("The two-axis view prevents a simplistic AI winner/loser label: a company can be highly exposed and still execute a credible transition.", CALLOUT), PageBreak()]

    operating_rows = [["Company", "FY26 revenue bridge", "Margin bridge", "Additional operating evidence"],
                      *[[c["name"], c["revenue"], c["margin"], c["evidence"]] for c in companies]]
    story += [Paragraph("OPERATING EVIDENCE", KICKER), Paragraph("Narrative claims must meet measurable delivery", H1),
              Paragraph("The operating bridge keeps unlike units separate. It will not combine INR and USD revenue series, and it does not treat platform revenue as AI revenue unless management reports that link explicitly.", BODY),
              Spacer(1, 3*mm), styled_table(operating_rows, [48*mm, 34*mm, 30*mm, 60*mm], font=7.2), Spacer(1, 8*mm),
              Paragraph("Company interpretation", H2),
              styled_table([
                  [Paragraph("INTELLECT", SMALL), Paragraph("Product economics provide lower structural exposure. FY26 platform conversion is encouraging, though the margin bridge and unsegmented AI revenue warrant continued verification.", SMALL)],
                  [Paragraph("TCS", SMALL), Paragraph("Readiness evidence is strongest, but the scale of its services model leaves material exposure. Revenue, margin and workforce movement must be read together.", SMALL)],
                  [Paragraph("TATAELXSI", SMALL), Paragraph("Specialised engineering and design offer a domain moat. Slowing growth means the transition case still depends on measurable monetisation and delivery.", SMALL)],
              ], [30*mm, 142*mm], header=False, font=8), Spacer(1, 7*mm),
              Paragraph("Current pilot conclusion", H2),
              Paragraph("Operating evidence supports a differentiated transition story for each company, but no single metric is sufficient. The framework is most useful as a disciplined investigation queue, not a valuation shortcut.", CALLOUT), PageBreak()]

    market_rows = [["Company", "FY23 12m", "FY24 12m", "FY25 12m", "FY26 3m"], *market]
    source_rows = [[Paragraph(f"<b>{a}</b>", SMALL), Paragraph(b, SMALL)] for a,b in sources]
    story += [Paragraph("OUTCOME CHECK", KICKER), Paragraph("Higher readiness did not guarantee immediate outperformance", H1),
              Paragraph("Relative returns below compare each company with Nifty IT using adjusted closing prices. Positive means outperformance; negative means underperformance. The FY26 observation is only a three-month reading.", BODY),
              styled_table(market_rows, [44*mm, 30*mm, 30*mm, 30*mm, 30*mm], font=7.5), Spacer(1, 7*mm),
              Paragraph("What we learned", H2),
              Paragraph("The outcome record is mixed. Intellect's FY23 and FY25 assessments were followed by relative outperformance, while FY24 and the short FY26 window were not. TCS underperformed in most complete windows despite improving readiness. Tata Elxsi was also mixed. This is evidence against presenting the score as a near-term price predictor.", BODY),
              Paragraph("A proper prospective validation begins only after the methodology and scores are frozen. Future observations should be appended without rewriting earlier scores.", CALLOUT),
              Spacer(1, 6*mm), Paragraph("Evidence and control notes", H2), styled_table(source_rows, [47*mm, 125*mm], header=False, font=7.2),
              Spacer(1, 5*mm), Paragraph("Limits: three companies are not a universe-level validation. Reconstructed histories contain hindsight risk. Market outcomes do not establish AI causality. This material is informational and is not investment advice.", SMALL)]
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build_pdf(OUTPUT)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.write_bytes(OUTPUT.read_bytes())
    print(OUTPUT)
