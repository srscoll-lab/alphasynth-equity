import PDFDocument from "pdfkit";
import type { ResearchDossier } from "./dossier";
import { BMS_FACTOR_DEFINITIONS, type BmsFactorAnalysis } from "./bms-factor-schema";
import type { ExpectationDeliveryAssessment, ExpectationDeliveryInput } from "./expectation-delivery";

export type DossierPdfPeer = {
  ticker: string;
  name?: string | null;
  isTarget?: boolean;
  epsTtm?: number | null;
  epsGrowthYoY?: number | null;
  peg?: number | null;
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

export type DossierPdfFinancialRow = {
  period: string;
  basis: "consolidated" | "standalone" | "unknown";
  revenueCr?: number | null;
  ebitdaCr?: number | null;
  ebitdaMarginPct?: number | null;
  patCr?: number | null;
  eps?: number | null;
  profitMetric?: "ebitda" | "operating_profit";
  sourceIds?: string[];
  sourceUrl?: string | null;
  sourceLabel?: string | null;
};

export type DossierPdfPayload = {
  dossier: ResearchDossier;
  peers?: DossierPdfPeer[];
  financials?: DossierPdfFinancialRow[];
  enrichment?: {
    executiveSummary?: {
      companyLine?: string | null;
      companyHistory?: string | null;
      keyNumber?: string | null;
      biggestRisk?: string | null;
    };
    promoterNames?: string[];
    publicCommentary?: {
      asOf?: string | null;
      summary?: string | null;
      viewpoints?: Array<{
        sourceName: string;
        sourceType?: "publication" | "analyst" | "investor_forum" | "social_media";
        publishedAt?: string | null;
        stance: "positive" | "cautious" | "mixed" | "negative";
        summary: string;
        url: string;
      }>;
    } | null;
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
    factorAnalysis?: BmsFactorAnalysis | null;
    components?: Array<{ label: string; score: number }>;
  } | null;
  deliveryCheck?: {
    input: ExpectationDeliveryInput;
    assessment: ExpectationDeliveryAssessment;
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
  white: "#FFFFFF",
};

const clean = (value: unknown) => String(value ?? "")
  .replaceAll("₹", "Rs. ").replaceAll("•", "-").replaceAll("·", "-")
  .replaceAll("–", "-").replaceAll("—", "-").replaceAll("’", "'")
  .replaceAll("“", "\"").replaceAll("”", "\"");

const fmt = (value: number | null | undefined, suffix = "") => value == null || !Number.isFinite(value)
  ? "N/A"
  : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;

const sourceHost = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "source link"; }
};

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

  bars(title: string, values: Array<{ label: string; value: number }>, neutralMarker = false, palette: string[] = [C.green]) {
    const chartHeight = 100;
    this.ensure(67 + chartHeight);
    this.y += 12;
    this.heading(title);
    if (!values.length) return this.paragraph("Verified data was not available.", { color: C.slate });
    const gap = 10;
    const barWidth = (this.width - gap * (values.length - 1)) / values.length;
    const top = this.y;
    values.forEach((item, index) => {
      const value = Math.max(0, Math.min(100, item.value));
      const x = this.margin + index * (barWidth + gap);
      const h = chartHeight * value / 100;
      this.doc.roundedRect(x, top, barWidth, chartHeight, 3).fill(C.pale);
      this.doc.roundedRect(x, top + chartHeight - h, barWidth, Math.max(2, h), 3).fill(palette[index % palette.length]);
      if (neutralMarker) {
        this.doc.strokeColor(C.gold).lineWidth(1).dash(2, { space: 2 })
          .moveTo(x, top + chartHeight / 2).lineTo(x + barWidth, top + chartHeight / 2).stroke().undash();
      }
      this.doc.font("Helvetica-Bold").fontSize(9).fillColor(value > 15 ? C.white : C.navy)
        .text(fmt(value), x, top + chartHeight - Math.max(15, h) + 4, { width: barWidth, align: "center" });
      this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.slate)
        .text(clean(item.label).toUpperCase(), x - 2, top + chartHeight + 7, { width: barWidth + 4, align: "center" });
    });
    this.y = top + chartHeight + 38;
  }

  priceChart(points: Array<{ date: string; close: number }>) {
    this.ensure(210);
    this.heading("Twelve-month share-price movement");
    const valid = points.filter((point) => Number.isFinite(point.close));
    if (valid.length < 2) return this.paragraph("Verified price history was not available.", { color: C.slate });
    const chartX = this.margin + 42;
    const chartY = this.y + 8;
    const chartWidth = this.width - 50;
    const chartHeight = 142;
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
    const extrema = [
      { index: values.indexOf(Math.min(...values)), color: C.navy, label: "LOW" },
      { index: values.indexOf(Math.max(...values)), color: C.gold, label: "HIGH" },
      { index: valid.length - 1, color: C.green, label: "LATEST" },
    ].filter((marker, index, list) => list.findIndex((candidate) => candidate.index === marker.index) === index);
    extrema.forEach((marker) => {
      const point = valid[marker.index];
      const x = chartX + marker.index / (valid.length - 1) * chartWidth;
      const py = chartY + chartHeight - (point.close - low) / range * chartHeight;
      this.doc.strokeColor(marker.color).lineWidth(0.8).dash(3, { space: 2 })
        .moveTo(x, chartY).lineTo(x, chartY + chartHeight).stroke().undash();
      this.doc.circle(x, py, 2.8).fill(marker.color);
      const labelX = Math.max(chartX, Math.min(chartX + chartWidth - 77, x - 38));
      const nearLaterMarker = extrema.some((candidate) => candidate.index > marker.index && Math.abs(candidate.index - marker.index) < Math.max(3, valid.length * 0.12));
      const desiredY = nearLaterMarker ? py - 34 : marker.label === "LATEST" ? py + 9 : py - 28;
      const labelY = Math.max(chartY + 3, Math.min(chartY + chartHeight - 26, desiredY));
      this.doc.roundedRect(labelX, labelY, 77, 22, 3).fillAndStroke(C.white, marker.color);
      this.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(marker.color)
        .text(`${marker.label}  RS. ${fmt(point.close)}`, labelX + 4, labelY + 4, { width: 69, align: "center", lineBreak: false });
      this.doc.font("Helvetica").fontSize(5.8).fillColor(C.slate)
        .text(clean(point.date), labelX + 4, labelY + 12, { width: 69, align: "center", lineBreak: false });
    });
    this.doc.font("Helvetica").fontSize(7).fillColor(C.slate)
      .text(clean(valid[0].date), chartX, chartY + chartHeight + 7)
      .text(clean(valid.at(-1)?.date), chartX + chartWidth - 85, chartY + chartHeight + 7, { width: 85, align: "right" });
    this.y = chartY + chartHeight + 36;
  }

  financialTrend(rows: Array<{ period: string; revenue: number | null; pat: number | null }>) {
    this.ensure(170);
    this.heading("Revenue and profit progression");
    const valid = rows.filter((row) => row.revenue != null || row.pat != null).slice().reverse();
    if (!valid.length) return this.paragraph("Comparable quarterly trend data was not available.", { color: C.slate });
    const chartX = this.margin + 38;
    const chartY = this.y + 7;
    const chartWidth = this.width - 45;
    const chartHeight = 96;
    const maximum = Math.max(1, ...valid.flatMap((row) => [row.revenue || 0, row.pat || 0]));
    const groupWidth = chartWidth / valid.length;
    for (let i = 0; i <= 4; i += 1) {
      const gy = chartY + chartHeight * i / 4;
      this.doc.strokeColor(C.line).lineWidth(0.5).moveTo(chartX, gy).lineTo(chartX + chartWidth, gy).stroke();
      this.doc.font("Helvetica").fontSize(6).fillColor(C.slate)
        .text(fmt(maximum - maximum * i / 4), this.margin, gy - 3, { width: 32, align: "right" });
    }
    valid.forEach((row, index) => {
      const baseX = chartX + index * groupWidth + groupWidth * 0.21;
      const barWidth = Math.min(24, groupWidth * 0.23);
      const revenueHeight = chartHeight * (row.revenue || 0) / maximum;
      const patHeight = chartHeight * (row.pat || 0) / maximum;
      this.doc.rect(baseX, chartY + chartHeight - revenueHeight, barWidth, revenueHeight).fill(C.navy);
      this.doc.rect(baseX + barWidth + 4, chartY + chartHeight - patHeight, barWidth, patHeight).fill(C.gold);
      this.doc.font("Helvetica-Bold").fontSize(6).fillColor(C.slate)
        .text(clean(row.period), chartX + index * groupWidth, chartY + chartHeight + 7, { width: groupWidth, align: "center" });
    });
    this.doc.rect(chartX, chartY + chartHeight + 25, 8, 8).fill(C.navy);
    this.doc.font("Helvetica").fontSize(7).fillColor(C.slate).text("Revenue", chartX + 12, chartY + chartHeight + 25);
    this.doc.rect(chartX + 75, chartY + chartHeight + 25, 8, 8).fill(C.gold);
    this.doc.text("PAT", chartX + 87, chartY + chartHeight + 25);
    this.y = chartY + chartHeight + 48;
  }

  marginAndEpsTrend(rows: Array<{ period: string; margin: number | null; eps: number | null }>, marginLabel = "EBITDA MARGIN (%)") {
    this.ensure(160);
    this.heading("Margin and earnings-per-share trend");
    const valid = rows.slice().reverse();
    const panels = [
      { label: marginLabel, color: C.green, values: valid.map((row) => row.margin) },
      { label: "EPS (RS.)", color: C.gold, values: valid.map((row) => row.eps) },
    ];
    const panelWidth = (this.width - 18) / 2;
    const top = this.y + 6;
    panels.forEach((panel, panelIndex) => {
      const x = this.margin + panelIndex * (panelWidth + 18);
      const numbers = panel.values.filter((value): value is number => value != null && Number.isFinite(value));
      const maximum = Math.max(1, ...numbers) * 1.12;
      this.doc.roundedRect(x, top, panelWidth, 102, 5).fill(C.pale);
      this.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate).text(panel.label, x + 10, top + 9);
      const chartX = x + 12;
      const chartY = top + 26;
      const chartWidth = panelWidth - 24;
      const chartHeight = 52;
      this.doc.strokeColor(C.line).lineWidth(0.5).moveTo(chartX, chartY + chartHeight).lineTo(chartX + chartWidth, chartY + chartHeight).stroke();
      panel.values.forEach((value, index) => {
        if (value == null) return;
        const barWidth = Math.min(22, chartWidth / Math.max(1, valid.length) * 0.48);
        const center = chartX + (index + 0.5) / valid.length * chartWidth;
        const height = chartHeight * value / maximum;
        this.doc.rect(center - barWidth / 2, chartY + chartHeight - height, barWidth, height).fill(panel.color);
        this.doc.font("Helvetica-Bold").fontSize(6).fillColor(C.ink).text(fmt(value), center - 22, chartY + chartHeight - height - 10, { width: 44, align: "center" });
        this.doc.font("Helvetica").fontSize(5.6).fillColor(C.slate).text(clean(valid[index].period), center - 28, chartY + chartHeight + 6, { width: 56, align: "center" });
      });
    });
    this.y = top + 121;
  }

  peerPositionChart(peers: DossierPdfPeer[]) {
    const valid = peers.filter((peer) => peer.revenueGrowthYoY != null && peer.operatingMargin != null);
    if (valid.length < 2) return;
    this.ensure(205);
    this.heading("Peer positioning - growth versus operating margin");
    const chartX = this.margin + 46;
    const chartY = this.y + 9;
    const chartWidth = this.width - 58;
    const chartHeight = 105;
    const xs = valid.map((peer) => Number(peer.revenueGrowthYoY));
    const ys = valid.map((peer) => Number(peer.operatingMargin));
    const xMin = Math.min(...xs) - 2;
    const xMax = Math.max(...xs) + 2;
    const yMin = Math.max(0, Math.min(...ys) - 2);
    const yMax = Math.max(...ys) + 2;
    for (let i = 0; i <= 4; i += 1) {
      const gx = chartX + chartWidth * i / 4;
      const gy = chartY + chartHeight * i / 4;
      this.doc.strokeColor(C.line).lineWidth(0.5).moveTo(gx, chartY).lineTo(gx, chartY + chartHeight).stroke();
      this.doc.moveTo(chartX, gy).lineTo(chartX + chartWidth, gy).stroke();
      this.doc.font("Helvetica").fontSize(5.8).fillColor(C.slate)
        .text(`${(xMin + (xMax - xMin) * i / 4).toFixed(1)}%`, gx - 20, chartY + chartHeight + 4, { width: 40, align: "center", lineBreak: false })
        .text(`${(yMax - (yMax - yMin) * i / 4).toFixed(1)}%`, this.margin + 4, gy - 3, { width: 36, align: "right", lineBreak: false });
    }
    valid.forEach((peer, index) => {
      const x = chartX + (Number(peer.revenueGrowthYoY) - xMin) / Math.max(1, xMax - xMin) * chartWidth;
      const y = chartY + chartHeight - (Number(peer.operatingMargin) - yMin) / Math.max(1, yMax - yMin) * chartHeight;
      const color = index === 0 ? C.gold : C.green;
      this.doc.circle(x, y, index === 0 ? 5 : 4).fill(color);
      this.doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(6.5).fillColor(C.ink)
        .text(clean(peer.ticker), x + 6, y - 4, { width: 70, lineBreak: false });
    });
    this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.slate)
      .text("REVENUE GROWTH (YOY) ->", chartX, chartY + chartHeight + 18, { width: chartWidth, align: "center" });
    this.doc.save().rotate(-90, { origin: [this.margin + 9, chartY + chartHeight / 2] })
      .text("OPERATING MARGIN ->", this.margin - 48, chartY + chartHeight / 2 - 4, { width: 118, align: "center", lineBreak: false }).restore();
    const legendY = chartY + chartHeight + 37;
    this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.slate).text("PEER KEY", this.margin, legendY);
    peers.slice(0, 6).forEach((peer, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = this.margin + column * (this.width / 2);
      this.doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.navy)
        .text(clean(peer.ticker), x, legendY + 13 + row * 13, { width: 62, lineBreak: false });
      this.doc.font("Helvetica").fontSize(6.5).fillColor(C.ink)
        .text(clean(peer.name || "Company name unavailable"), x + 58, legendY + 13 + row * 13, { width: this.width / 2 - 62, lineBreak: false, ellipsis: true });
    });
    this.y = legendY + 58;
  }

  table(title: string, headers: string[], widths: number[], rows: string[][]) {
    this.ensure(58 + rows.length * 24);
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
  const { dossier, enrichment, market, bms, deliveryCheck } = payload;
  const deliveryAssessment = deliveryCheck?.assessment;
  const financialRows: DossierPdfFinancialRow[] = payload.financials?.length
    ? payload.financials
    : (dossier.quarterlyPerformance || []).map((row) => ({ ...row }));
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
  const companyName = clean(dossier.company.name);
  const titleSize = companyName.length > 42 ? 19 : companyName.length > 32 ? 22 : 25;
  doc.font("Helvetica-Bold").fontSize(titleSize).fillColor(C.white)
    .text(companyName, r.margin, 55, { width: r.width, lineGap: 0 });
  const companyMetaY = Math.max(98, Math.min(110, doc.y + 4));
  doc.font("Helvetica").fontSize(9).fillColor("#C8D0DF")
    .text(`${clean(dossier.company.symbol)}  /  ${clean(dossier.company.exchange)}  /  ${clean(dossier.company.sector)}`, r.margin, companyMetaY);
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
  r.paragraph(`This dossier separates the BMS V1 assessment recorded as of ${deliveryCheck?.input.lifecycleFreezeDate || "the stated assessment date"} from subsequent company research. The BMS remains an evidence-based change signal; later evidence is evaluated without rewriting the recorded score or lifecycle.`, { size: 9 });
  r.heading("Company history and identity");
  r.paragraph(enrichment?.executiveSummary?.companyHistory || "A concise verified company history was not available from the supplemental sources.", { color: enrichment?.executiveSummary?.companyHistory ? C.ink : C.slate });
  r.paragraph(enrichment?.promoterNames?.length
    ? `Promoters / promoter principals disclosed in the supplemental record: ${enrichment.promoterNames.join(", ")}.`
    : "Verified promoter names were not available in the supplemental record.", { size: 8.5, color: C.slate });
  r.heading("Company snapshot");
  dossier.sections.snapshot.filter((claim) => claim.status === "supported").slice(0, 4)
    .forEach((claim) => r.paragraph(claim.text, { indent: 8 }));
  r.heading("Research snapshot");
  const quarterRows = financialRows;
  const usesOperatingProfit = financialRows.some((row) => row.profitMetric === "operating_profit");
  const profitLabel = usesOperatingProfit ? "Op. profit" : "EBITDA";
  const marginLabel = usesOperatingProfit ? "OPM (%)" : "EBITDA MARGIN (%)";
  const latestPat = quarterRows[0]?.patCr;
  const previousPat = quarterRows[1]?.patCr;
  const patGrowth = latestPat != null && previousPat != null && previousPat !== 0
    ? (latestPat - previousPat) / Math.abs(previousPat) * 100
    : null;
  const panelY = r.y;
  const panelWidth = (r.width - 12) / 2;
  r.doc.roundedRect(r.margin, panelY, panelWidth, 68, 5).fill(C.greenPale);
  r.doc.roundedRect(r.margin + panelWidth + 12, panelY, panelWidth, 68, 5).fill(C.pale);
  r.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate).text("DEFINING FIGURE", r.margin + 12, panelY + 12);
  r.doc.font("Helvetica-Bold").fontSize(13).fillColor(C.green).text(clean(enrichment?.executiveSummary?.keyNumber || "Verified figure unavailable"), r.margin + 12, panelY + 29, { width: panelWidth - 24 });
  r.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate).text("PRINCIPAL WATCH ITEM", r.margin + panelWidth + 24, panelY + 12);
  r.doc.font("Helvetica-Bold").fontSize(10).fillColor(C.navy).text(clean(enrichment?.executiveSummary?.biggestRisk || "No supplemental risk summary available"), r.margin + panelWidth + 24, panelY + 28, { width: panelWidth - 24, height: 31, ellipsis: true });
  const metricY = panelY + 78;
  r.doc.roundedRect(r.margin, metricY, panelWidth, 54, 5).fill(C.pale);
  r.doc.roundedRect(r.margin + panelWidth + 12, metricY, panelWidth, 54, 5).fill(C.greenPale);
  r.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate).text("PAT GROWTH - LATEST VS PRIOR QUARTER", r.margin + 12, metricY + 10);
  r.doc.font("Helvetica-Bold").fontSize(13).fillColor(C.navy).text(patGrowth == null ? "N/A" : `${fmt(patGrowth)}%`, r.margin + 12, metricY + 27);
  r.doc.font("Helvetica-Bold").fontSize(7).fillColor(C.slate).text("DELIVERY EVIDENCE COVERAGE", r.margin + panelWidth + 24, metricY + 10);
  r.doc.font("Helvetica-Bold").fontSize(13).fillColor(C.green).text(deliveryAssessment ? `${fmt(deliveryAssessment.deliveryCoverage)}%` : "N/A", r.margin + panelWidth + 24, metricY + 27);
  r.y = metricY + 66;
  r.paragraph("The snapshot is intentionally concise. Detailed evidence, financial comparisons and source records follow on the subsequent pages.", { size: 8, color: C.slate });

  r.title("BMS V1 measurement anatomy", `Assessment recorded as of ${deliveryCheck?.input.lifecycleFreezeDate || "the stated date"}. The five bars are normalized change scores; fifty is the neutral reference point, not a portfolio weight.`);
  r.bars("Business Momentum components", (bms?.components || []).map((item) => ({ label: item.label, value: item.score })), true,
    [C.green]);
  r.paragraph("How to read the chart: scores above 50 indicate improving evidence relative to the model's comparison basis; scores below 50 indicate deterioration. The components explain the overall signal, but none is an allocation recommendation.", { size: 8, color: C.slate });
  const factorAnalysis = bms?.factorAnalysis;
  const scoreAsPoints = (value: number | null | undefined) => value == null
    ? "N/A"
    : fmt(Math.abs(value) <= 1 ? value * 100 : value);
  const measurementText = (measurement: BmsFactorAnalysis["factors"][number]["current"]) => {
    const metrics = measurement.metrics.slice(0, 2).map((metric) => {
      const value = metric.value == null
        ? "N/A"
        : typeof metric.value === "number" ? fmt(metric.value) : clean(metric.value);
      return `${metric.label}: ${metric.displayValue || `${value}${metric.unit ? ` ${metric.unit}` : ""}`}`;
    });
    return metrics.length
      ? `${measurement.period || "Period unavailable"}: ${metrics.join("; ")}`
      : `${measurement.period || "Period unavailable"}: structured measurements not supplied`;
  };
  if (factorAnalysis?.factors?.length) {
    r.heading("Five-factor evidence bridge");
    factorAnalysis.factors.forEach((factor, index) => {
      const definition = BMS_FACTOR_DEFINITIONS.find((item) => item.id === factor.id)!;
      const height = 68;
      r.ensure(height + 5);
      const top = r.y + 3;
      r.doc.roundedRect(r.margin, top, r.width, height, 5).fill(index % 2 ? C.pale : C.greenPale);
      const leftWidth = 112;
      const wrapsFactorLabel = factor.label.length > 15;
      r.doc.font("Helvetica-Bold").fontSize(wrapsFactorLabel ? 9 : 10).fillColor(C.navy)
        .text(factor.label, r.margin + 10, top + 8, { width: leftWidth - 18, height: 23, ellipsis: true });
      const scoreY = wrapsFactorLabel ? top + 32 : top + 27;
      r.doc.font("Helvetica-Bold").fontSize(15).fillColor(C.green).text(scoreAsPoints(factor.current.factorScore), r.margin + 10, scoreY, { width: 42 });
      r.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.slate)
        .text(`${fmt(factor.weight * 100)}% WEIGHT`, r.margin + 52, scoreY + 4, { width: 56 })
        .text(`${factor.confidence.toUpperCase()} CONFIDENCE`, r.margin + 10, wrapsFactorLabel ? top + 52 : top + 49, { width: 96 });
      const detailX = r.margin + leftWidth;
      const detailWidth = r.width - leftWidth - 10;
      r.doc.font("Helvetica-Bold").fontSize(7.2).fillColor(C.ink)
        .text(definition.purpose, detailX, top + 7, { width: detailWidth, height: 17, ellipsis: true });
      r.doc.font("Helvetica").fontSize(6.5).fillColor(C.slate)
        .text(`Evidence considered: ${definition.evidenceSignals}.`, detailX, top + 23, { width: detailWidth, height: 11, ellipsis: true });
      const evidenceWidth = (detailWidth - 10) / 2;
      r.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.navy).text("PREVIOUS", detailX, top + 36);
      r.doc.font("Helvetica").fontSize(6.3).fillColor(C.ink)
        .text(measurementText(factor.previous), detailX, top + 45, { width: evidenceWidth, height: 17, ellipsis: true });
      r.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.navy).text("CURRENT", detailX + evidenceWidth + 10, top + 36);
      r.doc.font("Helvetica").fontSize(6.3).fillColor(C.ink)
        .text(measurementText(factor.current), detailX + evidenceWidth + 10, top + 45, { width: evidenceWidth, height: 17, ellipsis: true });
      r.y = top + height + 3;
    });
    r.paragraph("A factor score is fully explained only when structured previous and current measurements are supplied. Period-only rows are labelled as missing structured measurements rather than being retrospectively justified. Weighted contribution equals the recorded factor score multiplied by the BMS V1 weight.", { size: 7, color: C.slate });
  } else {
    r.paragraph("The BMS service did not supply a structured five-factor evidence bridge. No factor explanation has been reconstructed after the assessment.", { color: C.slate });
  }

  r.title("Market and financial evidence", usesOperatingProfit
    ? "The comparable quarterly series is reproduced from Screener's published table and should be verified against exchange filings. Missing values are never estimated."
    : "Company figures come from admitted official documents. Missing values are shown as N/A and are never estimated.");
  if (market?.priceHistory?.length) r.priceChart(market.priceHistory);
  r.financialTrend(financialRows.map((quarter) => ({ period: quarter.period, revenue: quarter.revenueCr ?? null, pat: quarter.patCr ?? null })));
  r.table("Quarter-wise company performance", ["Period", "Basis", "Revenue Rs.Cr", `${profitLabel} Rs.Cr`, usesOperatingProfit ? "OPM %" : "EBITDA %", "PAT Rs.Cr", "EPS"], [20, 18, 22, 22, 18, 20, 14],
    financialRows.map((q) => [`${q.period}${q.sourceIds?.length ? ` [${q.sourceIds.join(", ")}]` : ""}`, q.basis, fmt(q.revenueCr), fmt(q.ebitdaCr), fmt(q.ebitdaMarginPct, "%"), fmt(q.patCr), fmt(q.eps)]));

  r.title("Lifecycle confirmation layer", "This secondary layer asks whether subsequent delivery and minimum quality evidence support further investigation within the recorded BMS V1 lifecycle. It is not a second BMS score.");
  if (deliveryAssessment && deliveryCheck) {
    const direction = deliveryAssessment.deliveryDirection.replaceAll("_", " ").toUpperCase();
    const observedGates = deliveryCheck.input.qualityGates.filter((gate) => gate.result !== "unknown").length;
    const confirmationY = r.y;
    const confirmationGap = 8;
    const confirmationWidth = (r.width - confirmationGap * 3) / 4;
    [
      ["BMS V1 LIFECYCLE", deliveryAssessment.lifecycle],
      ["DELIVERY READING", direction],
      ["EVIDENCE COVERAGE", `${fmt(deliveryAssessment.deliveryCoverage)}%`],
      ["OBSERVED GATES", `${observedGates}/${deliveryCheck.input.qualityGates.length}`],
    ].forEach(([label, value], index) => r.callout(label, value, r.margin + index * (confirmationWidth + confirmationGap), confirmationWidth));
    r.y = confirmationY + 54;
    r.heading("Why this check exists");
    r.paragraph(`The BMS V1 lifecycle records where business momentum stood as of ${deliveryCheck.input.lifecycleFreezeDate}. The confirmation layer then compares later published delivery with an earlier comparable reading and checks whether basic financial, governance and operating-quality conditions are sufficiently evidenced. Its purpose is to prioritise research inside a lifecycle cohort without rewriting history.`, { size: 8.5 });
    r.table("Published delivery bridge", ["Measure", "Previous", "Current", "Change", "Direction"], [38, 15, 15, 15, 17],
      deliveryAssessment.deliveryComponents.slice(0, 3).map((component) => [
        component.label,
        `${fmt(component.baseline)}${component.unit}`,
        `${fmt(component.outcome)}${component.unit}`,
        `${component.change > 0 ? "+" : ""}${fmt(component.change)}${component.unit}`,
        component.direction.toUpperCase(),
      ]));
    r.heading("What the result means");
    r.paragraph(`The BMS V1 lifecycle recorded as of ${deliveryCheck.input.lifecycleFreezeDate} remains ${deliveryAssessment.lifecycle}. The reconstructed delivery reading is ${direction}, with ${fmt(deliveryAssessment.deliveryCoverage)}% metric coverage. Quality status is ${deliveryAssessment.qualityStatus.replaceAll("_", " ")}. This can raise or lower research priority, but it cannot rewrite the recorded lifecycle or create a buy/sell conclusion.`, { size: 8.5, bold: true });
    r.table("Interpretation rules", ["Observed combination", "Research interpretation"], [36, 64], [
      ["Ahead delivery + no hard-gate failure", "Higher priority within the same recorded lifecycle; investigate durability."],
      ["Mixed delivery", "Evidence points in opposing directions; retain for monitoring."],
      ["Behind delivery", "The momentum thesis may be weakening; require stronger subsequent evidence."],
      ["Any hard-gate failure", "Exclude from the refined shortlist while preserving the BMS V1 lifecycle record."],
      ["Low coverage / unknown gates", "Do not infer confirmation. Collect evidence and reassess after the next result."],
    ]);
    r.table("What the quality gates test", ["Gate family", "Purpose"], [30, 70], [
      ["Financial resilience", "Cash conversion, leverage and the ability to support growth without financial strain."],
      ["Governance integrity", "Promoter pledging, auditor signals and material governance or regulatory concerns."],
      ["Operating discipline", "Working-capital behaviour and customer or product concentration."],
      ["Capital allocation", "Incremental returns on capital and dependence on acquisitions."],
      ["Management reliability", "Whether reported delivery remains consistent with prior commitments."],
    ]);
    r.paragraph(`Reconstructed today as of ${deliveryCheck.input.expectationFreezeDate}. This comparison was not recorded prospectively on that historical date.`, { size: 7.5, color: C.slate });
  } else {
    r.paragraph("A comparable reconstructed delivery assessment was not available. The BMS V1 lifecycle recorded as of the stated date remains the only classification shown, and no confirmation conclusion should be inferred.", { color: C.slate });
  }

  r.title("Material developments and risks", "The narrative is intentionally selective: only developments, operating evidence, commitments and risks that warrant investor attention are shown.");
  const sections: Array<[keyof ResearchDossier["sections"], string]> = [
    ["developments", "Important developments"], ["operatingEvidence", "Operating evidence"],
    ["managementCommitments", "Management commitments"], ["risks", "Risks and watch items"],
  ];
  sections.forEach(([key, label]) => {
    r.heading(label);
    const claims = dossier.sections[key].slice(0, 6);
    if (!claims.length) r.paragraph("No verified evidence was available.", { color: C.slate });
    claims.forEach((claim) => r.paragraph(`${claim.status === "supported" ? "" : `${claim.status.replaceAll("_", " ").toUpperCase()}: `}${claim.text}`, { indent: 8 }));
    const references = [...new Set(claims.flatMap((claim) => claim.sourceIds))];
    if (references.length) r.paragraph(`Supporting records: ${references.join(", ")}.`, { size: 7, color: C.slate, indent: 8 });
  });

  const publicCommentary = enrichment?.publicCommentary;
  if (publicCommentary?.viewpoints?.length) {
    r.heading("Public market commentary");
    if (publicCommentary.summary) r.paragraph(publicCommentary.summary, { size: 8.5, color: C.slate });
    const professionalViews = publicCommentary.viewpoints.filter((viewpoint) => !["investor_forum", "social_media"].includes(viewpoint.sourceType || "publication")).slice(0, 2);
    const opinionGap = 10;
    const opinionWidth = (r.width - opinionGap) / 2;
    r.ensure(83);
    const professionalTop = r.y + 3;
    professionalViews.forEach((viewpoint, index) => {
      const top = professionalTop;
      const x = r.margin + index * (opinionWidth + opinionGap);
      const accent = viewpoint.stance === "positive" ? C.green : viewpoint.stance === "negative" ? C.navy : C.gold;
      r.doc.roundedRect(x, top, opinionWidth, 70, 5).fill(C.pale);
      r.doc.rect(x, top, 4, 70).fill(accent);
      r.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(accent)
        .text(`${clean(viewpoint.sourceName).toUpperCase()} / ${clean(viewpoint.stance).toUpperCase()}${viewpoint.publishedAt ? ` / ${clean(viewpoint.publishedAt)}` : ""}`, x + 12, top + 9, { width: opinionWidth - 22, height: 16, ellipsis: true });
      r.doc.font("Helvetica").fontSize(7.2).fillColor(C.ink)
        .text(clean(viewpoint.summary), x + 12, top + 27, { width: opinionWidth - 22, height: 35, ellipsis: true, lineGap: 1 });
    });
    r.y = professionalTop + 77;
    const socialViews = publicCommentary.viewpoints.filter((viewpoint) => ["investor_forum", "social_media"].includes(viewpoint.sourceType || "")).slice(0, 2);
    if (socialViews.length) {
      r.heading("Investor-forum and social-media pulse");
      r.ensure(75);
      const socialTop = r.y + 2;
      socialViews.forEach((viewpoint, index) => {
        const x = r.margin + index * (opinionWidth + opinionGap);
        r.doc.roundedRect(x, socialTop, opinionWidth, 62, 5).fill(C.greenPale);
        r.doc.font("Helvetica-Bold").fontSize(6.2).fillColor(C.navy)
          .text(`${clean(viewpoint.sourceName).toUpperCase()}${viewpoint.publishedAt ? ` / ${clean(viewpoint.publishedAt)}` : ""}`, x + 11, socialTop + 8, { width: opinionWidth - 22, height: 15, ellipsis: true });
        r.doc.font("Helvetica").fontSize(7).fillColor(C.ink)
          .text(clean(viewpoint.summary), x + 11, socialTop + 24, { width: opinionWidth - 22, height: 31, ellipsis: true, lineGap: 1 });
      });
      r.y = socialTop + 68;
      r.paragraph("CAUTION: Social-media and investor-forum posts are user-generated opinion. Identity, holdings, expertise and factual accuracy may be unknown. Treat them only as sentiment leads and independently verify every material assertion.", { size: 7.3, color: C.slate });
    }
    r.paragraph("All commentary is dated and paraphrased. Full links appear in the source register.", { size: 7.5, color: C.slate });
  }

  r.title("Method and source register");
  const sectionLabels: Record<string, string> = {
    snapshot: "Snapshot", developments: "Developments", operatingEvidence: "Operating evidence",
    managementCommitments: "Commitments", risks: "Risks",
  };
  const sourceCoverage = new Map<string, Set<string>>();
  Object.entries(dossier.sections).forEach(([section, claims]) => {
    claims.forEach((claim) => claim.sourceIds.forEach((sourceId) => {
      const covered = sourceCoverage.get(sourceId) || new Set<string>();
      covered.add(sectionLabels[section] || section);
      sourceCoverage.set(sourceId, covered);
    }));
  });
  r.heading("Evidence coverage at a glance");
  const coverageY = r.y;
  const coverageWidth = (r.width - 18) / 3;
  [
    ["OFFICIAL RECORDS", fmt(dossier.sources.length)],
    ["SUPPORTED CLAIMS", fmt(supported)],
    ["CONFLICTS", fmt(dossier.qualityControl.conflicts)],
  ].forEach(([label, value], index) => r.callout(label, value, r.margin + index * (coverageWidth + 9), coverageWidth));
  r.y = coverageY + 55;
  r.paragraph(`Report generated: ${clean(dossier.generatedAt).slice(0, 10)}. Every factual claim must trace to an admitted, dated official record. Public commentary is kept separate and is never treated as company evidence.`, { size: 8, color: C.slate });
  r.heading("Concise official-source register");
  dossier.sources.slice(0, 6).forEach((source) => {
    const coverage = [...(sourceCoverage.get(source.sourceId) || [])];
    const sourceLine = `${source.sourceId} / ${source.sourceClass.replaceAll("_", " ")} / ${source.publishedAt || "date unavailable"} / ${sourceHost(source.url)}${coverage.length ? ` / Used for: ${coverage.join(", ")}` : ""}`;
    r.doc.font("Helvetica-Bold").fontSize(7.3).fillColor(C.ink).text(clean(sourceLine), r.margin, r.y, { width: r.width - 76, height: 13, ellipsis: true });
    r.doc.font("Helvetica-Bold").fontSize(7.3).fillColor(C.green).text("Open source", r.margin + r.width - 70, r.y, { width: 70, align: "right", link: source.url, underline: true });
    r.y = r.doc.y + 5;
  });
  if (dossier.sources.length > 6) r.paragraph(`${dossier.sources.length - 6} additional admitted records are retained in the digital dossier.`, { size: 7, color: C.slate });
  const supplementalFinancialSources = [...new Map(financialRows
    .filter((row) => row.sourceUrl)
    .map((row) => [row.sourceUrl, row])).values()];
  if (supplementalFinancialSources.length) {
    r.heading("Supplemental financial-series sources");
    supplementalFinancialSources.forEach((row) => {
      r.paragraph(`${row.sourceLabel || "Quarterly financial history"} / ${sourceHost(row.sourceUrl || "")}`, { size: 7, color: C.navy });
    });
  }
  if (publicCommentary?.viewpoints?.length) {
    r.heading("Public-commentary sources");
    publicCommentary.viewpoints.slice(0, 4).forEach((viewpoint, index) => {
      r.paragraph(`${index + 1}. ${viewpoint.sourceName} / ${viewpoint.publishedAt || "date unavailable"} / ${clean(viewpoint.sourceType || "publication").replaceAll("_", " ")} / ${sourceHost(viewpoint.url)}`, { size: 7.2, color: C.navy });
    });
  }
  r.heading("Quality-control summary");
  r.paragraph(`Unsupported claims: ${dossier.qualityControl.unsupportedClaims}. Conflicts: ${dossier.qualityControl.conflicts}. Human review required: ${dossier.qualityControl.humanReviewRequired ? "Yes" : "No"}.`, { bold: true });
  r.paragraph("Coverage note: source counts measure admitted documents, not completeness of the investment case. Market opinions may change after publication and should be read as sentiment, not verified fact.", { size: 8, color: C.slate });
  r.paragraph("AI-generated research for informational purposes only. Verify material claims against the cited official documents. Supplemental market, promoter, ownership and peer data should be checked against the latest exchange filing. This is not investment advice.", { size: 8, color: C.slate });

  r.footer(dossier.company.symbol);
  doc.end();
  return completed;
}
