import PDFDocument from "pdfkit";
import type { ResearchDossier } from "./dossier";

export type DossierPdfPeer = {
  ticker: string;
  epsTtm?: number | null;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  roce?: number | null;
  debtEquity?: number | null;
  revenueGrowthYoY?: number | null;
  operatingMargin?: number | null;
  marketCapCr?: number | null;
  week52Return?: number | null;
};

export type DossierPdfPayload = {
  dossier: ResearchDossier;
  peers?: DossierPdfPeer[];
  enrichment?: {
    executiveSummary?: {
      companyLine?: string | null;
      companyHistory?: string | null;
      keyNumber?: string | null;
      biggestRisk?: string | null;
    };
    promoterNames?: string[];
    shareholdingAsOf?: string | null;
    shareholding?: Record<string, { value?: number | null; trend?: string | null }>;
    sourceUrls?: string[];
  } | null;
  market?: {
    price?: number | null;
    asOf?: string | null;
    delayed?: boolean;
    priceHistory?: Array<{ date: string; close: number }>;
  } | null;
  bms?: {
    score?: number | null;
    stage?: string | null;
    period?: string | null;
    components?: Array<{ label: string; score: number }>;
  } | null;
};

const C = {
  navy: "#172033",
  ink: "#263044",
  slate: "#667085",
  line: "#D7DDE7",
  pale: "#F4F7FA",
  green: "#2A825F",
  greenPale: "#EAF6F0",
  gold: "#CDA434",
  red: "#B54747",
  white: "#FFFFFF",
};

const clean = (value: unknown) => String(value ?? "")
  .replaceAll("₹", "Rs. ").replaceAll("•", "-").replaceAll("·", "-")
  .replaceAll("–", "-").replaceAll("—", "-").replaceAll("’", "'")
  .replaceAll("“", "\"").replaceAll("”", "\"");

const fmt = (value: number | null | undefined, suffix = "") => value == null || !Number.isFinite(value)
  ? "N/A"
  : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;

