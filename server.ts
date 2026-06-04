import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 3005;

let resend: Resend | null = null;
let firecrawl: Firecrawl | null = null;
let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    console.log("[GENAI] Initializing Google Gen AI Client (Vertex AI)...");
    genAI = new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID || 'your-gcp-project-id',
      location: process.env.GCP_REGION || 'us-central1',
    });
  }
  return genAI;
}

function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function getFirecrawl() {
  if (!firecrawl && process.env.FIRECRAWL_API_KEY) {
    console.log("[SCRAPER] Initializing Unified Firecrawl Client (v4.x)...");
    firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return firecrawl;
}
function sanitizeGroundingJson(jsonText: string): string {
  if (!jsonText) return "";
  let cleaned = jsonText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
    cleaned = cleaned.trim();
  }
  cleaned = cleaned.replace(/"\s*\.?\s*\[\d+\]/g, '"');
  cleaned = cleaned.replace(/(\b\d+(?:\.\d+)?\b)\s*\.?\s*\[\d+\]/g, '$1');
  cleaned = cleaned.replace(/(\btrue\b|\bfalse\b)\s*\.?\s*\[\d+\]/gi, '$1');
  
  // Wipe out currency markings and percentages that block chart population
  cleaned = cleaned.replace(/₹\s?/g, "");
  cleaned = cleaned.replace(/%/g, "");

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}


const FINANCIAL_SOURCES = ['screener', 'moneycontrol', 'nseindia', 'bseindia', 'economictimes', 'livemint', 'businessstandard', 'tickertape'];

function assessDataQuality(groundedText: string): { confidence: 'high' | 'medium' | 'low'; sourceCount: number } {
  const lower = groundedText.toLowerCase();
  const sourceCount = FINANCIAL_SOURCES.filter(src => lower.includes(src)).length;
  return {
    confidence: sourceCount >= 3 ? 'high' : sourceCount >= 2 ? 'medium' : 'low',
    sourceCount
  };
}

async function validateTicker(ticker: string, ai: GoogleGenAI): Promise<{ isValid: boolean; companyName: string }> {
  try {
    const searchResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: `Search nseindia.com or bseindia.com to verify: Is "${ticker}" a valid stock ticker symbol of a company currently listed on NSE or BSE India? State clearly yes or no, and if yes, the full company name.` }] }],
      config: { tools: [{ googleSearch: {} }], maxOutputTokens: 512 }
    });
    const rawText = searchResult.text || "";
    const structResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: `Based on this search result, is "${ticker}" confirmed as a real NSE/BSE listed Indian company?\n\n${rawText.substring(0, 800)}` }] }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 128,
        responseSchema: {
          type: "OBJECT",
          properties: {
            isValid: { type: "BOOLEAN" },
            companyName: { type: "STRING" }
          },
          required: ["isValid", "companyName"]
        }
      }
    });
    const parsed = JSON.parse(sanitizeGroundingJson(structResult.text || '{"isValid":false,"companyName":""}'));
    return { isValid: !!parsed.isValid, companyName: String(parsed.companyName || "") };
  } catch {
    return { isValid: true, companyName: ticker };
  }
}

