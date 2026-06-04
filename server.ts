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


// Problem 1: Financial keywords for scraped content validation
const FINANCIAL_KW = ['revenue','profit','earnings','crore','quarterly','eps','pe','roce','management','results','annual','balance sheet','cash flow','dividend','market cap','turnover','ebitda','net income','shares','stock'];

function isFinancialContent(text: string): boolean {
  const lower = text.toLowerCase();
  return FINANCIAL_KW.filter(kw => lower.includes(kw)).length >= 3;
}

// Normalise special characters in ticker for web search queries only.
// & → "and", - → space, . → space. The original ticker is always preserved in prompts and the UI.
function searchQueryTicker(ticker: string): string {
  return ticker.replace(/&/g, 'and').replace(/-/g, ' ').replace(/\./g, ' ').trim();
}

// NSE website navigation phrases that indicate wrong content was scraped or generated
const NSE_NAV_PHRASES = [
  'Website Navigation', 'NSE India website offers', 'navigation options including',
  'Option Chain', 'Market Turnover'
];

// Additional phrases that indicate a report contains generic NSE/navigation content rather than company data
const REPORT_NAV_PHRASES = [
  'Website Navigation', 'NSE India website offers',
  'overview of the NSE India website', 'navigation options'
];

// Universal navigation/menu detection for scraped content and generated reports
function looksLikeNavMenu(text: string): boolean {
  const first500 = text.substring(0, 500);
  // Single-word line heuristic (classic nav menu pattern)
  const singleWordLines = first500.split('\n').filter(line => {
    const t = line.trim();
    return t.length > 0 && /^[A-Za-z\-]+$/.test(t) && !t.includes(' ');
  });
  if (singleWordLines.length >= 5) return true;
  // Specific NSE website phrases (first 300 chars is sufficient signal)
  const first300 = text.substring(0, 300);
  if (NSE_NAV_PHRASES.some(p => first300.includes(p))) return true;
  // "Derivatives" as a standalone bullet or line in first 300 chars
  const lines300 = first300.split('\n');
  if (lines300.some(l => {
    const t = l.trim();
    return t === 'Derivatives' || /^[-*•]\s*Derivatives\s*$/.test(t);
  })) return true;
  return false;
}

// Hard-rejection patterns for scraped content — any match means discard
const SCRAPE_REJECT_PATTERNS = [
  'export to excel', 'notebook ai', 'summary chart analysis peers',
  'website navigation', 'nse india website offers', 'navigation options including',
];

// Returns true only if the scraped text is genuine company-specific financial content
function isScrapedContentUsable(text: string): boolean {
  if (!text || text.length < 100) return false;
  const lower = text.toLowerCase();
  if (SCRAPE_REJECT_PATTERNS.some(p => lower.includes(p))) return false;

  const first500 = text.substring(0, 500);
  // "Follow" as a standalone word (Screener.in follow button) or exchange label lines
  if (/\bFollow\b/.test(first500)) return false;
  if (/(?:BSE|NSE):\n/.test(first500)) return false;

  if (looksLikeNavMenu(text)) return false;

  // Reject if >30% of non-empty lines in the first 1000 chars have fewer than 3 words
  const first1000Lines = text.substring(0, 1000).split('\n').filter(l => l.trim().length > 0);
  if (first1000Lines.length > 0) {
    const shortLines = first1000Lines.filter(l => l.trim().split(/\s+/).length < 3);
    if (shortLines.length / first1000Lines.length > 0.3) return false;
  }

  return isFinancialContent(text);
}

// Validate a generated report for quality — returns reason so caller can decide retry strategy
function isReportValid(text: string): { valid: boolean; reason?: string } {
  if (!text || text.length < 800) return { valid: false, reason: 'too_short' };
  const failPhrases = ['Export to Excel', 'Notebook AI', 'Summary Chart', 'Website Navigation'];
  if (failPhrases.some(p => text.includes(p))) return { valid: false, reason: 'nav_content' };
  if (REPORT_NAV_PHRASES.some(p => text.includes(p))) return { valid: false, reason: 'nav_content' };
  // More than 5 lines with fewer than 3 words in the first 500 chars → nav-like output
  const first500Lines = text.substring(0, 500).split('\n').filter(l => l.trim().length > 0);
  const tinyLines = first500Lines.filter(l => l.trim().split(/\s+/).length < 3);
  if (tinyLines.length > 5) return { valid: false, reason: 'nav_content' };
  return { valid: true };
}