class Report {
  doc: PDFKit.PDFDocument;
  margin = 42;
  bottom = 48;
  y = 42;
  section = "Overview";

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
  }

  get width() { return this.doc.page.width - this.margin * 2; }
  get limit() { return this.doc.page.height - this.bottom; }

  runningHeader() {
    this.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate)
      .text(`ALPHASYNTH INTELLIGENCE  /  ${clean(this.section).toUpperCase()}`, this.margin, this.y, { lineBreak: false });
    this.y += 10;
    this.doc.strokeColor(C.gold).lineWidth(0.7).moveTo(this.margin, this.y).lineTo(this.doc.page.width - this.margin, this.y).stroke();
    this.y += 14;
  }

  ensure(height: number) {
    if (this.y + height > this.limit) this.newPage(true);
  }

  newPage(withHeader = false) {
    this.doc.addPage();
    this.y = withHeader ? 34 : 42;
    if (withHeader) this.runningHeader();
  }

  title(text: string, subtitle?: string) {
    this.section = text;
    this.newPage(false);
    this.doc.font("Helvetica-Bold").fontSize(8).fillColor(C.gold)
      .text("ALPHASYNTH INTELLIGENCE  /  RESEARCH DOSSIER", this.margin, this.y);
    this.y += 18;
    this.doc.font("Helvetica-Bold").fontSize(21).fillColor(C.navy).text(clean(text), this.margin, this.y, { width: this.width });
    this.y = this.doc.y + 7;
    this.doc.strokeColor(C.green).lineWidth(1.4).moveTo(this.margin, this.y).lineTo(this.doc.page.width - this.margin, this.y).stroke();
    this.y += 10;
    if (subtitle) {
      this.doc.font("Helvetica").fontSize(8.5).fillColor(C.slate).text(clean(subtitle), this.margin, this.y, { width: this.width, lineGap: 1 });
      this.y = this.doc.y + 8;
    }
  }

  heading(text: string) {
    this.ensure(28);
    this.y += 5;
    this.doc.font("Helvetica-Bold").fontSize(12).fillColor(C.navy).text(clean(text), this.margin, this.y);
    this.y = this.doc.y + 4;
    this.doc.strokeColor(C.green).lineWidth(0.8).moveTo(this.margin, this.y).lineTo(this.doc.page.width - this.margin, this.y).stroke();
    this.y += 8;
  }

  paragraph(text: unknown, options: { size?: number; color?: string; indent?: number; bold?: boolean } = {}) {
    const size = options.size ?? 9;
    const indent = options.indent ?? 0;
    const content = clean(text);
    const height = this.doc.heightOfString(content, { width: this.width - indent, lineGap: 2 }) + 3;
    this.ensure(height);
    this.doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(options.color ?? C.ink)
      .text(content, this.margin + indent, this.y, { width: this.width - indent, lineGap: 2 });
    this.y = this.doc.y + 3;
  }

  callout(label: string, value: string, x: number, width: number) {
    this.doc.roundedRect(x, this.y, width, 42, 4).fillAndStroke(C.greenPale, C.line);
    this.doc.font("Helvetica-Bold").fontSize(14).fillColor(C.green).text(clean(value), x + 10, this.y + 9, { width: width - 20, align: "center" });
    this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.slate).text(clean(label).toUpperCase(), x + 8, this.y + 28, { width: width - 16, align: "center" });
  }

  bars(title: string, values: Array<{ label: string; value: number }>, neutralMarker = false) {
    this.heading(title);
    if (!values.length) return this.paragraph("Verified data was not available.", { color: C.slate });
    const gap = 10;
    const barWidth = (this.width - gap * (values.length - 1)) / values.length;
    const chartHeight = 105;
    this.ensure(chartHeight + 22);
    const top = this.y;
    values.forEach((item, index) => {
      const value = Math.max(0, Math.min(100, item.value));
      const x = this.margin + index * (barWidth + gap);
      const h = chartHeight * value / 100;
      this.doc.roundedRect(x, top, barWidth, chartHeight, 3).fill(C.pale);
      this.doc.roundedRect(x, top + chartHeight - h, barWidth, Math.max(2, h), 3).fill(C.green);
      if (neutralMarker) {
        this.doc.strokeColor(C.gold).lineWidth(1).dash(2, { space: 2 })
          .moveTo(x, top + chartHeight / 2).lineTo(x + barWidth, top + chartHeight / 2).stroke().undash();
      }
      this.doc.font("Helvetica-Bold").fontSize(9).fillColor(value > 15 ? C.white : C.navy)
        .text(fmt(value), x, top + chartHeight - Math.max(15, h) + 4, { width: barWidth, align: "center" });
      this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.slate)
        .text(clean(item.label).toUpperCase(), x - 2, top + chartHeight + 7, { width: barWidth + 4, align: "center" });
    });
    this.y = top + chartHeight + 27;
  }

  priceChart(points: Array<{ date: string; close: number }>) {
    this.heading("Twelve-month share-price movement");
    const valid = points.filter((point) => Number.isFinite(point.close));
    if (valid.length < 2) return this.paragraph("Verified price history was not available.", { color: C.slate });
    this.ensure(145);
    const chartX = this.margin + 42;
    const chartY = this.y + 4;
    const chartWidth = this.width - 50;
    const chartHeight = 105;
    const values = valid.map((point) => point.close);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const range = Math.max(1, high - low);
    for (let i = 0; i <= 4; i += 1) {
      const gy = chartY + chartHeight * i / 4;
      this.doc.strokeColor(C.line).lineWidth(0.5).moveTo(chartX, gy).lineTo(chartX + chartWidth, gy).stroke();
      this.doc.font("Helvetica").fontSize(6.5).fillColor(C.slate)
        .text(`Rs. ${fmt(high - range * i / 4)}`, this.margin, gy - 3, { width: 38, align: "right" });
    }
    this.doc.strokeColor(C.green).lineWidth(1.8);
    valid.forEach((point, index) => {
      const x = chartX + index / (valid.length - 1) * chartWidth;
      const y = chartY + chartHeight - (point.close - low) / range * chartHeight;
      if (index === 0) this.doc.moveTo(x, y); else this.doc.lineTo(x, y);
    });
    this.doc.stroke();
    this.doc.font("Helvetica").fontSize(7).fillColor(C.slate)
      .text(clean(valid[0].date), chartX, chartY + chartHeight + 7)
      .text(clean(valid.at(-1)?.date), chartX + chartWidth - 85, chartY + chartHeight + 7, { width: 85, align: "right" });
    this.y = chartY + chartHeight + 24;
  }

  table(title: string, headers: string[], widths: number[], rows: string[][]) {
    this.heading(title);
    if (!rows.length) return this.paragraph("Comparable structured figures were not available.", { color: C.slate });
    const total = widths.reduce((sum, width) => sum + width, 0);
    const scaled = widths.map((width) => width / total * this.width);
    const header = () => {
      this.ensure(22);
      let x = this.margin;
      this.doc.rect(this.margin, this.y, this.width, 22).fill(C.navy);
      headers.forEach((cell, index) => {
        this.doc.font("Helvetica-Bold").fontSize(6.3).fillColor(C.white)
          .text(clean(cell), x + 4, this.y + 7, { width: scaled[index] - 8, lineBreak: false });
        x += scaled[index];
      });
      this.y += 22;
    };
    header();
    rows.forEach((row, rowIndex) => {
      const heights = row.map((cell, index) => this.doc.heightOfString(clean(cell), { width: scaled[index] - 8, lineGap: 1 }));
      const rowHeight = Math.max(20, Math.min(42, Math.max(...heights) + 9));
      if (this.y + rowHeight > this.limit) {
        this.newPage(true);
        header();
      }
      this.doc.rect(this.margin, this.y, this.width, rowHeight).fill(rowIndex === 0 ? C.greenPale : rowIndex % 2 ? C.pale : C.white);
      let x = this.margin;
      row.forEach((cell, index) => {
        this.doc.font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(6.7).fillColor(C.ink)
          .text(clean(cell), x + 4, this.y + 6, { width: scaled[index] - 8, height: rowHeight - 7, ellipsis: true, lineGap: 1 });
        x += scaled[index];
      });
      this.y += rowHeight;
    });
    this.y += 6;
  }

  footer(symbol: string) {
    const pages = this.doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page += 1) {
      this.doc.switchToPage(page);
      this.doc.font("Helvetica").fontSize(7).fillColor(C.slate)
        .text(`AlphaSynth Intelligence  |  ${clean(symbol)}  |  Page ${page + 1} of ${pages.count}`, this.margin, this.doc.page.height - 29, { width: this.width, align: "center", lineBreak: false });
    }
  }
}