const SERVER_INTEL_FALLBACK = {
  trending: [
    { ticker: "RELIANCE.NS", reason: "Major green energy capex expansion announced in recent reports." },
    { ticker: "HDFCBANK.NS", reason: "Strong growth guidance from management transcripts." }
  ],
  marketSentiment: "Market data temporarily unavailable. Please retry for live sentiment.",
  marketMoodScore: null,
  sources: [],
  snapshotTime: new Date().toISOString()
};
async function startServer() {
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({
      status: "running",
      time: new Date().toISOString(),
      scraperConfigured: !!process.env.FIRECRAWL_API_KEY,
      genaiConfigured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      mailerConfigured: !!process.env.RESEND_API_KEY
    });
  });

  app.post("/api/pipeline/scrape", async (req, res) => {
    const { url, ticker } = req.body;
    const scraper = getFirecrawl();
    if (!scraper) return res.status(500).json({ error: "Scraper offline" });
    // Validate ticker when scraping by symbol (not a direct URL)
    if (ticker && !url) {
      const cleanTicker = ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim();
      const ai = getGenAI();
      const validation = await validateTicker(cleanTicker, ai);
      if (!validation.isValid) {
        return res.status(422).json({
          error: "TICKER_NOT_FOUND",
          message: `We could not verify "${cleanTicker}" on NSE/BSE. Please check the stock symbol and try again.`
        });
      }
    }
    try {
      let finalUrl = url;
      if (!finalUrl && ticker) {
        const searchRes: any = await scraper.search(`${ticker} stock latest news corporate announcements NSE filings`, { limit: 1 });
        finalUrl = searchRes?.web?.[0]?.url || searchRes?.news?.[0]?.url;
      }
      let scrapedMarkdown = "Direct context unavailable.";
      if (finalUrl) {
        const scrapeResult = await scraper.scrape(finalUrl, { formats: ['markdown'], onlyMainContent: true });
        scrapedMarkdown = scrapeResult?.markdown || (typeof scrapeResult === 'string' ? scrapeResult : scrapedMarkdown);
      }
      res.json({ scrapedMarkdown, ticker, sourceUrl: finalUrl });
    } catch (error: any) {
      res.status(500).json({ error: "Scraping failed", detail: error.message });
    }
  });

  app.get("/api/market-intel", async (req, res) => {
    const ai = getGenAI();
    try {
      // Stage 1: Search grounding (cannot combine with JSON schema)
      const searchResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: "Identify top 5 trending Indian stocks on NSE today. For each, provide the NSE ticker symbol and a one-sentence reason for the trend." }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawText = searchResult.text || "";

      // Stage 2: JSON structuring (no search tool)
      const structResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Structure this market intelligence into the required JSON format:\n\n${rawText}` }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: "OBJECT",
            properties: {
              trending: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    ticker: { type: "STRING" },
                    reason: { type: "STRING" }
                  },
                  required: ["ticker", "reason"]
                }
              },
              marketSentiment: { type: "STRING" },
              marketMoodScore: { type: "NUMBER" }
            },
            required: ["trending", "marketSentiment", "marketMoodScore"]
          }
        }
      });
      res.json(JSON.parse(sanitizeGroundingJson(structResult.text || "")));
    } catch (error: any) {
      res.json(SERVER_INTEL_FALLBACK);
    }
  });

  app.post("/api/pipeline/price", async (req, res) => {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: "Invalid context setup" });
    const ai = getGenAI();
    try {
      // Stage 1: Search grounding
      const searchResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Find the current live NSE stock price, today's change in rupees, and percentage change for ${ticker}.` }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawText = searchResult.text || "";

      // Stage 2: JSON structuring
      const structResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Extract stock price data for ${ticker} from this text and return as JSON:\n\n${rawText}` }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: "OBJECT",
            properties: {
              ticker: { type: "STRING" },
              price: { type: "NUMBER" },
              change: { type: "NUMBER" },
              percentChange: { type: "NUMBER" }
            },
            required: ["ticker", "price", "change", "percentChange"]
          }
        }
      });
      res.json(JSON.parse(sanitizeGroundingJson(structResult.text || "")));
    } catch (error: any) {
      res.json({ ticker, price: null, change: null, percentChange: null, unavailable: true });
    }
  });
  app.post("/api/pipeline/analyze", async (req, res) => {
    const { ticker, context, mode } = req.body;
    const ai = getGenAI();

    const cleanTicker = ticker ? ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim() : "UNKNOWN";
    console.log(`[ANALYZE] Running Mode-Isolated Production Pipeline for: ${cleanTicker} | Target Mode: ${mode}`);

    // Step 0: Ticker validation
    const validation = await validateTicker(cleanTicker, ai);
    if (!validation.isValid) {
      return res.status(422).json({
        error: "TICKER_NOT_FOUND",
        message: `We could not verify "${cleanTicker}" on NSE/BSE. Please check the stock symbol and try again.`
      });
    }

    try {
      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      
      let dynamicTaskPrompt = "";
      let modelReportDescription = "";

      if (mode === 'research' || mode === 'filings') {
        dynamicTaskPrompt = `
          Perform an EXHAUSTIVE, UNTRUNCATED AUDIT AND COMPLIANCE DISCLOSURE REPORT for the Indian stock ticker "${cleanTicker}" based on official SEBI filings and NSE announcements.
          Structure your response into these exact Markdown sections with extensive technical detail:
          # 📑 Corporate Governance & Audit Disclosures: ${cleanTicker}
          ## 1. SEBI CORPORATE FILINGS ACCOUNTABILITY
          Detailed audit of insider trading filings, SAST disclosures, and material board announcements over the past 6 months.
          ## 2. PROMOTER HOLDING & PLEDGING INTELLIGENCE
          Analyze exact promoter stakes, hidden risks, increases/decreases in pledged shares, or changes in institutional float.
          ## 3. RELATED PARTY TRANSACTIONS & CASH FLOW INTEGRITY
          Audit financial notes regarding material transactions with subsidiary partners, joint ventures, or promoter-owned firms.
          ## 4. REGULATORY FRICTION & COMPLIANCE ALERTS
          List any explicit SEBI warnings, tax notices, environmental clearance issues, or open legal friction items.
          ## 5. BOARD ALPHA & GOVERNANCE CONCLUSION
          Evaluate independent director stability, committee independence, audit rotations, and a final overall institutional governance grade.

          MANDATORY: After section 5, output the following scorecard block EXACTLY as shown — same label names, integer scores 1–10, nothing else on those lines:
          Transcript Transparency: [score 1-10 based on how fully management answered analyst questions]
          Disclosure Completeness: [score 1-10 based on depth and compliance of SEBI filing disclosures]
          Guideline Conservatism: [score 1-10 based on realism of management guidance vs actual outcomes]
          Governance Cleanliness: [score 1-10 based on board independence, pledging levels, and audit quality]
        `;
        modelReportDescription = "Exhaustive SEBI compliance audit and corporate disclosure report styled in Markdown.";
      } else if (mode === 'move') {
        dynamicTaskPrompt = `
          Analyze immediate momentum, volume anomalies, structural price action breaks, block trades, and catalyst drivers causing recent market movements for ${cleanTicker}.
          Provide an institutional write-up structured in Markdown explaining technical breakouts, underlying buy/sell flows, and short-term directional expectations.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs estimated fair value]
          Growth Momentum: [score 1-10 based on price and volume momentum strength]
          Quality & Moat: [score 1-10 based on business quality and competitive position]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management credibility and capital allocation]
        `;
        modelReportDescription = "Price action momentum breakdown report styled in clean Markdown formatting.";
      } else if (mode === 'earnings') {
        dynamicTaskPrompt = `
          Act as an Earnings Doctor. Perform an in-depth review of the latest quarterly results and annual financial numbers for ${cleanTicker}.
          Dissect revenue growth, EBITDA expansion/contraction, PAT beats, and CEO/CFO earnings transcript commentary in clean Markdown formatting.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs earnings power]
          Growth Momentum: [score 1-10 based on revenue and earnings growth trajectory]
          Quality & Moat: [score 1-10 based on margin quality and competitive durability]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management execution and guidance reliability]
        `;
        modelReportDescription = "Earnings performance diagnosis and financial report styled in clean Markdown formatting.";
      } else {
        dynamicTaskPrompt = `
          You are an institutional equity research analyst. Generate a comprehensive deep-dive report for the Indian stock "${cleanTicker}" listed on NSE/BSE.
          Structure the report in clean Markdown with these exact section headers:

          ## THE BULL CASE
          Detailed bull thesis: revenue growth drivers, competitive moat, management quality, valuation upside, and catalyst timeline.

          ## THE CONTRARIAN BEAR CASE
          Honest risk factors: sector headwinds, valuation risks, execution risks, and scenarios where the thesis fails.

          ## INSTITUTIONAL CONVICTION METRICS
          Score-driven summary of valuation, growth, moat, and governance factors.

          ## EARNINGS & CATALYSTS
          Latest quarterly performance, management guidance, and upcoming catalysts.

          ## ANALYST TARGETS
          Current market price, consensus target price, tactical entry zone, and strategic stop loss.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs intrinsic value]
          Growth Momentum: [score 1-10 based on revenue and earnings growth trajectory]
          Quality & Moat: [score 1-10 based on competitive advantage and business quality]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management quality and capital allocation]
        `;
        modelReportDescription = "Comprehensive institutional equity deep-dive report with bull/bear cases styled in Markdown.";
      }

      // Stage 1: Search Grounding
      const searchPrompt = `
        ${dynamicTaskPrompt}
        Also identify 3 primary sector competitors and find current precise values for their PE Ratio, ROCE %, Operating Margin %, and Debt to Equity. Processing Date is ${todayStr}.
      `;

      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });

      const rawGroundedMetrics = searchResponse.text || "";
      console.log(`[ANALYZE] Stage 1 finished. Starting Stage 2 formatting constraints...`);

      // Data quality check — block hallucination-risk reports
      const { confidence, sourceCount } = assessDataQuality(rawGroundedMetrics);
      console.log(`[ANALYZE] Data quality: confidence=${confidence}, sources=${sourceCount}`);
      if (sourceCount < 2) {
        return res.status(422).json({
          error: "INSUFFICIENT_DATA",
          message: `Insufficient data found for ${cleanTicker}. This may be a very small cap or micro cap stock with limited public information. We cannot generate a reliable report without risking inaccurate information. Please try a different stock or provide a URL to a specific page about this company.`
        });
      }

      // Stage 2: JSON Structuring Panel
      const formattingPrompt = `
        Using the grounded data corpus block provided below, perform these formatting tasks:
        1. Populate the exact requested data into the "report" parameter styled in standard Markdown formatting. Ensure it is completely full, highly comprehensive, and never cut off or summarized mid-sentence.
        2. Extract individual target vs peer average numeric values for "PE Ratio", "ROCE %", "Operating Margin %", and "Debt to Equity".

        Grounded Data Corpus:
        ---
        ${rawGroundedMetrics}
        ---
        Scraper Context:
        ---
        ${context || "No context extracted."}
        ---
      `;

      const structuredResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: formattingPrompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: "OBJECT",
            properties: {
              report: { type: "STRING", description: modelReportDescription },
              benchmarking: {
                type: "ARRAY",
                description: "Clean numerical matrix dataset representing sector peer benchmarks used to populate front-end analytics graphs.",
                items: {
                  type: "OBJECT",
                  properties: {
                    metric: { type: "STRING", description: "Financial KPI Name (PE Ratio, ROCE %, Operating Margin %, Debt to Equity)" },
                    targetValue: { type: "NUMBER" },
                    industryAverage: { type: "NUMBER" }
                  },
                  required: ["metric", "targetValue", "industryAverage"]
                }
              }
            },
            required: ["report", "benchmarking"]
          }
        }
      });

      const rawJsonText = structuredResponse.text || "";
      const finishReason = structuredResponse.candidates?.[0]?.finishReason;
      console.log(`[ANALYZE] Stage 1 grounding: ${rawGroundedMetrics.length} chars`);
      console.log(`[ANALYZE] Stage 2 response: ${rawJsonText.length} chars | finishReason: ${finishReason}`);
      const cleanedJson = sanitizeGroundingJson(rawJsonText);
      const parsedPayload = JSON.parse(cleanedJson);

      // Enforce numeric data mapping to graphs natively
      if (parsedPayload && Array.isArray(parsedPayload.benchmarking)) {
        parsedPayload.benchmarking = parsedPayload.benchmarking.map((b: any) => {
          let targetVal = typeof b.targetValue === 'string' ? parseFloat(b.targetValue.replace(/[^\d.-]/g, '')) : b.targetValue;
          let industryAvg = typeof b.industryAverage === 'string' ? parseFloat(b.industryAverage.replace(/[^\d.-]/g, '')) : b.industryAverage;
          return {
            metric: String(b.metric || "Metric"),
            targetValue: isNaN(targetVal) || targetVal === null ? 0 : Number(targetVal),
            industryAverage: isNaN(industryAvg) || industryAvg === null ? 0 : Number(industryAvg)
          };
        });
      }

      console.log(`[ANALYZE] Analysis process completed successfully!`);
      return res.json({
        report: parsedPayload.report || "Analysis report data empty.",
        benchmarking: parsedPayload.benchmarking || [],
        confidence,
        modelUsed: "gemini-2.5-flash"
      });

    } catch (error: any) {
      console.warn(`[ANALYZE] Pipeline error:`, error.message);
      return res.json({
        report: `# Analysis Unavailable: ${cleanTicker}\n\nThe research pipeline encountered an error connecting to data sources. Please retry — live grounding requires an active connection.`,
        benchmarking: [],
        isFallback: true
      });
    }
  });
  app.post("/api/pipeline/analyze/stream", async (req, res) => {
    const { ticker, context, mode } = req.body;
    const ai = getGenAI();
    const cleanTicker = ticker ? ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim() : "UNKNOWN";
    console.log(`[ANALYZE/STREAM] Starting for: ${cleanTicker} | Mode: ${mode}`);

    // Step 0: Ticker validation before SSE headers are committed
    const validation = await validateTicker(cleanTicker, ai);
    if (!validation.isValid) {
      return res.status(422).json({
        error: "TICKER_NOT_FOUND",
        message: `We could not verify "${cleanTicker}" on NSE/BSE. Please check the stock symbol and try again.`
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (obj: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      let dynamicTaskPrompt = "";
      if (mode === 'research' || mode === 'filings') {
        dynamicTaskPrompt = `
          Perform an EXHAUSTIVE, UNTRUNCATED AUDIT AND COMPLIANCE DISCLOSURE REPORT for the Indian stock ticker "${cleanTicker}" based on official SEBI filings and NSE announcements.
          Structure your response into these exact Markdown sections with extensive technical detail:
          # 📑 Corporate Governance & Audit Disclosures: ${cleanTicker}
          ## 1. SEBI CORPORATE FILINGS ACCOUNTABILITY
          Detailed audit of insider trading filings, SAST disclosures, and material board announcements over the past 6 months.
          ## 2. PROMOTER HOLDING & PLEDGING INTELLIGENCE
          Analyze exact promoter stakes, hidden risks, increases/decreases in pledged shares, or changes in institutional float.
          ## 3. RELATED PARTY TRANSACTIONS & CASH FLOW INTEGRITY
          Audit financial notes regarding material transactions with subsidiary partners, joint ventures, or promoter-owned firms.
          ## 4. REGULATORY FRICTION & COMPLIANCE ALERTS
          List any explicit SEBI warnings, tax notices, environmental clearance issues, or open legal friction items.
          ## 5. BOARD ALPHA & GOVERNANCE CONCLUSION
          Evaluate independent director stability, committee independence, audit rotations, and a final overall institutional governance grade.

          MANDATORY: After section 5, output the following scorecard block EXACTLY as shown — same label names, integer scores 1–10, nothing else on those lines:
          Transcript Transparency: [score 1-10 based on how fully management answered analyst questions]
          Disclosure Completeness: [score 1-10 based on depth and compliance of SEBI filing disclosures]
          Guideline Conservatism: [score 1-10 based on realism of management guidance vs actual outcomes]
          Governance Cleanliness: [score 1-10 based on board independence, pledging levels, and audit quality]
        `;
      } else if (mode === 'move') {
        dynamicTaskPrompt = `
          Analyze immediate momentum, volume anomalies, structural price action breaks, block trades, and catalyst drivers causing recent market movements for ${cleanTicker}.
          Provide an institutional write-up structured in Markdown explaining technical breakouts, underlying buy/sell flows, and short-term directional expectations.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs estimated fair value]
          Growth Momentum: [score 1-10 based on price and volume momentum strength]
          Quality & Moat: [score 1-10 based on business quality and competitive position]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management credibility and capital allocation]
        `;
      } else if (mode === 'earnings') {
        dynamicTaskPrompt = `
          Act as an Earnings Doctor. Perform an in-depth review of the latest quarterly results and annual financial numbers for ${cleanTicker}.
          Dissect revenue growth, EBITDA expansion/contraction, PAT beats, and CEO/CFO earnings transcript commentary in clean Markdown formatting.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs earnings power]
          Growth Momentum: [score 1-10 based on revenue and earnings growth trajectory]
          Quality & Moat: [score 1-10 based on margin quality and competitive durability]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management execution and guidance reliability]
        `;
      } else {
        dynamicTaskPrompt = `
          Generate a comprehensive institutional equity deep-dive for "${cleanTicker}" with sections:
          ## THE BULL CASE
          ## THE CONTRARIAN BEAR CASE
          ## INSTITUTIONAL CONVICTION METRICS
          ## EARNINGS & CATALYSTS
          ## ANALYST TARGETS

          MANDATORY: At the very end output these exact lines with integer scores 1-10:
          Valuation Intelligence: [score 1-10]
          Growth Momentum: [score 1-10]
          Quality & Moat: [score 1-10]
          Execution Risk: [score 1-10 where 10 = very high risk]
          Governance Alpha: [score 1-10]
        `;
      }

      // Stage 1: Search grounding (non-streaming — grounding requires a complete round-trip)
      send({ type: 'stage', message: 'Grounding with live NSE/SEBI data...' });
      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `${dynamicTaskPrompt}\n\nAlso identify 3 primary sector competitors and find current precise values for their PE Ratio, ROCE %, Operating Margin %, and Debt to Equity. Processing Date is ${todayStr}.` }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawGroundedMetrics = searchResponse.text || "";
      console.log(`[ANALYZE/STREAM] Stage 1 grounding: ${rawGroundedMetrics.length} chars`);

      // Data quality check
      const { confidence: streamConfidence, sourceCount: streamSourceCount } = assessDataQuality(rawGroundedMetrics);
      console.log(`[ANALYZE/STREAM] Data quality: confidence=${streamConfidence}, sources=${streamSourceCount}`);
      if (streamSourceCount < 2) {
        send({ type: 'error', error: 'INSUFFICIENT_DATA', message: `Insufficient data found for ${cleanTicker}. This may be a very small cap or micro cap stock with limited public information. We cannot generate a reliable report without risking inaccurate information. Please try a different stock or provide a URL to a specific page about this company.` });
        return res.end();
      }

      // Stage 2: Stream report as plain Markdown — no JSON wrapper means the full token budget
      // is available for content instead of being halved by JSON-escaping overhead.
      send({ type: 'stage', message: 'Streaming research report...' });
      const reportStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Using the grounded data corpus below, write the complete Markdown report.\n\n${dynamicTaskPrompt}\n\nDo NOT truncate any section. Every section must be fully written with specific data points.\n\nGrounded Data:\n---\n${rawGroundedMetrics}\n---\nScraper Context:\n---\n${context || "No context extracted."}\n---` }] }],
        config: { maxOutputTokens: 8192 }
      });

      let accumulatedReport = "";
      for await (const chunk of reportStream) {
        const text = chunk.text || "";
        if (text) {
          accumulatedReport += text;
          send({ type: 'chunk', text });
        }
      }
      console.log(`[ANALYZE/STREAM] Stream complete. Report: ${accumulatedReport.length} chars`);

      // Stage 3: Tiny isolated JSON call just for the benchmarking numbers
      let benchmarking: any[] = [];
      try {
        const benchResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: 'user', parts: [{ text: `From this data, extract PE Ratio, ROCE %, Operating Margin %, and Debt to Equity for ${cleanTicker} vs industry average as JSON:\n\n${rawGroundedMetrics.substring(0, 3000)}` }] }],
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 1024,
            responseSchema: {
              type: "OBJECT",
              properties: {
                benchmarking: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      metric: { type: "STRING" },
                      targetValue: { type: "NUMBER" },
                      industryAverage: { type: "NUMBER" }
                    },
                    required: ["metric", "targetValue", "industryAverage"]
                  }
                }
              },
              required: ["benchmarking"]
            }
          }
        });
        const parsed = JSON.parse(sanitizeGroundingJson(benchResponse.text || "{}"));
        benchmarking = (parsed.benchmarking || []).map((b: any) => ({
          metric: String(b.metric || "Metric"),
          targetValue: isNaN(Number(b.targetValue)) ? 0 : Number(b.targetValue),
          industryAverage: isNaN(Number(b.industryAverage)) ? 0 : Number(b.industryAverage)
        }));
      } catch (benchErr: any) {
        console.warn(`[ANALYZE/STREAM] Benchmarking extraction failed:`, benchErr.message);
        benchmarking = [];
      }

      send({ type: 'benchmarking', data: benchmarking });
      send({ type: 'done', confidence: streamConfidence });
      res.end();
    } catch (error: any) {
      console.error(`[ANALYZE/STREAM] Error:`, error.message);
      send({ type: 'error', message: error.message });
      res.end();
    }
  });

  app.post("/api/pipeline/peers", async (req, res) => {
    const { ticker } = req.body;
    if (!ticker) return res.status(500).json({ error: "Setup missing" });
    const ai = getGenAI();
    const cleanTicker = ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim();
    try {
      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Stage 1: Search grounding — explicitly demand all 4 metrics per company
      const strictPrompt = `
        You are a financial data analyst. Your task is to find peer benchmarking data for the Indian stock "${cleanTicker}".

        STEP 1: Identify the EXACT Sector and Industry classification for "${cleanTicker}" from Screener.in or Moneycontrol.
        STEP 2: List "${cleanTicker}" as the TARGET company and find 3 other prominent NSE/BSE listed companies in the EXACT SAME industry. Do NOT include RELIANCE, TCS, or HDFCBANK unless the target belongs to their sector.
        STEP 3: For ALL 4 companies (target + 3 peers), provide the following metrics as of ${todayStr}:
          - NSE/BSE ticker symbol
          - Full company name
          - P/E Ratio (trailing twelve months) — a plain number, e.g. 24.5
          - ROCE % (Return on Capital Employed) — a plain number, e.g. 18.2
          - Debt-to-Equity ratio — a plain number, e.g. 0.45
          - Market Capitalisation in INR Crores — a plain number, e.g. 95000

        Use Screener.in, Moneycontrol, or NSE website as sources. If a metric is genuinely unavailable, state "N/A" for that field.
        Return a clearly labelled table or list with all 4 companies and all 4 metrics each.
      `;
      const searchResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: strictPrompt }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawText = searchResult.text || "";
      console.log(`[peers/${cleanTicker}] Stage-1 grounding response (${rawText.length} chars):\n${rawText}\n`);

      // Stage 2: JSON structuring — do not invent values; use null for missing data
      const structPrompt = `
        Convert the peer benchmarking data below into structured JSON for ${cleanTicker}.

        Rules:
        - Extract ONLY values explicitly stated in the text. Do NOT invent or estimate missing values.
        - If a metric is missing or marked "N/A", set it to null (JSON null), NOT zero.
        - isTarget must be true for ${cleanTicker} and false for all other companies.
        - ticker should be the NSE/BSE symbol only (no exchange suffix needed).
        - marketCap must be a plain number in INR Crores (e.g. 95000, not "95,000 Cr").
        - pe, roce, debtEquity must be plain numbers (no % or ₹ symbols).

        Source data:
        ${rawText}
      `;
      const structResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: structPrompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: "OBJECT",
            properties: {
              peers: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    ticker: { type: "STRING" },
                    name: { type: "STRING" },
                    pe: { type: "NUMBER" },
                    roce: { type: "NUMBER" },
                    debtEquity: { type: "NUMBER" },
                    marketCap: { type: "NUMBER" },
                    isTarget: { type: "BOOLEAN" }
                  },
                  required: ["ticker", "name", "isTarget"]
                }
              }
            },
            required: ["peers"]
          }
        }
      });
      const rawJsonText = structResult.text || "";
      console.log(`[peers/${cleanTicker}] Stage-2 raw JSON response:\n${rawJsonText}\n`);

      const cleanedJson = sanitizeGroundingJson(rawJsonText);
      const parsedData = JSON.parse(cleanedJson);
      console.log(`[peers/${cleanTicker}] Parsed data:`, JSON.stringify(parsedData, null, 2));

      if (parsedData && Array.isArray(parsedData.peers)) {
        parsedData.peers = parsedData.peers.map((p: any) => {
          const matchedTicker = (p.ticker || p.symbol || "").toUpperCase();
          // Use null-coalescing only for alternate field names — never substitute fake defaults
          const pe = p.pe ?? p.peRatio ?? p.pe_ratio ?? null;
          const roce = p.roce ?? p.returnOnCapital ?? p.roce_percent ?? null;
          const debtEquity = p.debtEquity ?? p.debtToEquity ?? p.debt_equity ?? null;
          const marketCap = p.marketCap ?? p.market_cap ?? p.marketcap ?? null;

          const normalized = {
            ticker: matchedTicker,
            name: p.name || matchedTicker,
            pe: pe !== null ? Number(pe) : null,
            roce: roce !== null ? Number(roce) : null,
            debtEquity: debtEquity !== null ? Number(debtEquity) : null,
            marketCap: marketCap !== null ? Number(marketCap) : null,
            isTarget: typeof p.isTarget === 'boolean' ? p.isTarget : (matchedTicker === cleanTicker || matchedTicker.includes(cleanTicker))
          };

          const missing = Object.entries(normalized).filter(([k, v]) => v === null && k !== 'isTarget').map(([k]) => k);
          if (missing.length > 0) {
            console.warn(`[peers/${cleanTicker}] ${matchedTicker} missing fields: ${missing.join(', ')}`);
          }
          return normalized;
        });
      }

      console.log(`[peers/${cleanTicker}] Final peers payload (${parsedData?.peers?.length ?? 0} companies):`, JSON.stringify(parsedData?.peers, null, 2));
      res.json(parsedData);
    } catch (error: any) {
      console.error(`[peers/${cleanTicker}] Error:`, error?.message || error);
      res.json({ peers: [], isFallback: true });
    }
  });

  app.post("/api/email/briefing", async (req, res) => {
    const { email, reportContent } = req.body;
    const mailer = getResend();
    if (!mailer) return res.status(500).json({ error: "Resend offline" });
    try {
      await mailer.emails.send({
        from: 'Equity AI <onboarding@resend.dev>',
        to: email,
        subject: 'Your Morning Equity Briefing',
        html: `<h1>Market Intelligence Update</h1><p>${reportContent}</p>`
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Email failure" });
    }
  });

  app.post("/api/portfolio/analyze", async (req, res) => {
    const { holdings } = req.body;
    if (!holdings) return res.status(500).json({ error: "Audit infrastructure missing" });
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Audit portfolio structure: ${JSON.stringify(holdings)}` }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      res.json({ audit: response.text || "" });
    } catch (error: any) {
      res.status(500).json({ error: "Audit failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log("🚀 Equity AI backend running on port " + PORT);
  });
}

startServer();