// Mandatory preamble injected into every Gemini analysis prompt for all modes
function buildAnalystPreamble(ticker: string): string {
  return `You are an institutional equity research analyst. Generate a complete original investment research report for ${ticker} listed on NSE India.

STRICT RULES:
1. Write entirely in your own analytical voice — do not copy or reformat any scraped content
2. Do not reproduce website navigation text, menu items, or raw data tables
3. Do not summarise what a website says — analyse the company itself
4. Use the context provided only to extract specific data points like revenue figures or management quotes
5. If the context contains website navigation or non-financial content, ignore it completely and rely on your own knowledge and search grounding
6. Your report must contain original analysis, investment thesis, risks and opportunities

`;
}

// Warning prepended to scraped context block in every Stage 2 prompt
const SCRAPED_CONTEXT_WARNING = `IMPORTANT INSTRUCTION: The text below is raw scraped data from financial websites. Do NOT summarise, reproduce, or reformat this raw data. Use it only as background reference to extract specific data points (revenue numbers, management quotes). Your response must be entirely your own original analytical writing.\n\n`;

// Problem 3: Universal confidence scoring based on report length
function assessConfidence(reportText: string): 'high' | 'medium' | 'low' {
  const len = (reportText || "").length;
  if (len > 3000) return 'high';
  if (len >= 1000) return 'medium';
  return 'low';
}

// Problem 2: Pure synchronous pattern-based ticker validation — zero API calls
const BLOCKED_TICKERS = new Set([
  'TEST','FAKE','HELLO','GARBAGE','DUMMY','SAMPLE','EXAMPLE','XYZGARBAGE',
  'RANDOM','NOTHING','INVALID','NOTASTOCK','BLAH','FOO','BAR','QWE',
  'ASDF','ZXCV','ABC','XYZ','AAAA','BBBB','CCCC','XXXX','YYYY','ZZZZ',
  'NULL','UNDEFINED','NONE'
]);