export async function renderDossierPdf(payload: DossierPdfPayload): Promise<Buffer> {
  const { dossier, peers = [], enrichment, market, bms } = payload;
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: {
    Title: `${dossier.company.name} Research Dossier`,
    Author: "AlphaSynth Intelligence",
    Subject: "Evidence-backed company research dossier",
  } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const r = new Report(doc);

  doc.rect(0, 0, doc.page.width, 125).fill(C.navy);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(C.gold).text("ALPHASYNTH INTELLIGENCE", r.margin, 39);
  doc.font("Helvetica-Bold").fontSize(25).fillColor(C.white).text(clean(dossier.company.name), r.margin, 58, { width: r.width });
  doc.font("Helvetica").fontSize(9).fillColor("#C8D0DF")
    .text(`${clean(dossier.company.symbol)}  /  ${clean(dossier.company.exchange)}  /  ${clean(dossier.company.sector)}`, r.margin, 98);
  r.y = 148;
  if (enrichment?.executiveSummary?.companyLine) r.paragraph(enrichment.executiveSummary.companyLine, { size: 12, bold: true, color: C.navy });
  const cardGap = 9;
  const cardWidth = (r.width - cardGap * 3) / 4;
  const allClaims = Object.values(dossier.sections).flat();
  const supported = allClaims.filter((claim) => claim.status === "supported").length;
  const cards = [
    ["BMS SCORE", fmt(bms?.score)], ["LIFE-CYCLE", bms?.stage || "N/A"],
    ["OFFICIAL SOURCES", fmt(dossier.sources.length)], ["SUPPORTED CLAIMS", fmt(supported)],
  ];
  cards.forEach(([label, value], index) => r.callout(label, value, r.margin + index * (cardWidth + cardGap), cardWidth));
  r.y += 58;
  r.heading("Investment-research orientation");
  r.paragraph(`This dossier separates the frozen Business Momentum Signal from the supporting company research. The BMS remains an evidence-based change signal; this report adds context, financial tables, peers and cited developments without changing that score.`, { size: 9 });
  r.heading("Company history and identity");
  r.paragraph(enrichment?.executiveSummary?.companyHistory || "A concise verified company history was not available from the supplemental sources.", { color: enrichment?.executiveSummary?.companyHistory ? C.ink : C.slate });
  r.paragraph(enrichment?.promoterNames?.length
    ? `Promoters / promoter principals disclosed in the supplemental record: ${enrichment.promoterNames.join(", ")}.`
    : "Verified promoter names were not available in the supplemental record.", { size: 8.5, color: C.slate });
  r.heading("Company snapshot");
  dossier.sections.snapshot.filter((claim) => claim.status === "supported").slice(0, 4)
    .forEach((claim) => r.paragraph(`${claim.text} [${claim.sourceIds.join(", ")}]`, { indent: 8 }));

  r.title("Momentum anatomy", "The five bars are normalized change scores. Fifty is the neutral reference point; these are not portfolio weights.");
  r.bars("Business Momentum components", (bms?.components || []).map((item) => ({ label: item.label, value: item.score })), true);
  r.paragraph("How to read the chart: scores above 50 indicate improving evidence relative to the model's comparison basis; scores below 50 indicate deterioration. The components explain the overall signal, but none is an allocation recommendation.", { size: 8, color: C.slate });
  if (market?.priceHistory?.length) r.priceChart(market.priceHistory);
  r.paragraph(`Latest available close: Rs. ${fmt(market?.price)}${market?.asOf ? ` as of ${clean(market.asOf).slice(0, 10)}` : ""}${market?.delayed ? " (delayed market data)" : ""}.`, { size: 8, color: C.slate });

  const labels: Record<string, string> = { promoter: "Promoter", fii: "Foreign institutions", dii: "Domestic institutions", mutualFund: "Mutual funds", retail: "Retail / public" };
  const ownership = Object.entries(enrichment?.shareholding || {})
    .filter(([, item]) => item?.value != null)
    .map(([key, item]) => ({ label: labels[key] || key, value: Number(item.value) }));
  r.bars(`Latest disclosed shareholding${enrichment?.shareholdingAsOf ? ` - ${enrichment.shareholdingAsOf}` : ""}`, ownership);
  r.paragraph("A quarter-on-quarter direction is deliberately not shown unless both current and prior dated shareholding filings are present and comparable.", { size: 8, color: C.slate });

  r.title("Financial performance", "Company figures come from admitted official documents. Missing values are shown as N/A and are never estimated.");
  r.table("Quarter-wise company performance", ["Period", "Basis", "Revenue Rs.Cr", "EBITDA Rs.Cr", "EBITDA %", "PAT Rs.Cr", "EPS"], [20, 18, 22, 22, 18, 20, 14],
    (dossier.quarterlyPerformance || []).map((q) => [`${q.period} [${q.sourceIds.join(", ")}]`, q.basis, fmt(q.revenueCr), fmt(q.ebitdaCr), fmt(q.ebitdaMarginPct, "%"), fmt(q.patCr), fmt(q.eps)]));
  r.table("Peer comparison - valuation and quality", ["Company", "EPS TTM", "P/E", "P/B", "ROE %", "ROCE %"], [30, 17, 14, 14, 16, 16],
    peers.map((p) => [p.ticker, fmt(p.epsTtm), fmt(p.pe), fmt(p.pb), fmt(p.roe), fmt(p.roce)]));
  r.table("Peer comparison - growth and position", ["Company", "D/E", "Revenue YoY", "Op. margin", "Mkt cap Rs.Cr", "52W return"], [28, 14, 20, 19, 24, 18],
    peers.map((p) => [p.ticker, fmt(p.debtEquity), fmt(p.revenueGrowthYoY, "%"), fmt(p.operatingMargin, "%"), fmt(p.marketCapCr), fmt(p.week52Return, "%")]));
  r.paragraph("Peer figures are supplemental market comparisons and may use a different reporting basis or update time from the company's official quarterly figures.", { size: 8, color: C.slate });

  r.title("Material developments and risks", "The narrative is intentionally selective: only developments, operating evidence, commitments and risks that warrant investor attention are shown.");
  const sections: Array<[keyof ResearchDossier["sections"], string]> = [
    ["developments", "Important developments"], ["operatingEvidence", "Operating evidence"],
    ["managementCommitments", "Management commitments"], ["risks", "Risks and watch items"],
  ];
  sections.forEach(([key, label]) => {
    r.heading(label);
    const claims = dossier.sections[key].slice(0, 6);
    if (!claims.length) r.paragraph("No verified evidence was available.", { color: C.slate });
    claims.forEach((claim) => r.paragraph(`${claim.status === "supported" ? "" : `${claim.status.replaceAll("_", " ").toUpperCase()}: `}${claim.text} [${claim.sourceIds.join(", ")}]`, { indent: 8 }));
  });

  if (dossier.marketConversation.status === "available" && dossier.marketConversation.sampleSize > 0) {
    r.heading("Market conversation - experimental, non-scoring");
    r.paragraph(`Sample size ${dossier.marketConversation.sampleSize}. Sentiment mix: ${fmt(dossier.marketConversation.sentiment.positive * 100, "%")} positive, ${fmt(dossier.marketConversation.sentiment.neutral * 100, "%")} neutral and ${fmt(dossier.marketConversation.sentiment.negative * 100, "%")} negative. This section never affects BMS.`, { size: 8.5 });
  }

  r.title("Sources and quality control");
  r.heading("Admitted official sources");
  dossier.sources.forEach((source) => {
    r.paragraph(`${source.sourceId}  /  ${source.sourceClass}  /  Published ${source.publishedAt || "date unavailable"}`, { size: 8, bold: true });
    r.paragraph(source.url, { size: 7, color: "#2557A7", indent: 8 });
  });
  r.heading("Quality-control summary");
  r.paragraph(`Unsupported claims: ${dossier.qualityControl.unsupportedClaims}. Conflicts: ${dossier.qualityControl.conflicts}. Human review required: ${dossier.qualityControl.humanReviewRequired ? "Yes" : "No"}.`, { bold: true });
  r.paragraph("AI-generated research for informational purposes only. Verify material claims against the cited official documents. Supplemental market, promoter, ownership and peer data should be checked against the latest exchange filing. This is not investment advice.", { size: 8, color: C.slate });

  r.footer(dossier.company.symbol);
  doc.end();
  return completed;
}