function validateTicker(ticker: string): { isValid: boolean } {
  const t = ticker.trim();
  if (t.length < 2 || t.length > 15)       return { isValid: false };
  if (/\s/.test(t))                         return { isValid: false };
  if (!/^[A-Za-z&\-./]+$/.test(t))         return { isValid: false }; // only letters A-Z, &, -, ., /
  if (/^[&\-./]$/.test(t))                 return { isValid: false }; // reject single special char alone
  if (BLOCKED_TICKERS.has(t.toUpperCase())) return { isValid: false };
  console.log(`[VALIDATE] "${ticker}" — ALLOWED (pattern check passed)`);
  return { isValid: true };
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
    const { url, ticker, mode } = req.body;
    const scraper = getFirecrawl();
    if (!scraper) return res.status(500).json({ error: "Scraper offline" });
    // Problem 2: Pure pattern validation — synchronous, no API calls
    if (ticker && !url) {
      const cleanTicker = ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim();
      const validation = validateTicker(cleanTicker);
      if (!validation.isValid) {
        return res.status(422).json({
          error: "TICKER_NOT_FOUND",
          message: `'${cleanTicker}' does not appear to be a valid stock ticker format. Please enter a valid NSE or BSE stock symbol such as RELIANCE, TCS, M&M or L&T.`
        });
      }
    }
    try {
      let finalUrl = url;
      if (!finalUrl && ticker) {
        // Normalise special characters in the search query ticker for all modes
        const sqTicker = searchQueryTicker(ticker);
        // Mode-specific search queries to target the right content for every report type
        let searchQuery: string;
        if (mode === 'earnings') {
          searchQuery = `${sqTicker} India concall transcript quarterly earnings results management commentary analyst questions`;
        } else if (mode === 'move') {
          searchQuery = `${sqTicker} India stock price movement today news catalyst reason`;
        } else if (mode === 'filings' || mode === 'research') {
          searchQuery = `${sqTicker} India SEBI filing corporate announcement investor presentation annual report`;
        } else {
          searchQuery = `${sqTicker} India stock fundamental analysis quarterly results annual report revenue profit`;
        }
        const searchRes: any = await scraper.search(searchQuery, { limit: 1 });
        finalUrl = searchRes?.web?.[0]?.url || searchRes?.news?.[0]?.url;
      }
      const SCRAPE_FALLBACK = "Direct context unavailable — proceeding with Gemini search grounding";
      let scrapedMarkdown = SCRAPE_FALLBACK;
      if (finalUrl) {
        const scrapeResult = await scraper.scrape(finalUrl, { formats: ['markdown'], onlyMainContent: true });
        const rawContent = scrapeResult?.markdown || (typeof scrapeResult === 'string' ? scrapeResult : "");
        if (isScrapedContentUsable(rawContent)) {
          scrapedMarkdown = rawContent;
          console.log(`[SCRAPER] Accepted ${rawContent.length} chars for ${ticker} (${mode})`);
        } else {
          console.log(`[SCRAPER] Rejected scraped content for ${ticker} (${mode}) — nav/non-financial content detected`);
        }
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
    // Use cleaned ticker in search so special chars (& - .) don't break the query
    const cleanTicker = ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim();
    const sqTicker = searchQueryTicker(cleanTicker);
    try {
      // Stage 1: Search grounding — use both original and cleaned ticker for best match
      const searchResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Find the current live NSE/BSE stock price, today's change in rupees, and percentage change for ${cleanTicker} (search as "${sqTicker}" India stock NSE). Provide only the numeric price values, do not describe the website.` }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawText = searchResult.text || "";

      // Stage 2: JSON structuring
      const structResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Extract stock price data for ${cleanTicker} from this text and return as JSON. If price is not found or is zero, set price to null:\n\n${rawText}` }] }],
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
      const priceData = JSON.parse(sanitizeGroundingJson(structResult.text || ""));
      // If price came back as 0 treat it as unavailable
      if (!priceData.price || priceData.price === 0) {
        return res.json({ ticker: cleanTicker, price: null, change: null, percentChange: null, unavailable: true });
      }
      res.json(priceData);
    } catch (error: any) {
      res.json({ ticker: cleanTicker, price: null, change: null, percentChange: null, unavailable: true });
    }
  });
  app.post("/api/pipeline/analyze", async (req, res) => {
    const { ticker, context, mode } = req.body;
    const ai = getGenAI();

    const cleanTicker = ticker ? ticker.toUpperCase().replace(".NS", "").replace(".BO", "").trim() : "UNKNOWN";
    console.log(`[ANALYZE] Running Mode-Isolated Production Pipeline for: ${cleanTicker} | Target Mode: ${mode}`);

    // Step 0: Ticker validation — skipped for filings mode (has its own scraping logic)
    if (mode !== 'filings') {
      const validation = validateTicker(cleanTicker);
      if (!validation.isValid) {
        return res.status(422).json({
          error: "TICKER_NOT_FOUND",
          message: `'${cleanTicker}' does not appear to be a valid stock ticker format. Please enter a valid NSE or BSE stock symbol such as RELIANCE, TCS, M&M or L&T.`
        });
      }
    }

    try {
      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      // FIX 4: normalised ticker for Gemini search prompts — & → "and", - → space.
      // cleanTicker is still used in Stage 2 formatting and in the final report display.
      const searchTicker = searchQueryTicker(cleanTicker);

      // Prepend analyst preamble to every mode's prompt — enforces original analytical writing
      const preamble = buildAnalystPreamble(cleanTicker);

      let modePromptBody = "";
      let modelReportDescription = "";

      if (mode === 'research' || mode === 'filings') {
        modePromptBody = `Perform an EXHAUSTIVE, UNTRUNCATED AUDIT AND COMPLIANCE DISCLOSURE REPORT for the Indian stock ticker "${cleanTicker}" (search as "${searchTicker}") based on official SEBI filings and NSE announcements.
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

          MANDATORY SCORECARD: At the very end of your report, after all 5 sections, output EXACTLY these 4 lines. Replace each X with a single integer from 1 to 10 — no other text on these lines:
          Transcript Transparency: X
          Disclosure Completeness: X
          Guideline Conservatism: X
          Governance Cleanliness: X`;
        modelReportDescription = "Exhaustive SEBI compliance audit and corporate disclosure report styled in Markdown.";
      } else if (mode === 'move') {
        modePromptBody = `Analyze immediate momentum, volume anomalies, structural price action breaks, block trades, and catalyst drivers causing recent market movements for ${cleanTicker} (search as "${searchTicker}" on NSE India).
          Provide an institutional write-up structured in Markdown explaining technical breakouts, underlying buy/sell flows, and short-term directional expectations.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs estimated fair value]
          Growth Momentum: [score 1-10 based on price and volume momentum strength]
          Quality & Moat: [score 1-10 based on business quality and competitive position]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management credibility and capital allocation]`;
        modelReportDescription = "Price action momentum breakdown report styled in clean Markdown formatting.";
      } else if (mode === 'earnings') {
        modePromptBody = `Analyse the most recent earnings call transcript and quarterly results for ${cleanTicker} (search as "${searchTicker}") — listed on NSE India. Search specifically for their concall transcript, management commentary, quarterly revenue, profit, EBITDA, guidance and analyst questions. Focus entirely on this specific company's earnings data.

          Act as an Earnings Doctor. Structure your report in clean Markdown:

          ## QUARTERLY EARNINGS SNAPSHOT
          Latest quarterly revenue, net profit, EBITDA, and EPS with YoY and QoQ comparisons.

          ## MANAGEMENT COMMENTARY
          Key statements from the CEO/CFO in the most recent earnings concall about growth outlook and strategy.

          ## ANALYST Q&A INSIGHTS
          Important analyst questions and management responses from the concall transcript.

          ## FORWARD GUIDANCE
          Revenue and margin guidance provided by management for upcoming quarters.

          ## EARNINGS VERDICT
          Overall assessment of earnings quality, beat/miss vs estimates, and near-term catalysts.

          MANDATORY: At the very end of your report output these exact lines with integer scores 1-10, nothing else on those lines:
          Valuation Intelligence: [score 1-10 based on current valuation vs earnings power]
          Growth Momentum: [score 1-10 based on revenue and earnings growth trajectory]
          Quality & Moat: [score 1-10 based on margin quality and competitive durability]
          Execution Risk: [score 1-10 where 10 = very high risk, 1 = very low risk]
          Governance Alpha: [score 1-10 based on management execution and guidance reliability]`;
        modelReportDescription = "Earnings call transcript analysis and quarterly results diagnosis styled in clean Markdown.";
      } else {
        modePromptBody = `Generate a comprehensive deep-dive investment research report for the Indian stock "${cleanTicker}" (search as "${searchTicker}") listed on NSE/BSE.
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
          Governance Alpha: [score 1-10 based on management quality and capital allocation]`;
        modelReportDescription = "Comprehensive institutional equity deep-dive report with bull/bear cases styled in Markdown.";
      }

      const dynamicTaskPrompt = preamble + modePromptBody;

      const universalFocusInstruction = `\n\nFocus exclusively on company specific financial data for ${cleanTicker} listed on NSE India. Do not summarise generic market data, NSE website information, or navigation content. Search for this specific company's financial results, management commentary and business performance only.`;

      // Stage 1: Search Grounding — builds the raw grounded data corpus
      const searchPrompt = (mode === 'filings' || mode === 'research')
        ? `${dynamicTaskPrompt}${universalFocusInstruction}\n\nProcessing Date is ${todayStr}.`
        : `${dynamicTaskPrompt}${universalFocusInstruction}\n\nAlso identify 3 primary sector competitors and find current precise values for their PE Ratio, ROCE %, Operating Margin %, and Debt to Equity. Processing Date is ${todayStr}.`;

      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });

      const rawGroundedMetrics = searchResponse.text || "";
      console.log(`[ANALYZE] Stage 1 grounding: ${rawGroundedMetrics.length} chars`);

      // Filter scraped context — reject nav/non-financial content universally
      const safeContext = isScrapedContentUsable(context || "") ? context : "";
      const contextBlock = safeContext
        ? `${SCRAPED_CONTEXT_WARNING}${safeContext}`
        : "No usable scraped context — rely on grounded data above only.";

      // Reusable schema for JSON structured response
      const reportSchema = {
        type: "OBJECT",
        properties: {
          report: { type: "STRING", description: modelReportDescription },
          benchmarking: {
            type: "ARRAY",
            description: "Sector peer benchmark numeric data for front-end charts.",
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
      };

      // Stage 2: JSON Structuring — enforces original analytical writing, not scraped content summary
      const isFilingsMode = mode === 'filings' || mode === 'research';
      const formattingPrompt = isFilingsMode
        ? `${dynamicTaskPrompt}\n\nUsing the grounded data below, write the complete Markdown report. Every section must be fully written with original analysis.\n\nGrounded Data Corpus:\n---\n${rawGroundedMetrics}\n---\nBackground Context (reference only — do not reproduce):\n---\n${contextBlock}\n---`
        : `${dynamicTaskPrompt}\n\nUsing the grounded data below:
        1. Write the complete original research report in the "report" field — comprehensive, analytical, never cut off.
        2. Extract PE Ratio, ROCE %, Operating Margin %, Debt to Equity for ${cleanTicker} vs peer average in "benchmarking".

        Grounded Data Corpus:
        ---
        ${rawGroundedMetrics}
        ---
        Background Context (reference only — do not reproduce):
        ---
        ${contextBlock}
        ---`;

      const structuredResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: formattingPrompt }] }],
        config: { responseMimeType: "application/json", maxOutputTokens: 65536, responseSchema: reportSchema }
      });

      const finishReason = structuredResponse.candidates?.[0]?.finishReason;
      console.log(`[ANALYZE] Stage 2 response: ${(structuredResponse.text || "").length} chars | finishReason: ${finishReason}`);
      const parsedPayload = JSON.parse(sanitizeGroundingJson(structuredResponse.text || ""));

      // Normalise benchmarking numbers
      if (parsedPayload && Array.isArray(parsedPayload.benchmarking)) {
        parsedPayload.benchmarking = parsedPayload.benchmarking.map((b: any) => {
          const targetVal = typeof b.targetValue === 'string' ? parseFloat(b.targetValue.replace(/[^\d.-]/g, '')) : b.targetValue;
          const industryAvg = typeof b.industryAverage === 'string' ? parseFloat(b.industryAverage.replace(/[^\d.-]/g, '')) : b.industryAverage;
          return {
            metric: String(b.metric || "Metric"),
            targetValue: isNaN(targetVal) || targetVal === null ? 0 : Number(targetVal),
            industryAverage: isNaN(industryAvg) || industryAvg === null ? 0 : Number(industryAvg)
          };
        });
      }

      let reportText = parsedPayload.report || "";
      let validation = isReportValid(reportText);

      // Attempt 1: report failed — regenerate with empty context (no scraped noise)
      if (!validation.valid) {
        console.log(`[ANALYZE] Report validation failed (${validation.reason}) — Attempt 1: regenerating without scraped context`);
        const retryPrompt = `${dynamicTaskPrompt}${universalFocusInstruction}\n\nGrounded Data only (no scraped context):\n---\n${rawGroundedMetrics}\n---`;
        try {
          const retryRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: retryPrompt }] }],
            config: { responseMimeType: "application/json", maxOutputTokens: 65536, responseSchema: reportSchema }
          });
          const retryPayload = JSON.parse(sanitizeGroundingJson(retryRes.text || ""));
          if (retryPayload.report) {
            reportText = retryPayload.report;
            if (Array.isArray(retryPayload.benchmarking) && retryPayload.benchmarking.length) {
              parsedPayload.benchmarking = retryPayload.benchmarking;
            }
          }
        } catch { /* keep previous text if JSON parse fails */ }
        validation = isReportValid(reportText);
      }

      // Attempt 2: pure Gemini search grounding, zero scraped context
      if (!validation.valid) {
        console.log(`[ANALYZE] Report still invalid (${validation.reason}) — Attempt 2: pure Gemini grounding fallback`);
        const fallbackGroundingPrompt = `Generate a comprehensive institutional equity research report for ${cleanTicker} listed on NSE India. Include: company overview, recent financial performance, quarterly results analysis, management quality assessment, bull case, bear case, key risks, valuation and investment recommendation. Use your search grounding to find the most current data available. Processing Date: ${todayStr}.`;
        try {
          const fallbackSearch = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: fallbackGroundingPrompt }] }],
            config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
          });
          const fallbackGrounded = fallbackSearch.text || "";
          const fallbackStructPrompt = `${dynamicTaskPrompt}\n\nGrounded Data:\n---\n${fallbackGrounded}\n---\nWrite the complete original research report using only this grounded data.`;
          const fallbackStructRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: fallbackStructPrompt }] }],
            config: { responseMimeType: "application/json", maxOutputTokens: 65536, responseSchema: reportSchema }
          });
          const fallbackPayload = JSON.parse(sanitizeGroundingJson(fallbackStructRes.text || ""));
          if (fallbackPayload.report && fallbackPayload.report.length > 200) {
            reportText = fallbackPayload.report;
            if (Array.isArray(fallbackPayload.benchmarking) && fallbackPayload.benchmarking.length) {
              parsedPayload.benchmarking = fallbackPayload.benchmarking;
            }
          }
        } catch { /* keep whatever we have */ }
      }

      if (!reportText || reportText.length < 100) {
        reportText = `# Analysis Unavailable: ${cleanTicker}\n\nThe research pipeline was unable to generate a valid report for this ticker. Please retry — live grounding requires an active connection.`;
      }

      const confidence = assessConfidence(reportText);
      console.log(`[ANALYZE] Analysis complete! report=${reportText.length} chars, confidence=${confidence}`);
      return res.json({
        report: reportText,
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
    const validation = validateTicker(cleanTicker);
    if (!validation.isValid) {
      return res.status(422).json({
        error: "TICKER_NOT_FOUND",
        message: `'${cleanTicker}' does not appear to be a valid stock ticker format. Please enter a valid NSE or BSE stock symbol such as RELIANCE, TCS, M&M or L&T.`
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

      const streamSearchTicker = searchQueryTicker(cleanTicker);
      const streamPreamble = buildAnalystPreamble(cleanTicker);

      let streamModeBody = "";
      if (mode === 'research' || mode === 'filings') {
        streamModeBody = `Perform an EXHAUSTIVE, UNTRUNCATED AUDIT AND COMPLIANCE DISCLOSURE REPORT for the Indian stock ticker "${cleanTicker}" (search as "${streamSearchTicker}") based on official SEBI filings and NSE announcements.
          Structure your response into these exact Markdown sections with extensive technical detail:
          # 📑 Corporate Governance & Audit Disclosures: ${cleanTicker}
          ## 1. SEBI CORPORATE FILINGS ACCOUNTABILITY
          ## 2. PROMOTER HOLDING & PLEDGING INTELLIGENCE
          ## 3. RELATED PARTY TRANSACTIONS & CASH FLOW INTEGRITY
          ## 4. REGULATORY FRICTION & COMPLIANCE ALERTS
          ## 5. BOARD ALPHA & GOVERNANCE CONCLUSION

          MANDATORY SCORECARD at the very end (integers 1-10, no other text on these lines):
          Transcript Transparency: X
          Disclosure Completeness: X
          Guideline Conservatism: X
          Governance Cleanliness: X`;
      } else if (mode === 'move') {
        streamModeBody = `Analyze momentum, volume anomalies, price action breaks, block trades, and catalyst drivers causing recent market movements for ${cleanTicker} (search as "${streamSearchTicker}" on NSE India). Write an institutional Markdown report.

          MANDATORY scores at the very end (integers 1-10):
          Valuation Intelligence: [score]
          Growth Momentum: [score]
          Quality & Moat: [score]
          Execution Risk: [score]
          Governance Alpha: [score]`;
      } else if (mode === 'earnings') {
        streamModeBody = `Analyse the most recent earnings call transcript and quarterly results for ${cleanTicker} (search as "${streamSearchTicker}") — listed on NSE India. Act as an Earnings Doctor. Structure your report:

          ## QUARTERLY EARNINGS SNAPSHOT
          ## MANAGEMENT COMMENTARY
          ## ANALYST Q&A INSIGHTS
          ## FORWARD GUIDANCE
          ## EARNINGS VERDICT

          MANDATORY scores at the very end (integers 1-10):
          Valuation Intelligence: [score]
          Growth Momentum: [score]
          Quality & Moat: [score]
          Execution Risk: [score]
          Governance Alpha: [score]`;
      } else {
        streamModeBody = `Generate a comprehensive deep-dive investment research report for "${cleanTicker}" (search as "${streamSearchTicker}") listed on NSE/BSE. Structure:

          ## THE BULL CASE
          ## THE CONTRARIAN BEAR CASE
          ## INSTITUTIONAL CONVICTION METRICS
          ## EARNINGS & CATALYSTS
          ## ANALYST TARGETS

          MANDATORY scores at the very end (integers 1-10):
          Valuation Intelligence: [score]
          Growth Momentum: [score]
          Quality & Moat: [score]
          Execution Risk: [score]
          Governance Alpha: [score]`;
      }

      const streamDynamicPrompt = streamPreamble + streamModeBody;
      const streamFocusInstruction = `\n\nFocus exclusively on company specific financial data for ${cleanTicker} listed on NSE India. Do not summarise generic market data, NSE website information, or navigation content. Search for this specific company's financial results, management commentary and business performance only.`;

      // Stage 1: Search grounding (non-streaming — grounding requires a complete round-trip)
      send({ type: 'stage', message: 'Grounding with live NSE/SEBI data...' });
      const streamSearchText = (mode === 'filings' || mode === 'research')
        ? `${streamDynamicPrompt}${streamFocusInstruction}\n\nProcessing Date is ${todayStr}.`
        : `${streamDynamicPrompt}${streamFocusInstruction}\n\nAlso identify 3 primary sector competitors and find current precise values for their PE Ratio, ROCE %, Operating Margin %, and Debt to Equity. Processing Date is ${todayStr}.`;
      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: streamSearchText }] }],
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 8192 }
      });
      const rawGroundedMetrics = searchResponse.text || "";
      console.log(`[ANALYZE/STREAM] Stage 1 grounding: ${rawGroundedMetrics.length} chars`);

      // Filter scraped context — reject nav/non-financial content universally
      const streamSafeContext = isScrapedContentUsable(context || "") ? context : "";
      const streamContextBlock = streamSafeContext
        ? `${SCRAPED_CONTEXT_WARNING}${streamSafeContext}`
        : "No usable scraped context — rely on grounded data above only.";

      // Stage 2: Stream report as plain Markdown
      send({ type: 'stage', message: 'Streaming research report...' });
      const reportStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `${streamDynamicPrompt}${streamFocusInstruction}\n\nDo NOT truncate any section. Write entirely in your own analytical voice.\n\nGrounded Data:\n---\n${rawGroundedMetrics}\n---\nBackground Context (reference only — do not reproduce):\n---\n${streamContextBlock}\n---` }] }],
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

      // Post-stream validation — if report is bad, send a silent correction as a replacement chunk
      const streamValidation = isReportValid(accumulatedReport);
      if (!streamValidation.valid) {
        console.log(`[ANALYZE/STREAM] Report validation failed (${streamValidation.reason}) — sending corrected version`);
        send({ type: 'stage', message: 'Enhancing report quality...' });
        try {
          const correctionPrompt = `${streamDynamicPrompt}${streamFocusInstruction}\n\nGrounded Data only (no scraped context):\n---\n${rawGroundedMetrics}\n---\nWrite the complete original research report.`;
          const corrRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: correctionPrompt }] }],
            config: { maxOutputTokens: 8192 }
          });
          const correctedText = corrRes.text || "";
          if (isReportValid(correctedText).valid) {
            accumulatedReport = correctedText;
            send({ type: 'replace', text: correctedText });
          }
        } catch { /* keep original stream if correction fails */ }
      }

      // Stage 3: Benchmarking numbers
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
      const streamConfidence = assessConfidence(accumulatedReport);
      console.log(`[ANALYZE/STREAM] Complete. report=${accumulatedReport.length} chars, confidence=${streamConfidence}`);
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
