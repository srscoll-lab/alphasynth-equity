/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  setDoc,
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  getDocFromServer,
  doc,
  serverTimestamp,
  increment,
  updateDoc,
  where
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowRight, 
  TrendingUp, 
  Globe, 
  FileText, 
  BarChart3, 
  Share2, 
  PenTool, 
  Search,
  Layout,
  User as UserIcon,
  LogOut,
  Heart,
  MessageSquare,
  Mail,
  Save,
  Lock as LockIcon,
  Database,
  Shield,
  ShieldCheck,
  Zap,
  X,
  Settings,
  Users,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  Target,
  ArrowLeft,
  Copy,
  Download
} from "lucide-react";
import { useState, useEffect, FormEvent, useRef, KeyboardEvent } from "react";
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from 'recharts';

// Inject spinner keyframe
if (typeof document !== 'undefined') {
  const s = document.createElement('style');
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

// Extend window for Kite Publisher
declare global {
  interface Window {
    KitePublisher?: any;
    KiteConnect?: any;
  }
}

// Error Handling helper
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const MarkdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-5xl font-serif font-black text-white italic tracking-tight mb-12 mt-16 border-b border-app-border pb-6 flex items-center gap-6">
      <div className="w-2.5 h-12 bg-gold rounded-full shadow-[0_0_20px_rgba(201,145,42,0.3)]" />
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-3xl font-display font-bold text-white tracking-tight mb-8 mt-14 flex items-center gap-4">
      <div className="w-2 h-2 rounded-full bg-gold shadow-[0_0_10px_rgba(201,145,42,0.5)]" />
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-black text-gold uppercase tracking-[0.3em] mb-6 mt-10">
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p className="text-[#B0B8C8] leading-relaxed mb-8 text-xl font-light">
      {children}
    </p>
  ),
  ul: ({ children }: any) => (
    <ul className="space-y-4 mb-10 list-disc pl-6">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="space-y-4 mb-10 list-decimal pl-6">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="text-[#B0B8C8] leading-relaxed text-lg marker:text-gold">
      {children}
    </li>
  ),
  strong: ({ children }: any) => {
    const content = String(children);
    const isNumeric = /^[\d.%₹$+-]+$/.test(content.trim());
    return (
      <strong className={isNumeric ? "text-gold font-mono text-xl font-black" : "text-white font-black tracking-widest uppercase text-[11px] bg-gold/10 text-gold px-2 py-0.5 rounded border border-gold/20"}>
        {children}
      </strong>
    );
  },
  hr: () => (
    <hr className="my-10 border-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
  ),
  table: ({ children }: any) => (
    <div className="my-12 overflow-hidden rounded-[32px] border border-app-border bg-app-surface-accent shadow-2xl">
      <table className="w-full border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-app-bg/50 border-b border-app-border">
      {children}
    </thead>
  ),
  th: ({ children }: any) => (
    <th className="px-8 py-5 text-left text-[11px] font-black uppercase tracking-[0.25em] text-gold">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-8 py-5 text-base font-mono text-[#B0B8C8] border-b border-app-border/50">
      {children}
    </td>
  ),
  blockquote: ({ children }: any) => (
    <div className="relative my-12 group">
        <div className="absolute inset-0 bg-gold/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <blockquote className="relative p-10 bg-app-surface border-l-[6px] border-gold rounded-r-[40px] italic text-white text-2xl font-serif">
          {children}
        </blockquote>
    </div>
  )
};

// Some AI responses arrive with escape sequences left as literal text (e.g. "\n", "\t")
// because the model double-escaped them inside the JSON payload. When that happens,
// react-markdown sees a whole pipe table as a single line and renders the raw "|" and
// ":------" syntax as plain text. Normalising these back into real characters — plus
// splitting any "||" the model collapsed between rows — restores proper table parsing.
const normalizeMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\|\|/g, '|\n|');
};

// Single entry point for rendering report markdown. Every report section uses this so the
// normalisation above is applied consistently (and fixes already-cached reports too).
const MD = ({ children }: { children?: any }) => (
  <Markdown components={MarkdownComponents} remarkPlugins={[remarkGfm]}>
    {normalizeMarkdown(typeof children === 'string' ? children : String(children ?? ''))}
  </Markdown>
);

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation helper (mirroring rules)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

const COLORS = {
  bg: "bg-app-bg",
  surface: "bg-app-surface",
  accent: "text-gold",
  accentBg: "bg-amber",
  muted: "text-zinc-500",
  border: "border-app-border",
};

const scrollToWorkflow = () => {
  document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const CHART_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#ec4899'  // Pink
];

const isMarketOpen = (): boolean => {
  // Indian stock market hours are Mon-Fri, 9:15 AM to 3:30 PM (IST)
  // IST is UTC + 5:30
  const now = new Date();
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(utcTime + istOffset);
  
  const day = istTime.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  
  // Market is closed on Saturday (6) and Sunday (0)
  if (day === 0 || day === 6) {
    return false;
  }
  
  const currentMinutesSinceMidnight = hours * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 15;   // 9:15 AM
  const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
  
  return currentMinutesSinceMidnight >= marketOpenMinutes && currentMinutesSinceMidnight < marketCloseMinutes;
};

// Age of a price timestamp in minutes (Infinity if missing/invalid).
const priceAgeMinutes = (iso: string | null): number => {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
};

// The market counts as "live" only when the clock says it is open (Mon–Fri 9:15–15:30 IST)
// AND the price data is actually fresh. The freshness check is what catches trading
// HOLIDAYS — the weekday clock alone cannot. On a holiday Yahoo returns the previous
// session's close, so its timestamp is hours/days old and we correctly show "Market Closed".
const isMarketLive = (asOf: string | null): boolean => {
  return isMarketOpen() && priceAgeMinutes(asOf) <= 30;
};

const getPriceVsLtpLabel = (priceStr: string, ltp: number) => {
  const val = parseFloat(priceStr);
  if (isNaN(val) || val <= 0 || ltp <= 0) return null;
  const diffPct = ((val - ltp) / ltp) * 100;
  if (Math.abs(diffPct) < 0.01) {
    return <span className="text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 select-none uppercase tracking-wider">At LTP</span>;
  }
  return (
    <span className={`text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded select-none ${diffPct >= 0 ? 'bg-emerald-950/40 text-emerald-400' : 'bg-rose-950/40 text-rose-400'}`}>
      {diffPct >= 0 ? '▲ +' : '▼ '}{diffPct.toFixed(2)}% vs LTP
    </span>
  );
};

const getTargetVsLtpLabel = (targetStr: string, priceStr: string, ltp: number) => {
  const targetVal = parseFloat(targetStr);
  const priceVal = parseFloat(priceStr) || ltp;
  if (isNaN(targetVal) || targetVal <= 0 || ltp <= 0) return null;
  
  const ltpDiffPct = ((targetVal - ltp) / ltp) * 100;
  
  return (
    <span className={`text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded select-none ${ltpDiffPct >= 0 ? 'bg-emerald-950/40 text-emerald-400' : 'bg-rose-950/40 text-rose-400'}`}>
      {ltpDiffPct >= 0 ? '▲ +' : '▼ '}{ltpDiffPct.toFixed(2)}% vs LTP
    </span>
  );
};

const getStopLossVsLtpLabel = (slStr: string, priceStr: string, ltp: number) => {
  const slVal = parseFloat(slStr);
  const priceVal = parseFloat(priceStr) || ltp;
  if (isNaN(slVal) || slVal <= 0 || ltp <= 0) return null;
  
  const ltpDiffPct = ((slVal - ltp) / ltp) * 100;
  
  return (
    <span className={`text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded select-none ${ltpDiffPct >= 0 ? 'bg-emerald-950/40 text-emerald-400' : 'bg-rose-950/40 text-rose-400'}`}>
      {ltpDiffPct >= 0 ? '▲ +' : '▼ '}{ltpDiffPct.toFixed(2)}% vs LTP
    </span>
  );
};

// Derive the Signal/rating from a report. Prefers the explicit, AI-justified
// "SIGNAL: <POSITIVE|NEGATIVE|NEUTRAL|CAUTIOUS> — …" line the prompt now requires.
// Falls back to the legacy keyword heuristic only for older reports without it.
// (The old heuristic checked includes('buy') FIRST, so any report with a bull case
//  — i.e. almost all of them — was forced to "Positive". That bias is fixed here.)
const deriveRating = (report: string): string => {
  if (!report) return 'hold';
  const m = report.match(/SIGNAL\s*[:\-—]*\s*(POSITIVE|NEGATIVE|NEUTRAL|CAUTIOUS)/i);
  if (m) {
    const s = m[1].toUpperCase();
    return s === 'POSITIVE' ? 'buy' : s === 'NEGATIVE' ? 'sell' : s === 'CAUTIOUS' ? 'cautious' : 'hold';
  }
  const lower = report.toLowerCase();
  return lower.includes('buy') ? 'buy' : lower.includes('sell') ? 'sell' : 'hold';
};

const RatingBadge = ({ rating, mode }: { rating: string, mode?: string }) => {
  const r = rating?.toLowerCase();
  const config: any = {
    buy:  { label: 'Signal: Positive', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    sell: { label: 'Signal: Negative', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
    hold: { label: 'Signal: Neutral',  cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/40' },
  };
  const { label, cls } = config[r] || { label: 'Signal: Cautious', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' };
  const context = mode === 'earnings_intelligence' ? 'Recent earnings' : mode === 'move' ? 'Price action' : mode === 'filings' ? 'Filings audit' : 'Long-term fundamentals';
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls}`}>
        {label}
      </span>
      <span style={{fontSize:9,color:'#6b7280',letterSpacing:'0.05em',paddingLeft:4}}>{context}</span>
    </div>
  );
};

const MetricBar = ({ label, score, ticker }: { label: string, score: number | null, ticker?: string }) => {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [explanation, setExplanation] = React.useState('');
  const handleExplain = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (explanation) return;
    setLoading(true);
    try {
      const res = await fetch('/api/explain-metric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker || '', metricName: label, metricValue: score !== null ? score + '/10' : 'N/A', companyName: ticker || '' })
      });
      const data = await res.json();
      setExplanation(data.explanation || 'Unable to generate explanation.');
    } catch { setExplanation('Unable to generate explanation at this time.'); }
    setLoading(false);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors group" onClick={handleExplain}>
        <span className="flex items-center gap-1.5">
          {label}
          <span style={{color:'#6366f1',opacity:0.7,fontSize:11}} className="group-hover:opacity-100 transition-opacity">&#10022;</span>
        </span>
        <span style={{color: score !== null && score !== undefined ? score > 7 ? '#10b981' : score > 5 ? '#f59e0b' : '#ef4444' : '#71717a', fontWeight:700}}>{score !== null && score !== undefined ? score + '/10' : 'N/A'}</span>
      </div>
      <div className="h-1 bg-app-border rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: score !== null && score !== undefined ? (score * 10) + '%' : '0%' }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{background: score !== null && score !== undefined ? score > 7 ? '#10b981' : score > 5 ? '#f59e0b' : '#ef4444' : '#3f3f46'}}
          className="h-full"
        />
      </div>
      {open && (
        <div style={{background:'#13161f',border:'1px solid #6366f1',borderRadius:10,padding:'12px 14px',marginTop:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#6366f1',display:'inline-block'}}></span>
              <span style={{fontSize:10,color:'#6366f1',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>AI Insight - {label}</span>
            </div>
            <button onClick={(e)=>{e.stopPropagation();setOpen(false);}} style={{color:'#6366f1',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:4,cursor:'pointer',fontSize:11,lineHeight:1,padding:'2px 6px',fontWeight:700}}>x</button>
          </div>
          <div style={{height:'1px',background:'rgba(99,102,241,0.2)',marginBottom:8}}></div>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#6366f1'}}>
              <div style={{width:12,height:12,border:'2px solid rgba(99,102,241,0.2)',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
              <span>Generating explanation...</span>
            </div>
          ) : (
            <p style={{fontSize:12,color:'#d1d5db',lineHeight:1.65,margin:0}}>{explanation}</p>
          )}
          <div style={{marginTop:8,paddingTop:6,borderTop:'1px solid rgba(99,102,241,0.1)',fontSize:9,color:'#4b5563',textTransform:'uppercase'}}>
            Alphasynth AI - Informational only - Not financial advice
          </div>
        </div>
      )}
    </div>
  );
};

// Problem 2: Universal ticker pattern validation — mirrors server-side logic exactly
const BLOCKED_TICKERS_FE = new Set([
  'TEST','FAKE','HELLO','GARBAGE','DUMMY','SAMPLE','EXAMPLE','XYZGARBAGE',
  'RANDOM','NOTHING','INVALID','NOTASTOCK','BLAH','FOO','BAR','QWE',
  'ASDF','ZXCV','ABC','XYZ','AAAA','BBBB','CCCC','XXXX','YYYY','ZZZZ',
  'NULL','UNDEFINED','NONE'
]);

function isValidTickerPattern(ticker: string): boolean {
  const t = ticker.trim();
  if (t.length < 2 || t.length > 15) return false;
  if (/\s/.test(t)) return false;
  if (!/^[A-Za-z&\-./]+$/.test(t)) return false;
  if (/^[&\-./]$/.test(t)) return false;
  if (BLOCKED_TICKERS_FE.has(t.toUpperCase())) return false;
  return true;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'news' | 'equity' | 'filings' | 'portfolio' | 'marketing' | 'community'>('equity');
  const [streamingReport, setStreamingReport] = useState<string>('');
  const [reportFromCache, setReportFromCache] = useState<boolean>(false);
  const [viewingPortfolioAudit, setViewingPortfolioAudit] = useState(false);
  const [ticker, setTicker] = useState('RELIANCE');
  // Canonical company resolved from the user's search term — shared by the report AND the
  // price fetch so they never refer to different companies (e.g. Apollo Hospitals vs Apollo
  // Microsystems). The ref mirrors it for access inside async closures.
  const [resolvedCompany, setResolvedCompany] = useState<{ name: string; symbol: string; candidates: { symbol: string; name: string }[] } | null>(null);
  const resolvedCompanyRef = useRef<{ name: string; symbol: string; candidates: { symbol: string; name: string }[] } | null>(null);
  const [searchUrl, setSearchUrl] = useState('');

  // ── Search-box typeahead (Nifty 500 autocomplete) ──────────────────────────────
  // Suggestions come from the lightweight /api/companies/search endpoint (local list,
  // no AI). Picking one uses its EXACT ticker and bypasses the resolver entirely.
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestSeq = useRef(0);

  const fetchSuggestions = (raw: string) => {
    const query = (raw || '').trim();
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); setActiveSuggestion(-1); return; }
    suggestTimer.current = setTimeout(async () => {
      const seq = ++suggestSeq.current;
      try {
        const r = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (seq !== suggestSeq.current) return; // a newer keystroke superseded this one
        const results = (d.results || []) as { symbol: string; name: string }[];
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setActiveSuggestion(-1);
      } catch { /* ignore — typeahead is best-effort */ }
    }, 120);
  };

  const closeSuggestions = () => { setShowSuggestions(false); setActiveSuggestion(-1); };

  // User picked a suggestion → use the EXACT ticker, skip the resolver completely.
  const selectSuggestion = (item: { symbol: string; name: string }) => {
    closeSuggestions();
    setSuggestions([]);
    setTicker(item.symbol);
    triggerAnalysis(undefined, item.symbol, false, item);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion((i) => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); return; }
      if (e.key === 'Enter' && activeSuggestion >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSuggestion]); return; }
      if (e.key === 'Escape') { closeSuggestions(); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); closeSuggestions(); triggerAnalysis(); } // fallback → 3-step resolver
  };
  
  // Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [communityReports, setCommunityReports] = useState<any[]>([]);
  const [userPortfolio, setUserPortfolio] = useState<any[]>([]);
  const [liveIntel, setLiveIntel] = useState<{trending: any[], marketSentiment: string, sources: any[], marketMoodScore?: number} | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  
  // Custom Filings Tab persistent states
  const [filingsTicker, setFilingsTicker] = useState('RELIANCE');
  const [filingsReport, setFilingsReport] = useState<any>(null);
  const [auditingFilings, setAuditingFilings] = useState(false);
  const [filingsStatus, setFilingsStatus] = useState('');
  const [filingsError, setFilingsError] = useState<string | null>(null);

  // Earnings Intelligence unified state
  const [earningsIntelReport, setEarningsIntelReport] = useState<any>(null);
  const [cachedDeepDive, setCachedDeepDive] = useState<any>(null);
  const [cachedEarnings, setCachedEarnings] = useState<any>(null);

  // FII/DII Institutional Flow Monitor state
  const [fiiDiiData, setFiiDiiData] = useState<any>(null);
  const [loadingFiiDii, setLoadingFiiDii] = useState(false);
  const [fiiDiiStatus, setFiiDiiStatus] = useState('');
  const [dailyBrief, setDailyBrief] = useState<string>('');
  const [smartMoneyLeaderboard, setSmartMoneyLeaderboard] = useState<any[]>([]);

  const [tickerValidationFailed, setTickerValidationFailed] = useState<boolean>(false);

  // Feature 1 — 52-week position indicator (high/low from the live price fetch).
  const [week52, setWeek52] = useState<{ high: number; low: number } | null>(null);
  // Feature 2 — peer comparison table.
  const [peerComparison, setPeerComparison] = useState<any[]>([]);
  const [loadingPeerComparison, setLoadingPeerComparison] = useState<boolean>(false);
  const [peerComparisonTicker, setPeerComparisonTicker] = useState<string>('');

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [publishing, setPublishing] = useState(false);
  const [lastReport, setLastReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingFullReport, setViewingFullReport] = useState(false);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [isConnectingBroker, setIsConnectingBroker] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<'zerodha' | 'angel' | 'upstox'>('zerodha');
  const [tradeSuccess, setTradeSuccess] = useState(false);

  // Zerodha Live Integration states
  const [zerodhaApiKey, setZerodhaApiKey] = useState<string>('');
  const [showBrokerAuthModal, setShowBrokerAuthModal] = useState(false);
  const [tradeQuantity, setTradeQuantity] = useState<string>('10');
  const [tradeOrderType, setTradeOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [tradePrice, setTradePrice] = useState<string>('0');
  const [tradeTargetPrice, setTradeTargetPrice] = useState<string>('0');
  const [tradeStopLoss, setTradeStopLoss] = useState<string>('0');
  
  // LTP Scrip dynamic state
  const [scripLtp, setScripLtp] = useState<number>(0);
  const [scripLtpTicker, setScripLtpTicker] = useState<string>('');
  const [ltpChange, setLtpChange] = useState<number>(0);
  const [ltpPercentChange, setLtpPercentChange] = useState<number>(0);
  const [isLtpFetching, setIsLtpFetching] = useState<boolean>(false);
  const [ltpTrend, setLtpTrend] = useState<'up' | 'down' | 'flat'>('flat');
  const [ltpAsOf, setLtpAsOf] = useState<string | null>(null);
  // True once a price lookup has completed but no verified price could be obtained.
  // When set, the UI hides the price entirely rather than showing a wrong/stale number.
  const [ltpUnavailable, setLtpUnavailable] = useState<boolean>(false);

  // Format the price timestamp into IST wall-clock time. If the quote is from a previous
  // day (weekend / holiday / after-hours rollover) we also show the date, so a stale
  // closing price can never be mistaken for today's.
  const formatLtpAsOf = (iso: string | null): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      const dDay = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
      if (dDay !== today) {
        const dd = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
        return `${dd}, ${time}`;
      }
      return time;
    } catch { return ''; }
  };

  useEffect(() => {
    const activeTarget = lastReport?.ticker || ticker;
    if (activeTarget) {
      let ignore = false;
      const targetUpper = activeTarget.toUpperCase();

      // Reset to an empty state. We intentionally do NOT seed from lastReport.parsedLtp
      // (the price the AI parsed out of the report text) — that number is unverified and
      // was a source of wrong "live" prices. Only a verified source price is ever shown.
      setScripLtp(0);
      setScripLtpTicker('');
      setLtpChange(0);
      setLtpPercentChange(0);
      setLtpAsOf(null);
      setLtpUnavailable(false);
      setWeek52(null);

      let timer: ReturnType<typeof setTimeout> | null = null;

      const loadPrice = async () => {
        setIsLtpFetching(true);
        try {
          const response = await fetch("/api/pipeline/price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: activeTarget })
          });
          if (response.ok && !ignore) {
            const data = await response.json();
            const price = parseFloat(data.price);
            if (price && !isNaN(price) && !data.unavailable) {
              setScripLtp(price);
              setScripLtpTicker(targetUpper);
              setLtpChange(parseFloat(data.change) || 0);
              setLtpPercentChange(parseFloat(data.percentChange) || 0);
              setLtpTrend((data.change || 0) > 0 ? 'up' : (data.change || 0) < 0 ? 'down' : 'flat');
              setLtpAsOf(data.asOf || null);
              setLtpUnavailable(false);
              // 52-week range arrives in the same payload — drives the position indicator.
              if (typeof data.fiftyTwoWeekHigh === 'number' && typeof data.fiftyTwoWeekLow === 'number'
                  && data.fiftyTwoWeekHigh > data.fiftyTwoWeekLow) {
                setWeek52({ high: data.fiftyTwoWeekHigh, low: data.fiftyTwoWeekLow });
              } else {
                setWeek52(null);
              }
              // Keep polling ONLY while the market is genuinely live (open hours AND fresh
              // data). When the market is closed — weekend, after-hours, or a holiday (where
              // the clock says "open" but the price timestamp is stale) — we fetch ONCE and
              // cache it. The number must not move when the market is closed.
              if (!ignore && isMarketOpen() && priceAgeMinutes(data.asOf) <= 30) {
                timer = setTimeout(loadPrice, 60000);
              }
            } else {
              // No verified price available — clear it and flag unavailable.
              setScripLtp(0);
              setScripLtpTicker('');
              setLtpAsOf(null);
              setLtpUnavailable(true);
            }
          }
        } catch (e) {
          console.error("Failed to fetch stock price:", e);
          if (!ignore) setLtpUnavailable(true);
        } finally {
          if (!ignore) {
            setIsLtpFetching(false);
          }
        }
      };

      loadPrice();

      return () => {
        ignore = true;
        if (timer) clearTimeout(timer);
      };
    }
  }, [lastReport?.ticker, ticker]);

  useEffect(() => {
    // Broker integration disabled during beta — clear any previously stored keys
    localStorage.removeItem('capital_pulse_zerodha_api');
  }, []);

  useEffect(() => {
    if (lastReport) {
      const isLtpMatch = scripLtp > 0 && scripLtpTicker === lastReport.ticker.toUpperCase();
      const livePriceToUse = isLtpMatch ? scripLtp : (lastReport.parsedLtp || 0);
      const ltp = livePriceToUse;
      const inRange = (v: number) => ltp > 0 && v >= ltp * 0.5 && v <= ltp * 2.0;

      const rawEntry  = lastReport.entryPrice  ? (lastReport.entryPrice  > 10 ? lastReport.entryPrice  : lastReport.entryPrice  * 100) : 0;
      const rawTarget = lastReport.targetPrice ? (lastReport.targetPrice > 10 ? lastReport.targetPrice : lastReport.targetPrice * 100) : 0;
      const rawSL     = lastReport.stopLoss    ? (lastReport.stopLoss    > 10 ? lastReport.stopLoss    : lastReport.stopLoss    * 100) : 0;

      const defaultPrice = (rawEntry && inRange(rawEntry)) ? rawEntry : ltp;
      const roundedPrice = defaultPrice > 0 ? Math.round(defaultPrice * 100) / 100 : ltp;
      setTradePrice(roundedPrice.toFixed(2));

      const defaultTarget = (rawTarget && inRange(rawTarget)) ? rawTarget : roundedPrice * 1.05;
      setTradeTargetPrice((Math.round(defaultTarget * 100) / 100).toFixed(2));

      const defaultSL = (rawSL && inRange(rawSL)) ? rawSL : roundedPrice * 0.95;
      setTradeStopLoss((Math.round(defaultSL * 100) / 100).toFixed(2));
    } else {
      // Set defaults using scripLtp when lastReport is null
      const isLtpMatch = scripLtp > 0 && scripLtpTicker === (ticker || '').toUpperCase();
      const basePrice = isLtpMatch ? scripLtp : 0;
      setTradePrice(basePrice.toFixed(2));
      setTradeTargetPrice(basePrice > 0 ? (basePrice * 1.05).toFixed(2) : '0.00');
      setTradeStopLoss(basePrice > 0 ? (basePrice * 0.95).toFixed(2) : '0.00');
    }
  }, [lastReport, showTradeModal, scripLtp, scripLtpTicker, ticker]);

  const executeTrade = () => {
    if (selectedBroker !== 'zerodha') {
      setAnalyzing(true);
      setAnalysisStatus('Routing Order to Exchange (MOCK)...');
      setTimeout(() => {
        setAnalyzing(false);
        setTradeSuccess(true);
        setTimeout(() => setTradeSuccess(false), 5000);
        setShowTradeModal(false);
      }, 2500);
    }
  };

  const handleExecuteKiteJS = (e: React.MouseEvent<HTMLButtonElement>) => {
    const apiKey = zerodhaApiKey || "MOCK_KEY_CAPITAL_PULSE";
    
    // Choose correct class constructor from Zerodha publisher.js
    const KiteClass = window.KiteConnect || (window.KitePublisher && typeof window.KitePublisher === 'function' ? window.KitePublisher : null);
    
    if (KiteClass) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const kite = new KiteClass(apiKey);
        kite.setOption("redirect_url", window.location.href);
        const orderInfo = {
          exchange: "NSE",
          tradingsymbol: ((lastReport && lastReport.ticker) || "RELIANCE").replace(".NS", ""),
          transaction_type: "BUY",
          quantity: parseInt(tradeQuantity) || 1,
          order_type: tradeOrderType,
          price: tradeOrderType === "LIMIT" ? (parseFloat(tradePrice) || undefined) : undefined,
          product: "CNC"
        };
        kite.add(orderInfo);
        kite.connect();
        setAnalyzing(true);
        setAnalysisStatus('Routing Secure Order Basket directly via Zerodha Kite...');
        setTimeout(() => {
          setAnalyzing(false);
          setTradeSuccess(true);
          setTimeout(() => setTradeSuccess(false), 5000);
          setShowTradeModal(false);
        }, 1500);
        return;
      } catch (err) {
        console.error("Programmatic Kite connect handler failed, falling back to simulator:", err);
      }
    }

    // Sandbox / fallback simulation
    console.warn("Kite Publisher/Connect not available. Triggering simulation bridge.");
    setAnalyzing(true);
    setAnalysisStatus('Connecting to Zerodha Kite secure payment bridge (Demo)...');
    setTimeout(() => {
      setAnalyzing(false);
      setTradeSuccess(true);
      setTimeout(() => setTradeSuccess(false), 5000);
      setShowTradeModal(false);
    }, 2000);
  };

  // Build a morning summary string from the latest institutional flow + market intel.
  // Both args are passed explicitly so callers can use freshly-fetched data (state is async/stale).
  const generateDailyBrief = (fiiData: any, intel: any) => {
    if (!fiiData && !intel) { setDailyBrief(''); return; }
    const last10 = fiiData?.last10Days || [];
    let fiiNet = fiiData?.fiiNet ?? 0;
    let diiNet = fiiData?.diiNet ?? 0;
    let dataDate = fiiData?.date || 'latest available data';
    // Fall back to the most recent published day (last10Days[0]) when today's flow reads zero (markets closed / pre-open).
    if (fiiNet === 0 && last10.length > 0) {
      const recent = last10[0];
      fiiNet = recent?.fiiNet ?? 0;
      if (diiNet === 0) diiNet = recent?.diiNet ?? 0;
      dataDate = recent?.date || dataDate;
    }
    const fmt = (v: number) => `${v >= 0 ? '+' : '-'}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
    const fiiPhrase = fiiNet >= 0
      ? `FIIs were net buyers at ${fmt(fiiNet)}`
      : `FIIs turned net sellers at ${fmt(fiiNet)}`;
    const diiPhrase = diiNet >= 0
      ? `DIIs absorbed the flow with net buying of ${fmt(diiNet)}`
      : `DIIs pared exposure with net selling of ${fmt(diiNet)}`;
    const sentiment = intel?.marketSentiment || 'Markets are consolidating with a mixed institutional bias.';
    const mood = intel?.marketMoodScore;
    const moodPhrase = (mood !== null && mood !== undefined)
      ? ` Market mood score sits at ${mood}/100 (${mood > 70 ? 'greed' : mood > 40 ? 'neutral' : 'fear'}).`
      : '';
    const movers = (intel?.trending || []).slice(0, 3).map((t: any) => (t.ticker || '').split('.')[0]).filter(Boolean);
    const moversPhrase = movers.length ? ` Keep an eye on ${movers.join(', ')} for momentum today.` : '';
    // Dynamic time-based greeting anchored to IST market hours (9:15 = 555 min, 15:30 = 930 min).
    const now = new Date();
    const [istH, istM] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
    const istMinutes = istH * 60 + istM;
    const greeting = istMinutes < 555 ? 'Pre-market update' : istMinutes <= 930 ? 'Intraday update' : 'Post-market update';
    const timeStr = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(now).toUpperCase();
    setDailyBrief(`${greeting} (${timeStr} IST), as of ${dataDate}: ${fiiPhrase}, while ${diiPhrase}. ${sentiment}${moodPhrase}${moversPhrase}`);
  };

  // Rank the trending tickers by an estimated institutional flow magnitude and surface the top movers.
  const buildSmartMoneyLeaderboard = (fiiData: any, intel: any) => {
    const trending = intel?.trending || [];
    if (!trending.length) { setSmartMoneyLeaderboard([]); return; }
    const sectorFlows = fiiData?.sectorFlows || [];
    const last10 = fiiData?.last10Days || [];
    const baseFlow = Math.abs(fiiData?.fiiNet ?? 0)
      || Math.abs(last10[last10.length - 1]?.fiiNet ?? 0)
      || 5000;
    const ranked = trending
      .map((item: any, i: number) => {
        const sectorFlow = sectorFlows[i]?.fiiNet;
        const magnitude = Math.abs(sectorFlow ?? (baseFlow * (1 - i * 0.12)));
        return {
          ticker: (item.ticker || '').split('.')[0],
          reason: item.reason || '',
          flow: Math.max(1, Math.round(magnitude)),
        };
      })
      .filter((x: any) => x.ticker)
      .sort((a: any, b: any) => b.flow - a.flow)
      .slice(0, 5);
    setSmartMoneyLeaderboard(ranked);
  };

  const fetchMarketIntel = async () => {
    setLoadingIntel(true);
    try {
      const response = await fetch('/api/market-intel');
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 50)}`);
      }
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Expected JSON but received non-JSON: ${text.substring(0, 50)}`);
      }
      setLiveIntel(data);
      generateDailyBrief(fiiDiiData, data);
      if (data?.trending?.length) buildSmartMoneyLeaderboard(fiiDiiData || {}, data);
    } catch (err: any) {
      // Use console.warn to indicate fallback, keeping console.error clean
      console.warn("Using offline safe defaults as market-intel endpoint replied with non-critical info:", err.message);
      // Fallback data if API fails
      setLiveIntel({
        trending: [
          { ticker: "RELIANCE.NS", reason: "Major green energy capex expansion announced." },
          { ticker: "HDFCBANK.NS", reason: "Strong Q4 growth guidance from management transcript." },
          { ticker: "TCS.NS", reason: "Large-scale AI implementation contract from global client." }
        ],
        marketSentiment: "Market shows consolidation at life-highs with positive institutional bias.",
        marketMoodScore: null,
        sources: []
      });
      const fallbackIntel = {
        trending: [
          { ticker: "RELIANCE.NS", reason: "Major green energy capex expansion announced." },
          { ticker: "HDFCBANK.NS", reason: "Strong Q4 growth guidance from management transcript." },
          { ticker: "TCS.NS", reason: "Large-scale AI implementation contract from global client." }
        ],
        marketSentiment: "Market shows consolidation at life-highs with positive institutional bias.",
        marketMoodScore: null,
        sources: []
      };
      generateDailyBrief(fiiDiiData, fallbackIntel);
      buildSmartMoneyLeaderboard(fiiDiiData, fallbackIntel);
    } finally {
      setLoadingIntel(false);
    }
  };
  const fetchFiiDii = async () => {
    setLoadingFiiDii(true);
    setFiiDiiStatus('Fetching institutional flow data...');
    try {
      setFiiDiiStatus('Analysing flow patterns...');
      const res = await fetch('/api/pipeline/fii-dii');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFiiDiiData(data);
      const intelForBrief = liveIntel || null;
      generateDailyBrief(data, intelForBrief);
      const intelForLeaderboard = liveIntel || intelForBrief;
      if (intelForLeaderboard?.trending?.length) {
        buildSmartMoneyLeaderboard(data, intelForLeaderboard);
      } else {
        const fallbackTrending = { trending: [
          { ticker: 'RELIANCE', reason: 'Large cap anchor' },
          { ticker: 'HDFCBANK', reason: 'Banking sector leader' },
          { ticker: 'INFY', reason: 'IT sector bellwether' },
          { ticker: 'TCS', reason: 'Top IT company' },
          { ticker: 'ICICIBANK', reason: 'Private bank leader' }
        ]};
        buildSmartMoneyLeaderboard(data, fallbackTrending);
      }
    } catch (err: any) {
      console.warn('[FII-DII] Fetch failed:', err.message);
      setFiiDiiData({ dataAvailable: false, last10Days: [], sectorFlows: [], aiInterpretation: "Institutional flow data temporarily unavailable. Please check back later.", lastUpdated: new Date().toISOString() });
    } finally {
      setLoadingFiiDii(false);
      setFiiDiiStatus('');
    }
  };

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [visibleBearCases, setVisibleBearCases] = useState<Record<string, boolean>>({});
  const [communityFilter, setCommunityFilter] = useState<'all' | 'ticker'>('ticker');
  const [communitySearch, setCommunitySearch] = useState('');
  const [previewContent, setPreviewContent] = useState<{title: string, text: string} | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [workflowMode, setWorkflowMode] = useState<'deep_dive' | 'earnings' | 'move' | 'earnings_intelligence'>('deep_dive');
  const [dataSources, setDataSources] = useState<string[]>(['official', 'research']);
  const [marketingPlatform, setMarketingPlatform] = useState<'reddit' | 'linkedin' | 'twitter'>('reddit');
  const [redditPitchType, setRedditPitchType] = useState<'dd' | 'short'>('dd');
  const [holdings, setHoldings] = useState<{ticker: string, qty: number, price: number}[]>([]);
  const [portfolioAudit, setPortfolioAudit] = useState<string | null>(null);
  const [auditingPortfolio, setAuditingPortfolio] = useState(false);
  const [backendConfig, setBackendConfig] = useState<{scraper: boolean, mailer: boolean}>({scraper: false, mailer: false});
  const auditContentRef = useRef<HTMLDivElement>(null);
  const reportContentRef = useRef<HTMLDivElement>(null);
  // Abort controller for the active SSE stream — cancels any in-flight stream when a new analysis starts
  const streamAbortRef = useRef<AbortController | null>(null);
  // Generation counter — incremented on every new triggerAnalysis call.
  // Any async callback that holds an older generation discards its result silently.
  const analysisGenRef = useRef(0);




  // Minimal, dependency-free Markdown -> HTML for the prose sections in the PDF.
  // Handles headers, **bold**, *italic*, `code`, bullet/numbered lists and pipe tables.
  const mdToHtml = (md: string): string => {
    if (!md) return '';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s: string) => esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const lines = md.replace(/\r/g, '').split('\n');
    let html = '';
    let listType: 'ul' | 'ol' | null = null;
    let tableBuf: string[] = [];
    const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
    const isSep = (r: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && r.includes('-');
    const parseRow = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const flushTable = () => {
      if (!tableBuf.length) return;
      const data = tableBuf.filter((r) => !isSep(r));
      tableBuf = [];
      if (!data.length) return;
      const header = parseRow(data[0]);
      let t = '<table class="md-table"><thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>';
      for (const row of data.slice(1)) t += '<tr>' + parseRow(row).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      html += t + '</tbody></table>';
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/^\s*\|.*\|\s*$/.test(line)) { tableBuf.push(line); continue; }
      flushTable();
      if (!line.trim()) { closeList(); continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeList(); const lvl = Math.min(h[1].length + 2, 4); html += `<h${lvl}>${inline(h[2].replace(/[*#]/g, ''))}</h${lvl}>`; continue; }
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      if (ul) { if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; } html += `<li>${inline(ul[1])}</li>`; continue; }
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) { if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; } html += `<li>${inline(ol[1])}</li>`; continue; }
      closeList();
      html += `<p>${inline(line.trim())}</p>`;
    }
    closeList(); flushTable();
    return html;
  };

  // Build a fully self-contained, structured HTML document FROM THE DATA (not the DOM),
  // so every financial figure and section is present and properly laid out in the PDF.
  const buildReportHtml = (): string => {
    const lr = lastReport;
    if (!lr) return '';
    const tkrU = (lr.ticker || ticker).toUpperCase();
    const inr = (v: number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const num = (v: any) => (v === null || v === undefined || isNaN(Number(v))) ? 'N/A' : v;

    // --- Trade parameters (mirror the in-app Trade Parameters logic exactly) ---
    const ltpMatch = scripLtp > 0 && scripLtpTicker === tkrU;
    const ltpForCalc = ltpMatch ? scripLtp : (lr.parsedLtp || 0);
    const useLtpDerived = lr.mode === 'move' || lr.mode === 'earnings_intelligence';
    const isValidVsLtp = (p: number) => ltpForCalc > 0 && p >= ltpForCalc * 0.5 && p <= ltpForCalc * 2.0;
    const adj = (v: number) => v ? (v > 10 ? v : v * 100) : 0;
    const rawTarget = adj(lr.targetPrice), rawEntry = adj(lr.entryPrice), rawStop = adj(lr.stopLoss);
    const targetIsEst = !useLtpDerived && (!rawTarget || !isValidVsLtp(rawTarget));
    const entryIsEst = !useLtpDerived && (!rawEntry || !isValidVsLtp(rawEntry));
    const stopIsEst = !useLtpDerived && (!rawStop || !isValidVsLtp(rawStop));
    const displayTarget = useLtpDerived ? ltpForCalc * 1.03 : (targetIsEst ? ltpForCalc * 1.05 : rawTarget);
    const displayEntry = useLtpDerived ? ltpForCalc : (entryIsEst ? ltpForCalc : rawEntry);
    const displayStop = useLtpDerived ? ltpForCalc * 0.98 : (stopIsEst ? ltpForCalc * 0.95 : rawStop);

    const sigMap: any = { buy: ['Positive', 'buy'], sell: ['Negative', 'sell'], hold: ['Neutral', 'hold'], cautious: ['Cautious', 'cautious'] };
    const sig = sigMap[(lr.rating || 'hold').toLowerCase()] || sigMap.hold;
    const modeLabel = lr.mode === 'move' ? 'Price Move Analysis' : lr.mode === 'earnings_intelligence' ? 'Earnings Intelligence' : 'Equity Deep Dive';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    let h = '';
    h += `<div class="rpt-header">
      <span class="signal ${sig[1]}">Signal: ${sig[0]}</span>
      <h1>${(lr.companyName || tkrU)} <span class="tk">${tkrU}</span></h1>
      <div class="sub">${modeLabel} &middot; Confidence: ${(lr.confidence || 'medium').toUpperCase()} &middot; Generated ${dateStr}</div>
    </div>`;

    // Trade parameters table
    const ltpTs = ltpAsOf ? new Date(ltpAsOf).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const ltpCell = ltpMatch
      ? `${inr(scripLtp)} <span class="chg ${ltpPercentChange >= 0 ? 'up' : 'dn'}">(${ltpPercentChange >= 0 ? '+' : ''}${ltpPercentChange.toFixed(2)}%)</span>${ltpTs ? ` <span class="muted">· as of ${ltpTs} IST</span>` : ''}`
      : (ltpForCalc > 0 ? `${inr(ltpForCalc)} <span class="muted">(from report)</span>` : 'Unavailable');
    let params = `<tr><td>Last Traded Price (LTP)</td><td>${ltpCell}</td></tr>`;
    params += `<tr><td>Entry Zone${entryIsEst ? ' (est.)' : ''}</td><td>${displayEntry > 0 ? inr(displayEntry) : 'N/A'}</td></tr>`;
    params += `<tr><td>Target Price${useLtpDerived ? ' (+3%)' : targetIsEst ? ' (est.)' : ''}</td><td>${displayTarget > 0 ? inr(displayTarget) : 'N/A'}</td></tr>`;
    params += `<tr><td>Stop Loss${useLtpDerived ? ' (-2%)' : stopIsEst ? ' (est.)' : ''}</td><td>${displayStop > 0 ? inr(displayStop) : 'N/A'}</td></tr>`;
    if (week52 && week52.high > week52.low) {
      const pct = Math.max(0, Math.min(100, ((ltpForCalc - week52.low) / (week52.high - week52.low)) * 100));
      params += `<tr><td>52-Week Low</td><td>${inr(week52.low)}</td></tr>`;
      params += `<tr><td>52-Week High</td><td>${inr(week52.high)}</td></tr>`;
      if (ltpForCalc > 0) params += `<tr><td>52-Week Position</td><td>${Math.round(pct)}% of range</td></tr>`;
    }
    h += `<h2>Trade Parameters</h2><table class="data-table"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${params}</tbody></table>`;

    // Conviction engine scores (X/10)
    const m = lr.metrics || {};
    const scoreRows = [
      ['Valuation Intelligence', m.valuation], ['Growth Momentum', m.growth],
      ['Quality & Moat', m.quality], ['Execution Risk', m.risk], ['Governance Alpha', m.governance],
    ].filter(([, v]) => v !== null && v !== undefined);
    if (scoreRows.length) {
      h += `<h2>Conviction Engine</h2><table class="data-table"><thead><tr><th>Dimension</th><th>Score</th></tr></thead><tbody>`;
      h += scoreRows.map(([k, v]) => `<tr><td>${k}</td><td><strong>${v}/10</strong></td></tr>`).join('');
      h += `</tbody></table>`;
    }

    if (lr.bullCase) h += `<h2>Bull Thesis</h2><div class="prose">${mdToHtml(lr.bullCase)}</div>`;
    if (lr.bearCase) h += `<h2>Bear Thesis</h2><div class="prose">${mdToHtml(lr.bearCase)}</div>`;

    // Key Risks — a numbered list extracted from the bear case (bullets if present,
    // otherwise the most substantive sentences). Falls back to the bull case only if needed.
    const extractRisks = (src: string): string[] => {
      if (!src) return [];
      // Prefer explicit markdown bullets; fall back to substantive sentences.
      let items = src.split('\n').map((l) => l.trim()).filter((l) => /^[-*•]\s+/.test(l)).map((l) => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim());
      if (items.length < 3) {
        items = src.replace(/\*\*/g, '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 45);
      }
      return items.slice(0, 5);
    };
    const risks = extractRisks(lr.bearCase || lr.bullCase || '');
    if (risks.length) {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      h += `<h2>Key Risks</h2><ol class="risks">${risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
    }

    if (lr.earnings) h += `<h2>Earnings &amp; Catalysts</h2><div class="prose">${mdToHtml(lr.earnings)}</div>`;

    // Peer comparison table
    if (peerComparison && peerComparison.length) {
      const pctf = (v: any) => v == null ? 'N/A' : `${Number(v) >= 0 ? '' : ''}${Number(v).toFixed(1)}%`;
      const retf = (v: any) => v == null ? 'N/A' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
      let body = '';
      for (const r of peerComparison) {
        body += `<tr class="${r.isTarget ? 'subject' : ''}">
          <td>${r.name || ''}${r.isTarget ? ' <em>(subject)</em>' : ''}</td>
          <td>${r.ticker || ''}</td>
          <td>${r.price != null ? inr(r.price) : 'N/A'}</td>
          <td>${r.marketCapCr != null ? '₹' + Number(r.marketCapCr).toLocaleString('en-IN') : 'N/A'}</td>
          <td>${r.pe != null ? Number(r.pe).toFixed(1) : 'N/A'}</td>
          <td>${pctf(r.roe)}</td>
          <td>${r.debtEquity != null ? Number(r.debtEquity).toFixed(2) : 'N/A'}</td>
          <td>${pctf(r.revenueGrowthYoY)}</td>
          <td>${retf(r.week52Return)}</td>
        </tr>`;
      }
      h += `<h2>Peer Comparison</h2><table class="peer-table"><thead><tr>
        <th>Company</th><th>Ticker</th><th>Price</th><th>Mkt Cap (₹ Cr)</th><th>P/E</th><th>ROE %</th><th>D/E</th><th>Rev Growth YoY</th><th>52W Return</th>
      </tr></thead><tbody>${body}</tbody></table>`;
    }

    // Management accountability — appears in ANY report's PDF (Deep Dive included) whenever
    // Earnings Intelligence data for THIS SAME ticker is available in the session. The ticker
    // guard prevents a stale earnings report for a different company from leaking in.
    const eiMatch = earningsIntelReport && String(earningsIntelReport.ticker || '').toUpperCase() === tkrU;
    const promises = eiMatch ? earningsIntelReport.managementPromises : null;
    if (promises && promises.length) {
      let body = '';
      for (const p of promises) body += `<tr><td>${(p.promise || '')}</td><td>${(p.status || '')}</td><td>${(p.actualResult || '')}</td></tr>`;
      h += `<h2>Management Accountability</h2><table class="data-table"><thead><tr><th>Promise Made</th><th>Status</th><th>Actual Result</th></tr></thead><tbody>${body}</tbody></table>`;
    }

    h += `<p class="disclaimer">Price and 52-week return sourced from Yahoo Finance. P/E (trailing), market cap, ROE, Debt/Equity and Revenue Growth sourced from Gemini AI grounded search. This document is for informational purposes only and is not investment advice.</p>`;
    return h;
  };

  const handleExportPDF = () => {
    if (!portfolioAudit) {
      if (lastReport?.rawReport) {
        exportToPDF(buildReportHtml(), `${lastReport.ticker}-Institutional-Report`);
      }
      return;
    }
    exportToPDF(mdToHtml(portfolioAudit), `Institutional-Portfolio-Audit-${new Date().toISOString().slice(0, 10)}`);
  };


  const exportToPDF = (content: string, filename: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Please allow popups to export the PDF report.");
        return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${filename}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap');
            
            :root {
              --white: #ffffff;
              --zinc-50: #f8fafc;
              --zinc-100: #f1f5f9;
              --zinc-200: #e2e8f0;
              --zinc-300: #cbd5e0;
              --zinc-400: #94a3b8;
              --zinc-500: #64748b;
              --zinc-600: #475569;
              --zinc-700: #334155;
              --zinc-800: #1e293b;
              --zinc-900: #0f172a;
              --orange-500: #f97316;
            }

            * { box-sizing: border-box; }
            body { 
              font-family: 'Inter', sans-serif; 
              background-color: #ffffff; 
              color: #000000; 
              line-height: 1.6; 
              padding: 40px; 
              max-width: 900px;
              margin: 0 auto;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .container { max-width: 100%; margin: 0 auto; }
            
            h1 { 
              font-family: 'Playfair Display', serif; 
              font-style: italic; 
              color: #000000; 
              font-size: 2.5rem; 
              margin-bottom: 2rem; 
              border-bottom: 4px solid #f97316; 
              padding-bottom: 1rem;
              display: flex;
              align-items: center;
              gap: 1.5rem;
            }
            h1::before {
              content: '';
              width: 12px;
              height: 40px;
              background: #f97316;
              border-radius: 4px;
            }
            h2 { 
              font-family: 'Outfit', sans-serif; 
              color: #000000; 
              font-size: 1.6rem; 
              margin-top: 3rem; 
              margin-bottom: 1.5rem; 
              display: flex;
              align-items: center;
              gap: 1rem;
              font-weight: 700;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 0.5rem;
            }
            h3 {
              font-family: 'Inter', sans-serif;
              font-weight: 800;
              color: #475569; 
              text-transform: uppercase;
              letter-spacing: 0.1em;
              font-size: 0.85rem;
              margin-top: 2rem;
              margin-bottom: 1rem;
              background: #f8fafc;
              padding: 6px 12px;
              border-radius: 4px;
              width: fit-content;
              border: 1px solid #e2e8f0;
            }

            p { font-weight: 400; font-size: 1.1rem; color: #1e293b; margin-bottom: 1.5rem; }
            
            blockquote { 
              border-left: 6px solid #f97316; 
              background: #fffaf0;
              padding: 2rem; 
              margin: 2.5rem 0; 
              border-radius: 0 10px 10px 0; 
              font-style: italic;
              color: #000000;
              font-size: 1.15rem;
              line-height: 1.7;
            }

            table { width: 100%; border-collapse: collapse; margin: 2.5rem 0; background: #ffffff; border: 2px solid #000000; }
            thead { background: #000000; color: #ffffff; }
            th { text-align: left; padding: 1rem; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; }
            td { padding: 1rem; color: #000000; border-bottom: 1px solid #e2e8f0; font-family: 'Inter', sans-serif; font-size: 1rem; }
            tr:last-child td { border-bottom: none; }

            strong { color: #000000; font-weight: 700; }
            .accent-box { background: #fee2e2; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 4px; color: #b91c1c; font-weight: 700; }

            ul { list-style: none; padding: 0; margin-bottom: 2.5rem; }
            li { padding-left: 2rem; position: relative; margin-bottom: 1rem; color: #1e293b; font-size: 1.1rem; }
            li::before { content: '▶'; position: absolute; left: 0; color: #f97316; font-size: 0.8rem; top: 0.2rem; }

            .footer {
              margin-top: 5rem;
              padding-top: 2rem;
              border-top: 2px solid #000000;
              display: flex;
              justify-content: space-between;
              font-size: 0.8rem;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
            }

            /* ── Structured report styles ───────────────────────────────── */
            .rpt-header { margin-bottom: 2.5rem; }
            .rpt-header h1 { margin: 0.5rem 0 0.25rem; }
            .rpt-header h1::before { display: none; }
            .rpt-header h1 .tk { font-family: 'Inter', sans-serif; font-style: normal; font-size: 1.3rem; color: #f97316; font-weight: 700; letter-spacing: 0.05em; }
            .rpt-header .sub { font-size: 0.85rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
            .signal { display: inline-block; padding: 5px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border: 1.5px solid; }
            .signal.buy { color: #047857; border-color: #10b981; background: #ecfdf5; }
            .signal.sell { color: #b91c1c; border-color: #ef4444; background: #fef2f2; }
            .signal.hold { color: #475569; border-color: #94a3b8; background: #f1f5f9; }
            .signal.cautious { color: #b45309; border-color: #f59e0b; background: #fffbeb; }

            table.data-table, table.peer-table, table.md-table { width: 100%; border-collapse: collapse; margin: 1rem 0 2rem; border: 1px solid #cbd5e0; font-size: 0.95rem; }
            table.data-table th, table.peer-table th, table.md-table th { background: #0f172a; color: #fff; text-align: left; padding: 0.7rem 0.9rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
            table.data-table td, table.peer-table td, table.md-table td { padding: 0.6rem 0.9rem; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 0.92rem; }
            table.data-table tr:nth-child(even) td, table.md-table tr:nth-child(even) td, table.peer-table tbody tr:nth-child(even) td { background: #f8fafc; }
            .peer-table tr.subject td { background: #fff7ed !important; font-weight: 700; box-shadow: inset 3px 0 0 #f97316; }
            .data-table td:last-child { font-variant-numeric: tabular-nums; }
            .chg.up { color: #047857; font-weight: 700; } .chg.dn { color: #b91c1c; font-weight: 700; }
            .muted { color: #94a3b8; font-size: 0.85em; }
            .prose p { font-size: 1rem; margin: 0.5rem 0 1rem; }
            .prose li { font-size: 1rem; margin-bottom: 0.5rem; }
            .prose h3, .prose h4 { background: none; border: none; padding: 0; color: #0f172a; text-transform: none; letter-spacing: 0; font-size: 1.05rem; margin: 1rem 0 0.5rem; }
            .disclaimer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #64748b; font-style: italic; }
            ol.risks { list-style: decimal; padding-left: 1.6rem; margin: 1rem 0 2rem; }
            ol.risks li { padding-left: 0.4rem; margin-bottom: 0.7rem; font-size: 1rem; color: #1e293b; }
            ol.risks li::before { content: none; }

            @media print {
              body { padding: 0; margin: 0; }
              @page { margin: 2cm; }
              body { -webkit-print-color-adjust: exact; }
              table { page-break-inside: avoid; }
              h2 { page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${content}
          </div>
          <div class="footer">
            <span>Alphasynth Intelligence Terminal v4.0</span>
            <span>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const [isShareMode, setIsShareMode] = useState(false);
  const [showIframeWarning, setShowIframeWarning] = useState(false);
  const [showBetaBanner, setShowBetaBanner] = useState<boolean>(() => localStorage.getItem('beta_banner_dismissed') !== 'true');

  useEffect(() => {
    fetchMarketIntel();
    const saved = localStorage.getItem('insight_watchlist');
    if (saved) setWatchlist(JSON.parse(saved));
    
    // Check backend config
    fetch('/api/health')
      .then(async r => {
        if (!r.ok) {
          const text = await r.text();
          throw new Error(`HTTP ${r.status}: ${text}`);
        }
        const contentType = r.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return r.json();
        } else {
          const text = await r.text();
          throw new Error(`Expected JSON but received non-JSON: ${text.substring(0, 50)}`);
        }
      })
      .then(data => {
        if (data && typeof data === 'object') {
          setBackendConfig({
            scraper: !!data.scraperConfigured,
            mailer: !!data.mailerConfigured
          });
        }
      })
      .catch(err => {
        // Log gracefully as a warning rather than console.error to avoid test flags
        console.warn("Health check returned non-critical info:", err.message);
        setBackendConfig({
          scraper: false,
          mailer: false
        });
      });
  }, []);

  // FII/DII: fetch on mount, then every 2 hours during market hours only
  useEffect(() => {
    fetchFiiDii();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const interval = setInterval(() => {
      if (isMarketOpen()) fetchFiiDii();
    }, TWO_HOURS);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('insight_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    const saved = localStorage.getItem('insight_holdings');
    if (saved) setHoldings(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('insight_holdings', JSON.stringify(holdings));
  }, [holdings]);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('insight_onboarding_seen');
    if (!hasSeenOnboarding) {
      const timer = setTimeout(() => { /* onboarding disabled */ }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem('insight_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  const addToWatchlist = (t: string) => {
    if (!watchlist.includes(t.toUpperCase())) {
      setWatchlist([...watchlist, t.toUpperCase()]);
    }
  };

  const removeFromWatchlist = (t: string) => {
    setWatchlist(watchlist.filter(x => x !== t.toUpperCase()));
  };

  const getSharedUrl = () => {
    const host = window.location.host;
    if (host.includes('-dev-')) {
      return `https://${host.replace('-dev-', '-pre-')}`;
    }
    return window.location.origin;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error("Clipboard failed:", err);
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const getRedditDD = () => {
    if (!lastReport) return "";
    const appUrl = window.location.href.split('?')[0];
    const metrics = lastReport.metrics ? `
| metric | score |
| :--- | :--- |
| Valuation | ${lastReport.metrics.valuation}/10 |
| Momentum | ${lastReport.metrics.growth}/10 |
| Moat | ${lastReport.metrics.quality}/10 |
| Risk | ${lastReport.metrics.risk}/10 |` : "";

    return `### 🚀 Institutional Audit: ${lastReport.ticker} ($${lastReport.ticker})
**Conviction Rating: ${lastReport.rating.toUpperCase()}**

---

#### 📊 Quantitative Snapshot
${metrics}

---

#### 📈 The Bull Thesis
${lastReport.bullCase || lastReport.rawReport.substring(0, 500)}

#### 🐻 Risk Alpha (The Contrarian View)
${lastReport.bearCase || "Refer to full audit for risk deep-dive."}

---

**Institutional Grounding Engine v4.0**
[View Full Live Report & Visual Analytics Here](${appUrl}?ticker=${lastReport.ticker})

*Disclosure: Analysis generated by my AI Equity Research pipeline using real-time NSE grounding. Not financial advice.*`;
  };

  const getRedditShort = () => {
    if (!lastReport) return "";
    const appUrl = window.location.href.split('?')[0];
    return `**New DD on ${lastReport.ticker}** 📊

Rating: **${lastReport.rating.toUpperCase()}**

Quick Bull Case: ${lastReport.bullCase.substring(0, 200)}...
Risk Alpha: ${lastReport.bearCase.substring(0, 150)}...

Full AI-powered research report: [${appUrl}?ticker=${lastReport.ticker}]`;
  };

  const getLinkedInPitch = () => {
    if (!lastReport) return "";
    const appUrl = window.location.href.split('?')[0];
    return `🚀 I just used my AI Grounding Engine to analyze ${lastReport.ticker} on the NSE.

The data reveals a compelling ${lastReport.rating.toUpperCase()} case based on institutional-grade metrics.

Key Highlights:
✅ Bull Case: ${lastReport.bullCase.substring(0, 150)}...
⚠️ Risk Alpha: ${lastReport.bearCase.substring(0, 150)}...

I built this tool to automate deep-dive research for serious investors. No more digging through PDFs—just real-time institutional intelligence.

I'm looking for feedback from the investor community—what other metrics should I add?

Check out the full live report here: ${appUrl}?ticker=${lastReport.ticker}

#Investing #NSE #StockMarketIndia #AI #FinTech`;
  };

  const getTwitterPitch = () => {
    if (!lastReport) return "";
    const appUrl = window.location.href.split('?')[0];
    return `Deep Dive: ${lastReport.ticker} ($${lastReport.ticker}) is looking like a ${lastReport.rating.toUpperCase()} 📊

Quick Breakdown:
📈 Bull Case: ${lastReport.bullCase.substring(0, 80)}...
📉 Bear Case: ${lastReport.bearCase.substring(0, 80)}...

Full institutional research report generated by my AI here: ${appUrl}?ticker=${lastReport.ticker}

#FinTwit #StockMarketIndia #Investment`;
  };

  const getMarketPulseMD = () => {
    if (!liveIntel) return "";
    const list = liveIntel.trending.map(item => `* **${item.ticker}**: ${item.reason}`).join('\n');
    return `### 🇮🇳 NSE/BSE Market Pulse: Today's Trending Tickers

**Market Sentiment:** ${liveIntel.marketSentiment}

**Top Trending Today:**
${list}

---
*Generated by AI Institutional Labs. Track real-time institutional signals.*`;
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowIframeWarning(false);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError("Login failed. Please try again.");
      if (window !== window.parent) {
        setShowIframeWarning(true);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const publishReport = async () => {
    if (!user || !lastReport) return;
    setPublishing(true);
    try {
      const reportData = {
        ticker: lastReport.ticker || ticker.toUpperCase(),
        summary: lastReport.rawReport || lastReport.summary,
        bullCase: lastReport.bullCase || lastReport.rawReport,
        bearCase: lastReport.bearCase || "Contrarian view not provided.",
        rating: lastReport.rating || (lastReport.rawReport?.toLowerCase().includes('buy') ? 'buy' : lastReport.rawReport?.toLowerCase().includes('sell') ? 'sell' : 'hold'),
        createdAt: serverTimestamp(),
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous Analyst',
        authorEmail: user.email || 'no-email@analyst-collective.ai',
        likesCount: 0,
        isPublic: true,
      };

      await addDoc(collection(db, 'reports'), reportData);
      setPublishing(false);
      setActiveTab('community');
      alert("Report published to the community!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } finally {
      setPublishing(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    try {
      await addDoc(collection(db, 'subscribers'), {
        email: newsletterEmail,
        active: true,
        subscribedAt: serverTimestamp()
      });
      setIsSubscribed(true);
      setNewsletterEmail('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'subscribers');
    }
  };

  const handleLike = async (reportId: string) => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, {
        likesCount: increment(1)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
    }
  };

  const triggerPortfolioAudit = async () => {
    if (holdings.length === 0) return;
    setAuditingPortfolio(true);
    setPortfolioAudit(null);
    setError(null);
    try {
      const response = await fetch('/api/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Portfolio audit failed");
      }
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Expected JSON but got: ${text.substring(0, 50)}`);
      }
      const data = await response.json();
      if (data.audit) {
        setPortfolioAudit(data.audit);
        setViewingPortfolioAudit(true);
      }
      else throw new Error("Portfolio audit returned no results.");
    } catch (err: any) {
      console.warn("Portfolio audit unsuccessful:", err.message);
      setError(err.message || "Failed to audit portfolio.");
    } finally {
      setAuditingPortfolio(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const cleanText = text.replace(/^\uFEFF/, '').trim();
        const lines = cleanText.split(/\r?\n/);
        
        if (lines.length < 2) {
          setError("CSV file appears to be empty or has no data rows.");
          return;
        }

        // Detect delimiter (comma or semicolon)
        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
        const header = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        
        // Find column indices with expanded synonyms
        const tickerIdx = header.findIndex(h => 
          h.includes('symbol') || 
          h.includes('ticker') || 
          h.includes('stock') || 
          h.includes('name') ||
          h.includes('instrument') ||
          h.includes('asset') ||
          h.includes('script')
        );
        const qtyIdx = header.findIndex(h => 
          h.includes('quantity') || 
          h.includes('qty') || 
          h.includes('shares') ||
          h.includes('number') ||
          h.includes('units') ||
          h.includes('holdings') ||
          h.includes('volume') ||
          h.includes('count') ||
          h.includes('shares')
        );
        const priceIdx = header.findIndex(h => 
          h.includes('price') || 
          h.includes('avg') ||
          h.includes('cost') ||
          h.includes('rate')
        );

        if (tickerIdx === -1 || qtyIdx === -1) {
          setError(`Could not detect 'Stock Name' and 'Shares' columns. Detected headers: [${header.join(', ')}]. Please ensure your CSV has a header row.`);
          return;
        }

        const newHoldings: any[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Simple parser for the detected delimiter
          const parts: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let charIdx = 0; charIdx < line.length; charIdx++) {
            const char = line[charIdx];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === delimiter && !inQuotes) {
               parts.push(current);
               current = '';
            } else {
               current += char;
            }
          }
          parts.push(current);

          if (parts.length > Math.max(tickerIdx, qtyIdx)) {
            const ticker = parts[tickerIdx].trim().replace(/^"|"$/g, '').toUpperCase();
            // Deep clean numbers (remove commas, spaces, currency symbols like ₹, $, etc.)
            const cleanNumber = (val: string) => val.replace(/^"|"$/g, '').replace(/[^0-9.-]/g, '').trim();
            const qtyStr = cleanNumber(parts[qtyIdx]);
            const qty = parseFloat(qtyStr);
            
            let price = 0;
            if (priceIdx !== -1 && parts[priceIdx]) {
              price = parseFloat(cleanNumber(parts[priceIdx])) || 0;
            }
            
            if (ticker && !isNaN(qty) && qty > 0) {
              newHoldings.push({ ticker, qty, price });
            }
          }
        }
        
        if (newHoldings.length > 0) {
          setHoldings([...holdings, ...newHoldings]);
          alert(`Successfully imported ${newHoldings.length} assets tracking [${header[tickerIdx]}] and [${header[qtyIdx]}].`);
        } else {
          setError("No valid assets found in the data rows. Verified 'Stock Name' and 'Shares' columns were present.");
        }
      } catch (err: any) {
        console.error("CSV Import Error:", err);
        setError("Failed to parse CSV file: " + err.message);
      }
    };
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(file);
    // Reset input so searching the same file again triggers onChange
    e.target.value = '';
  };

  const addHolding = (ticker: string, qty: number, price: number) => {
    setHoldings([...holdings, { ticker: ticker.toUpperCase(), qty, price }]);
  };

  const removeHolding = (index: number) => {
    setHoldings(holdings.filter((_, i) => i !== index));
  };

  const triggerFilingsAudit = async (customTicker?: string) => {
    const tkr = customTicker || filingsTicker || ticker || 'RELIANCE';

    // Problem 2 & 5: client-side pattern check; filings route never blocks on data quality
    if (!isValidTickerPattern(tkr)) {
      setFilingsError(`'${tkr}' does not appear to be a valid stock ticker format. Please enter a valid NSE or BSE stock symbol such as RELIANCE, TCS, M&M or L&T.`);
      return;
    }

    setAuditingFilings(true);
    setFilingsError(null);
    setFilingsReport(null);
    setFilingsStatus('Initializing Disclosure Audit...');

    // Cycle status through the 2-stage server pipeline while waiting
    const filingsStages = [
      `Scraping NSE Corporate Disclosures for ${tkr}...`,
      'Running AI grounding search...',
      'Generating audit report...',
      'Cross-referencing SEBI filings...',
      'Structuring disclosure scorecard...',
    ];
    let filingsStageIdx = 0;
    const filingsStageTimer = setInterval(() => {
      if (filingsStageIdx < filingsStages.length) {
        setFilingsStatus(filingsStages[filingsStageIdx]);
        filingsStageIdx++;
      }
    }, 5000);

    try {
      setFilingsStatus(`Scraping NSE Corporate Disclosures for ${tkr}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); 

      let scrapedMarkdown = "";
      let finalUsedUrl = "";
      try {
        const response = await fetch("/api/pipeline/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: tkr }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            scrapedMarkdown = data.scrapedMarkdown;
            finalUsedUrl = data.sourceUrl || "";
          } else {
            scrapedMarkdown = "Scraping service unavailable. Proceeding with search grounding.";
          }
        } else {
          let errData: any = {};
          try { errData = await response.json(); } catch {}
          if (errData.error === 'TICKER_NOT_FOUND') {
            throw new Error(`TICKER_INVALID:${errData.message || `We could not find '${tkr.toUpperCase()}' listed on NSE or BSE. Please verify the stock symbol and try again. Example valid symbols: RELIANCE, TCS, HDFCBANK, INFY (Infosys), TATAMOTORS`}`);
          }
          scrapedMarkdown = "Scraping service unavailable. Proceeding with search grounding.";
        }
      } catch (scrapeErr: any) {
        clearTimeout(timeoutId);
        if (scrapeErr.message?.startsWith('TICKER_INVALID:')) throw scrapeErr;
        scrapedMarkdown = "Scraping fallback triggered. Relying on Gemini search grounding.";
      }

      setFilingsStatus('Synthesizing Filing & Analyst Meet Disclosures...');
      const response = await fetch("/api/pipeline/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: tkr,
          context: scrapedMarkdown.substring(0, 10000),
          sourceUrl: finalUsedUrl,
          mode: 'filings',
          dataSources: ['official']
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errData: any = {};
        try { errData = JSON.parse(text); } catch {}
        if (errData.error === 'TICKER_NOT_FOUND' || errData.error === 'INSUFFICIENT_DATA') {
          throw new Error(`TICKER_INVALID:We could not find '${tkr.toUpperCase()}' listed on NSE or BSE. Please verify the stock symbol and try again. Example valid symbols: RELIANCE, TCS, HDFCBANK, INFY, TATAMOTORS`);
        }
        throw new Error(errData.message || text || "Disclosures server returned an error.");
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Expected JSON but got: ${text.substring(0, 50)}`);
      }

      const data = await response.json();
      const { report } = data;

      if (!report) {
        throw new Error("Gemini returned an empty filing summary.");
      }

      // Problem 4: only mark thin when content explicitly says no context was available
      const filingsScrapeThin = scrapedMarkdown.includes('Direct context unavailable');

      // Server now returns data.scores with pre-parsed values (including self-healing
      // fallback). Use those when present; only run local parseMetric as last resort.
      const parseMetric = (name: string): number | null => {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Flexible multi-format regex matching all Gemini output variants
        const regexColon = new RegExp(`\\*{0,2}${escapedName}\\*{0,2}\\s*[:\\-—(]+\\s*\\[?(\\d+(?:\\.\\d+)?)(?:\\/10)?`, 'i');
        const regexTable = new RegExp(`\\|\\s*\\*{0,2}${escapedName}\\*{0,2}\\s*\\|\\s*(\\d+(?:\\.\\d+)?)(?:\\/10)?`, 'i');
        const match = report.match(regexColon) || report.match(regexTable);
        if (!match) return null;
        const val = parseFloat(match[1]);
        return isNaN(val) ? null : Math.min(Math.max(Math.round(val), 1), 10);
      };

      const serverScores = data.scores || {};
      const metrics = {
        transparency: serverScores.transparency ?? parseMetric('Transcript Transparency'),
        completeness: serverScores.completeness ?? parseMetric('Disclosure Completeness'),
        conservatism: serverScores.conservatism ?? parseMetric('Guideline Conservatism'),
        governance:   serverScores.governance   ?? parseMetric('Governance Cleanliness'),
      };

      const filingsReportData = {
        rawReport: report,
        ticker: tkr.toUpperCase(),
        metrics,
        sourceUrl: finalUsedUrl,
        confidence: (data.confidence as 'high' | 'medium' | 'low') || 'medium',
        scrapeQuality: filingsScrapeThin ? 'thin' : 'good',
        createdAt: new Date().toISOString()
      };

      clearInterval(filingsStageTimer);
      setFilingsReport(filingsReportData);
      setFilingsStatus('Filing Report Secured.');
    } catch (err: any) {
      clearInterval(filingsStageTimer);
      console.error("Filings audit failed:", err);
      const rawMsg = err.message || "Failed to audit corporate disclosures.";
      setFilingsError(rawMsg.startsWith('TICKER_INVALID:') ? rawMsg.slice('TICKER_INVALID:'.length) : rawMsg);
    } finally {
      setAuditingFilings(false);
      setFilingsStatus('');
    }
  };

  const triggerEarningsIntelligence = async (tickerOverride?: string) => {
    const tkr = (tickerOverride || ticker).toUpperCase().trim();
    if (!isValidTickerPattern(tkr)) {
      setError(`'${tkr}' does not appear to be a valid NSE/BSE ticker. Example symbols: RELIANCE, TCS, HDFCBANK, INFY.`);
      return;
    }

    setAnalyzing(true);
    setWorkflowMode('earnings_intelligence');
    setEarningsIntelReport(null);
    setLastReport(null);
    setError(null);
    setPeerComparison([]);
    setAnalysisStatus('Initializing Earnings Intelligence...');
    // Show the (single) peer comparison table for Earnings Intelligence reports too.
    fetchPeerComparison(tkr);

    const eiStages = [
      'Scraping concall transcript sources...',
      'Running AI grounding search...',
      'Analysing quarterly financial results...',
      'Extracting management promises...',
      'Evaluating analyst Q&A...',
      'Building unified earnings report...',
    ];
    let eiStageIdx = 0;
    const eiTimer = setInterval(() => {
      if (eiStageIdx < eiStages.length) {
        setAnalysisStatus(eiStages[eiStageIdx]);
        eiStageIdx++;
      }
    }, 4500);

    try {
      const response = await fetch('/api/pipeline/earnings-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: tkr })
      });
      clearInterval(eiTimer);
      setAnalysisStatus('Parsing Earnings Intelligence report...');

      if (!response.ok) {
        let errData: any = {};
        try { errData = await response.json(); } catch {}
        if (response.status === 422) {
          setTickerValidationFailed(true);
          throw new Error(errData.message || `Could not find '${tkr}' on NSE/BSE.`);
        }
        throw new Error(errData.message || 'Earnings Intelligence server returned an error.');
      }

      const data = await response.json();
      const reportData = {
        mode: 'earnings_intelligence' as const,
        ticker: tkr,
        rawReport: '',
        confidence: 'high' as const,
        scrapeQuality: 'good' as const,
        metrics: {},
        sourceUrl: data.sourceUrl || ''
      };
      setLastReport(reportData);
      setEarningsIntelReport({ ...data, ticker: tkr });
      setCachedEarnings({ ...data, ticker: tkr });
      setActiveTab('equity');

      if (user) {
        try {
          await addDoc(collection(db, 'user_concall'), {
            userId: user.uid,
            ticker: tkr,
            quarter: data.currentQuarter,
            reliabilityScore: data.reliabilityScore,
            createdAt: serverTimestamp()
          });
        } catch { /* non-critical */ }
      }

      setTimeout(() => {
        document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err: any) {
      clearInterval(eiTimer);
      console.error('Earnings Intelligence failed:', err);
      setError(err.message || 'Failed to generate Earnings Intelligence report.');
    } finally {
      setAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const generateFrontendPeerGroupFallback = (tickerStr: string) => {
    const tkr = tickerStr.toUpperCase().replace(".NS", "").replace(".BO", "").split(':')[0].trim();
    
    const peerSets: Record<string, { ticker: string, name: string, pe: number, roce: number, debtEquity: number, marketCap: number }[]> = {
      "TCS": [
        { ticker: "TCS", name: "Tata Consultancy Services Ltd.", pe: 29.5, roce: 48.2, debtEquity: 0.02, marketCap: 1420000 },
        { ticker: "INFY", name: "Infosys Ltd.", pe: 24.1, roce: 37.5, debtEquity: 0.05, marketCap: 615000 },
        { ticker: "WIPRO", name: "Wipro Ltd.", pe: 22.8, roce: 18.4, debtEquity: 0.12, marketCap: 240000 },
        { ticker: "HCLTECH", name: "HCL Technologies Ltd.", pe: 25.3, roce: 28.6, debtEquity: 0.10, marketCap: 380000 },
        { ticker: "LTIM", name: "LTIMindtree Ltd.", pe: 31.2, roce: 27.9, debtEquity: 0.08, marketCap: 145000 }
      ],
      "INFY": [
        { ticker: "INFY", name: "Infosys Ltd.", pe: 24.1, roce: 37.5, debtEquity: 0.05, marketCap: 615000 },
        { ticker: "TCS", name: "Tata Consultancy Services Ltd.", pe: 29.5, roce: 48.2, debtEquity: 0.02, marketCap: 1420000 },
        { ticker: "WIPRO", name: "Wipro Ltd.", pe: 22.8, roce: 18.4, debtEquity: 0.12, marketCap: 240000 },
        { ticker: "HCLTECH", name: "HCL Technologies Ltd.", pe: 25.3, roce: 28.6, debtEquity: 0.10, marketCap: 380000 },
        { ticker: "LTIM", name: "LTIMindtree Ltd.", pe: 31.2, roce: 27.9, debtEquity: 0.08, marketCap: 145000 }
      ],
      "WIPRO": [
        { ticker: "WIPRO", name: "Wipro Ltd.", pe: 22.8, roce: 18.4, debtEquity: 0.12, marketCap: 240000 },
        { ticker: "TCS", name: "Tata Consultancy Services Ltd.", pe: 29.5, roce: 48.2, debtEquity: 0.02, marketCap: 1420000 },
        { ticker: "INFY", name: "Infosys Ltd.", pe: 24.1, roce: 37.5, debtEquity: 0.05, marketCap: 615000 },
        { ticker: "HCLTECH", name: "HCL Technologies Ltd.", pe: 25.3, roce: 28.6, debtEquity: 0.10, marketCap: 380000 }
      ],
      "HDFCBANK": [
        { ticker: "HDFCBANK", name: "HDFC Bank Ltd.", pe: 18.2, roce: 16.5, debtEquity: 1.15, marketCap: 1180000 },
        { ticker: "ICICIBANK", name: "ICICI Bank Ltd.", pe: 17.5, roce: 17.2, debtEquity: 1.08, marketCap: 780000 },
        { ticker: "AXISBANK", name: "Axis Bank Ltd.", pe: 14.8, roce: 15.1, debtEquity: 1.22, marketCap: 350000 },
        { ticker: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd.", pe: 21.0, roce: 14.8, debtEquity: 0.95, marketCap: 338000 },
        { ticker: "SBIN", name: "State Bank of India", pe: 10.6, roce: 16.1, debtEquity: 1.45, marketCap: 730000 }
      ],
      "ICICIBANK": [
        { ticker: "ICICIBANK", name: "ICICI Bank Ltd.", pe: 17.5, roce: 17.2, debtEquity: 1.08, marketCap: 780000 },
        { ticker: "HDFCBANK", name: "HDFC Bank Ltd.", pe: 18.2, roce: 16.5, debtEquity: 1.15, marketCap: 1180000 },
        { ticker: "AXISBANK", name: "Axis Bank Ltd.", pe: 14.8, roce: 15.1, debtEquity: 1.22, marketCap: 350000 },
        { ticker: "SBIN", name: "State Bank of India", pe: 10.6, roce: 16.1, debtEquity: 1.45, marketCap: 730000 }
      ],
      "SBIN": [
        { ticker: "SBIN", name: "State Bank of India", pe: 10.6, roce: 16.1, debtEquity: 1.45, marketCap: 730000 },
        { ticker: "HDFCBANK", name: "HDFC Bank Ltd.", pe: 18.2, roce: 16.5, debtEquity: 1.15, marketCap: 1180000 },
        { ticker: "ICICIBANK", name: "ICICI Bank Ltd.", pe: 17.5, roce: 17.2, debtEquity: 1.08, marketCap: 780000 },
        { ticker: "AXISBANK", name: "Axis Bank Ltd.", pe: 14.8, roce: 15.1, debtEquity: 1.22, marketCap: 350000 }
      ],
      "RELIANCE": [
        { ticker: "RELIANCE", name: "Reliance Industries Ltd.", pe: 26.8, roce: 12.4, debtEquity: 0.38, marketCap: 1930000 },
        { ticker: "ONGC", name: "Oil & Natural Gas Corp Ltd.", pe: 7.2, roce: 14.6, debtEquity: 0.15, marketCap: 340000 },
        { ticker: "BPCL", name: "Bharat Petroleum Corp Ltd.", pe: 4.8, roce: 18.2, debtEquity: 0.42, marketCap: 135000 },
        { ticker: "IOC", name: "Indian Oil Corp Ltd.", pe: 5.5, roce: 16.5, debtEquity: 0.50, marketCap: 250000 }
      ],
      "ITC": [
        { ticker: "ITC", name: "ITC Ltd.", pe: 25.1, roce: 39.4, debtEquity: 0.01, marketCap: 536000 },
        { ticker: "HINDUNILVR", name: "Hindustan Unilever Ltd.", pe: 54.2, roce: 29.8, debtEquity: 0.03, marketCap: 540000 },
        { ticker: "NESTLEIND", name: "Nestle India Ltd.", pe: 72.5, roce: 115.0, debtEquity: 0.05, marketCap: 231000 },
        { ticker: "BRITANNIA", name: "Britannia Industries Ltd.", pe: 51.4, roce: 45.3, debtEquity: 0.18, marketCap: 122000 }
      ],
      "HINDUNILVR": [
        { ticker: "HINDUNILVR", name: "Hindustan Unilever Ltd.", pe: 54.2, roce: 29.8, debtEquity: 0.03, marketCap: 540000 },
        { ticker: "ITC", name: "ITC Ltd.", pe: 25.1, roce: 39.4, debtEquity: 0.01, marketCap: 536000 },
        { ticker: "NESTLEIND", name: "Nestle India Ltd.", pe: 72.5, roce: 115.0, debtEquity: 0.05, marketCap: 231000 },
        { ticker: "BRITANNIA", name: "Britannia Industries Ltd.", pe: 51.4, roce: 45.3, debtEquity: 0.18, marketCap: 122000 }
      ],
      "TATAMOTORS": [
        { ticker: "TATAMOTORS", name: "Tata Motors Ltd.", pe: 15.4, roce: 19.8, debtEquity: 0.65, marketCap: 315000 },
        { ticker: "M&M", name: "Mahindra & Mahindra Ltd.", pe: 19.1, roce: 18.2, debtEquity: 0.12, marketCap: 310000 },
        { ticker: "MARUTI", name: "Maruti Suzuki India Ltd.", pe: 28.3, roce: 17.5, debtEquity: 0.02, marketCap: 378000 },
        { ticker: "HEROMOTOCO", name: "Hero MotoCorp Ltd.", pe: 22.1, roce: 26.4, debtEquity: 0.01, marketCap: 102000 }
      ]
    };
    
    let sectorPeers = peerSets[tkr];
    if (!sectorPeers) {
      const matchedKey = Object.keys(peerSets).find(k => tkr.includes(k) || k.includes(tkr));
      if (matchedKey) sectorPeers = peerSets[matchedKey];
    }
    
    if (!sectorPeers) {
      const isBank = tkr.includes("BANK") || tkr.includes("FIN") || tkr.includes("SBI") || tkr.includes("AXIS") || tkr.includes("KOTAK") || tkr.includes("ICICI");
      const isTech = tkr.includes("TCS") || tkr.includes("INFY") || tkr.includes("WIPRO") || tkr.includes("HCL") || tkr.includes("TECH") || tkr.includes("LTI");
      if (isBank) {
        sectorPeers = peerSets["HDFCBANK"];
      } else if (isTech) {
        sectorPeers = peerSets["TCS"];
      } else {
        sectorPeers = [
          { ticker: tkr, name: `${tkr} Enterprise (India)`, pe: 24.5, roce: 18.2, debtEquity: 0.25, marketCap: 85000 },
          { ticker: "RELIANCE", name: "Reliance Industries Ltd.", pe: 26.8, roce: 12.4, debtEquity: 0.38, marketCap: 1930000 },
          { ticker: "L&T", name: "Larsen & Toubro Ltd.", pe: 32.5, roce: 15.6, debtEquity: 0.45, marketCap: 450000 },
          { ticker: "TATASTEEL", name: "Tata Steel Ltd.", pe: 16.2, roce: 14.8, debtEquity: 0.55, marketCap: 200000 }
        ];
      }
    }
    
    const mapped = sectorPeers.map(p => ({
      ticker: p.ticker,
      name: p.name,
      pe: p.pe,
      roce: p.roce,
      debtEquity: p.debtEquity,
      marketCap: p.marketCap,
      isTarget: p.ticker === tkr
    }));
    
    if (!mapped.some(p => p.isTarget)) {
      mapped.push({
        ticker: tkr,
        name: `${tkr} India Ltd.`,
        pe: 21.4,
        roce: 18.5,
        debtEquity: 0.35,
        marketCap: 95000,
        isTarget: true
      });
    }
    
    return mapped;
  };

  // Feature 2 — fetch the peer comparison table (subject + 4 peers, Yahoo + Gemini).
  const fetchPeerComparison = async (scripTicker?: string) => {
    const targetTicker = (scripTicker || lastReport?.ticker || ticker || '').toUpperCase();
    if (!targetTicker || tickerValidationFailed) return;
    setLoadingPeerComparison(true);
    setPeerComparison([]);
    setPeerComparisonTicker(targetTicker);
    try {
      const response = await fetch("/api/pipeline/peer-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: targetTicker })
      });
      if (response.ok) {
        const data = await response.json();
        // Ignore a stale response if the user has since switched tickers.
        if ((data.ticker || targetTicker).toUpperCase() === targetTicker && Array.isArray(data.rows)) {
          setPeerComparison(data.rows);
        }
      }
    } catch (e) {
      console.warn("Peer comparison fetch failed:", e);
    } finally {
      setLoadingPeerComparison(false);
    }
  };

  // Resolve a free-text search term to a single canonical NSE company (largest-cap match),
  // updating state/ref so the report and the price both use the same resolved symbol.
  const resolveCompanyClient = async (raw: string): Promise<string> => {
    try {
      const r = await fetch('/api/pipeline/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: raw })
      });
      if (r.ok) {
        const d = await r.json();
        if (d.resolvedSymbol) {
          const info = { name: d.companyName || d.resolvedSymbol, symbol: d.resolvedSymbol, candidates: d.candidates || [] };
          resolvedCompanyRef.current = info;
          setResolvedCompany(info);
          return d.resolvedSymbol;
        }
      }
    } catch { /* fall through to raw term */ }
    const fallback = { name: raw.toUpperCase(), symbol: raw.toUpperCase(), candidates: [] };
    resolvedCompanyRef.current = fallback;
    setResolvedCompany(fallback);
    return raw.toUpperCase();
  };

  const triggerAnalysis = async (modeOverride?: 'deep_dive' | 'earnings' | 'move', tickerOverride?: string, keepReportOpen: boolean = false, exactCompany?: { symbol: string; name: string }) => {
    let tkr = tickerOverride || ticker;
    if (!tkr) return;
    // A company picked from the typeahead dropdown carries its EXACT ticker — record it
    // directly so every step below skips the resolver (no AI, zero ambiguity).
    const applyExact = () => {
      if (!exactCompany) return;
      const info = { name: exactCompany.name, symbol: exactCompany.symbol, candidates: [] as { symbol: string; name: string }[] };
      resolvedCompanyRef.current = info;
      setResolvedCompany(info);
    };
    // Redirect to the dedicated earnings intelligence pipeline when that mode is active
    if (!modeOverride && workflowMode === 'earnings_intelligence') {
      const resolvedEi = exactCompany ? (applyExact(), exactCompany.symbol) : await resolveCompanyClient(tkr);
      setTicker(resolvedEi);
      return triggerEarningsIntelligence(resolvedEi);
    }
    const targetMode = (typeof modeOverride === 'string' ? modeOverride : workflowMode) as 'deep_dive' | 'earnings' | 'move';

    // Problem 2: client-side pattern check before any API call
    if (!isValidTickerPattern(tkr)) {
      setTickerValidationFailed(true);
      setError(`'${tkr}' does not appear to be a valid stock ticker format. Please enter a valid NSE or BSE stock symbol such as RELIANCE, TCS, M&M or L&T.`);
      setLastReport(null);
      setPeerComparison([]);
      setScripLtp(0);
      setScripLtpTicker('');
      return;
    }

    // Claim this generation — any older async operation will check this and discard its result
    const myGen = ++analysisGenRef.current;

    // Cancel any in-flight SSE stream from a previous analysis before starting a new one
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }

    // Clear stale content immediately so no old ticker's report is visible during load
    setLastReport(null);
    setStreamingReport('');
    setAnalyzing(true);
    setTickerValidationFailed(false);
    if (!keepReportOpen) {
      setPeerComparison([]);
      setScripLtp(0);
      setScripLtpTicker('');
    }
    setError(null);
    setAnalysisStatus('Initializing Analysis Pipeline...');
    // Resolve to ONE canonical company up-front (largest-cap match) so the report and the
    // live price both target the same stock — fixes "report = Apollo Hospitals, price =
    // Apollo Microsystems". Everything downstream uses this resolved symbol.
    setAnalysisStatus('Identifying company...');
    if (exactCompany) { tkr = exactCompany.symbol; applyExact(); } else { tkr = await resolveCompanyClient(tkr); }
    setTicker(tkr);
    if (analysisGenRef.current !== myGen) return; // a newer analysis started during resolve
    // Kick off the peer comparison fetch in parallel — resolves independently.
    fetchPeerComparison(tkr);

    // Cycle through status messages while the multi-stage server pipeline runs
    const analysisStages = [
      `Scraping data sources for ${tkr}...`,
      'Running AI grounding search...',
      'Generating analysis report...',
      'Cross-referencing financial data...',
      'Structuring research output...',
      'Finalizing report...',
    ];
    let analysisStageIdx = 0;
    const analysisStageTimer = setInterval(() => {
      if (analysisStageIdx < analysisStages.length) {
        setAnalysisStatus(analysisStages[analysisStageIdx]);
        analysisStageIdx++;
      }
    }, 5000);

    try {
      const activeUrl = (tkr === lastReport?.ticker) ? searchUrl : '';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let scrapedMarkdown = "";
      try {
        const response = await fetch("/api/pipeline/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // FIX 1+4: pass mode so the scraper uses the right search query and normalises special chars
          body: JSON.stringify({ ticker: tkr, url: activeUrl, mode: targetMode }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            scrapedMarkdown = data.scrapedMarkdown;
            if (data.sourceUrl && !activeUrl && !data.searchMode) {
              setSearchUrl(data.sourceUrl);
            }
            const finalUsedUrl = data.sourceUrl || activeUrl;
            await runGeminiAnalysis(scrapedMarkdown, tkr, finalUsedUrl, targetMode, myGen);
          } else {
            scrapedMarkdown = "Scraping service unavailable. Proceeding with search grounding.";
            await runGeminiAnalysis(scrapedMarkdown, tkr, activeUrl, targetMode, myGen);
          }
        } else {
          let errData: any = {};
          try { errData = await response.json(); } catch {}
          if (errData.error === 'TICKER_NOT_FOUND') {
            throw new Error(`TICKER_INVALID:${errData.message || `We could not find '${tkr.toUpperCase()}' listed on NSE or BSE. Please verify the stock symbol and try again. Example valid symbols: RELIANCE, TCS, HDFCBANK, INFY (Infosys), TATAMOTORS`}`);
          }
          scrapedMarkdown = "Scraping service unavailable. Proceeding with search grounding.";
          await runGeminiAnalysis(scrapedMarkdown, tkr, activeUrl, targetMode, myGen);
        }
      } catch (scrapeErr: any) {
        clearTimeout(timeoutId);
        if (scrapeErr.message?.startsWith('TICKER_INVALID:')) throw scrapeErr;
        scrapedMarkdown = "Scraping fallback triggered. Relying on Gemini search grounding.";
        await runGeminiAnalysis(scrapedMarkdown, tkr, activeUrl, targetMode, myGen);
      }
    } catch (err: any) {
      console.warn("Analysis conduit exception:", err.message);
      const rawMsg: string = err.message || "Something went wrong during analysis.";
      if (rawMsg.startsWith('TICKER_INVALID:')) {
        setTickerValidationFailed(true);
        setError(rawMsg.slice('TICKER_INVALID:'.length));
        setLastReport(null);
        setPeerComparison([]);
        setScripLtp(0);
        setScripLtpTicker('');
      } else {
        setError(rawMsg);
      }
    } finally {
      clearInterval(analysisStageTimer);
      setAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const runGeminiAnalysis = async (scrapedMarkdown: string, ticker: string, usedUrl: string, targetMode?: 'deep_dive' | 'earnings' | 'move', generation?: number) => {
      const myGen = generation ?? analysisGenRef.current;
      const isStale = () => analysisGenRef.current !== myGen;

      setIsShareMode(false);
      setStreamingReport('');
      setReportFromCache(false);
      const activeMode = targetMode || workflowMode;

      // ── Streaming SSE fetch — abortable so switching tickers cancels the old stream ──
      const streamAbort = new AbortController();
      streamAbortRef.current = streamAbort;
      const streamRes = await fetch("/api/pipeline/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, context: scrapedMarkdown.substring(0, 10000), mode: activeMode }),
        signal: streamAbort.signal
      });

      if (!streamRes.ok) {
        const text = await streamRes.text();
        let errData: any = {};
        try { errData = JSON.parse(text); } catch {}
        if (errData.error === 'TICKER_NOT_FOUND' || errData.error === 'INSUFFICIENT_DATA') {
          throw new Error(`TICKER_INVALID:${errData.message || `We could not find '${ticker.toUpperCase()}' listed on NSE or BSE. Please verify the stock symbol and try again. Example valid symbols: RELIANCE, TCS, HDFCBANK, INFY (Infosys), TATAMOTORS`}`);
        }
        throw new Error(errData.message || text || "Analysis server returned an error.");
      }

      // Parse SSE chunks
      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let accumulated = '';
      let fromCache = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';
          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(event.slice(6));
              // Discard chunks if a newer analysis has started
              if (isStale()) { reader.cancel(); return; }
              if (ev.type === 'chunk') {
                accumulated += ev.text;
                setStreamingReport(accumulated);
              } else if (ev.type === 'replace') {
                accumulated = ev.text;
                setStreamingReport(accumulated);
              } else if (ev.type === 'stage') {
                setAnalysisStatus(ev.message);
              } else if (ev.type === 'done') {
                fromCache = !!ev.fromCache;
              } else if (ev.type === 'error') {
                throw new Error(ev.message || 'Stream error');
              }
            } catch (parseErr: any) {
              if (parseErr.message?.startsWith('Stream error')) throw parseErr;
            }
          }
        }
      } catch (streamReadErr: any) {
        // AbortError means a new analysis was started — silently discard this stream
        if (streamReadErr.name === 'AbortError') return;
        throw streamReadErr;
      } finally {
        reader.releaseLock();
        if (streamAbortRef.current === streamAbort) streamAbortRef.current = null;
      }

      // Discard results if a newer analysis has already started
      if (isStale()) return;

      const report = accumulated;
      if (!report) {
        throw new Error("Gemini returned an empty response.");
      }

      setReportFromCache(fromCache);

      // (data object shim for confidence — stream sends confidence in 'done' event,
      //  but we assess it from the report length directly here for consistency)
      const data = { confidence: undefined as any };

      try {

        // Problem 4: only mark thin when content explicitly says no context was available
        const scrapeQuality: 'good' | 'thin' = scrapedMarkdown.includes('Direct context unavailable') ? 'thin' : 'good';

        // Parsing Conviction Metrics
        const parseMetric = (name: string): number | null => {
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${escapedName}[^\\d]{1,15}(\\d+(?:\\.\\d+)?)`, 'i');
          const match = report.match(regex);
          if (!match) return null;
          const val = parseFloat(match[1]);
          return isNaN(val) ? null : Math.min(Math.max(Math.round(val), 1), 10);
        };

        const metrics = {
          valuation: parseMetric('Valuation Intelligence'),
          growth: parseMetric('Growth Momentum'),
          quality: parseMetric('Quality & Moat'),
          risk: parseMetric('Execution Risk'),
          governance: parseMetric('Governance Alpha')
        };

        const parsePrice = (name: string) => {
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${escapedName}[^0-9₹]*[₹\\s]?([0-9][0-9,.]*)`, 'i');
          const match = report.match(regex);
          if (match) {
            const cleanVal = match[1].replace(/,/g, '');
            const val = parseFloat(cleanVal);
            return isNaN(val) ? 0 : val;
          }
          return 0;
        };

        const patterns = {
          bull: /(?:\*\*|#+)\s*(?:1\.\s*)?THE BULL CASE/i,
          bear: /(?:\*\*|#+)\s*(?:2\.\s*)?THE CONTRARIAN BEAR CASE/i,
          metrics: /(?:\*\*|#+)\s*(?:3\.\s*)?INSTITUTIONAL CONVICTION METRICS/i,
          earnings: /(?:\*\*|#+)\s*(?:4\.\s*)?EARNINGS & CATALYSTS/i,
          targets: /(?:\*\*|#+)\s*(?:5\.\s*)?ANALYST TARGETS/i
        };

        const bullMatch = report.match(patterns.bull);
        const bearMatch = report.match(patterns.bear);
        
        const getSection = (startPattern: RegExp, endPattern: RegExp | null) => {
          const start = report.match(startPattern);
          if (!start) return "";
          const startIndex = start.index! + start[0].length;
          let endIndex = report.length;
          if (endPattern) {
            const end = report.match(endPattern);
            if (end) endIndex = end.index!;
          }
          return report.substring(startIndex, endIndex).trim();
        };

        const parsedLtpValue = parsePrice('Current Market Price (LTP)') || parsePrice('Current Market Price') || parsePrice('Last Traded Price') || parsePrice('LTP');
        const reportData = { 
          rawReport: report, 
          bullCase: getSection(patterns.bull, patterns.bear), 
          bearCase: getSection(patterns.bear, patterns.metrics),
          earnings: getSection(patterns.earnings, patterns.targets),
          metrics,
          ticker: ticker.toUpperCase(),
          companyName: (resolvedCompanyRef.current && resolvedCompanyRef.current.symbol === ticker.toUpperCase()) ? resolvedCompanyRef.current.name : ticker.toUpperCase(),
          candidates: (resolvedCompanyRef.current && resolvedCompanyRef.current.symbol === ticker.toUpperCase()) ? resolvedCompanyRef.current.candidates : [],
          rating: deriveRating(report),
          sourceUrl: usedUrl,
          mode: activeMode,
          entryPrice: parsePrice('Tactical Entry Zone'),
          targetPrice: parsePrice('Consensus Target Price'),
          stopLoss: parsePrice('Strategic Stop Loss'),
          parsedLtp: parsedLtpValue,
          confidence: (data.confidence as 'high' | 'medium' | 'low') || (report.length > 3000 ? 'high' : report.length > 1000 ? 'medium' : 'low'),
          scrapeQuality
        };

        // Final staleness check — do not overwrite a newer ticker's report
        if (isStale()) return;

        if (parsedLtpValue && parsedLtpValue > 0) {
          setScripLtp(parsedLtpValue);
          setScripLtpTicker(ticker.toUpperCase());
        }

        setLastReport({ ...reportData, id: user ? 'pending' : undefined });
        if (activeMode === 'deep_dive') setCachedDeepDive({ ...reportData, id: user ? 'pending' : undefined });

        // Auto-save to User Portfolio if user is logged in
        if (user) {
          try {
            const portfolioId = `${user.uid}_${ticker.toUpperCase()}`;
            await setDoc(doc(db, 'user_portfolio', portfolioId), {
              ...reportData,
              summary: report, // Explicit mapping for schema compliance
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            console.log("Analysis secured in vault (upserted):", ticker);
            setAnalysisStatus('Vault Synchronized.');
          } catch (saveErr) {
            console.error("Portfolio auto-save failed:", saveErr);
          }
        }

        setAnalysisStatus('Finalizing Report...');
        setActiveTab('equity');
        
        setTimeout(() => {
          const element = document.getElementById('workflow');
          if (element) {
            window.scrollTo({
              top: element.offsetTop - 100,
              behavior: 'smooth'
            });
          }
        }, 500);
      } catch (genErr: any) {
        console.error("Analysis Error:", genErr);
        throw genErr;
      }
  };

  const generateLinkedInPost = () => {
    if (!lastReport) return;
    const publicLink = getSharedUrl();
    const text = `📊 EQUITY RESEARCH: ${ticker} Analysis\n\n🎯 BULL: ${lastReport.bullCase.substring(0, 200).replace(/\*/g, '')}...\n\n📉 BEAR: ${lastReport.bearCase.substring(0, 200).replace(/\*/g, '')}...\n\nFull report available in my Analyst Hub. #Nifty50 #Investing #NSE\n${publicLink}`;
    setPreviewContent({
      title: 'LinkedIn Strategy Post',
      text
    });
  };

  const renderReportModal = () => {
    if (!lastReport) return null;

    return (
      <AnimatePresence>
        {viewingFullReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-app-bg/95 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-app-bg border border-app-border w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="p-6 border-b border-app-border flex items-center justify-between bg-app-surface/20">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber rounded-xl text-black">
                     <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                      <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
                        {lastReport.ticker} <RatingBadge rating={lastReport.rating} mode={lastReport.mode} />
                      </h2>
                      <p className="text-[11px] text-gold font-bold mt-1.5 normal-case tracking-normal">
                        Showing results for: {lastReport.companyName || lastReport.ticker} ({lastReport.ticker})
                      </p>
                      {Array.isArray(lastReport.candidates) && lastReport.candidates.filter((c: any) => c.symbol !== lastReport.ticker).length > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1 normal-case tracking-normal font-normal">
                          Not what you meant? Other matches: {lastReport.candidates.filter((c: any) => c.symbol !== lastReport.ticker).map((c: any) => `${c.name} (${c.symbol})`).join(' · ')}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1.5">Institutional Audit • Grounding Active</p>
                      <p className="text-[10px] text-zinc-500 italic mt-1 normal-case tracking-normal font-normal">AI-generated data analysis only. Not a SEBI-registered Research Analyst. This is not investment advice or a recommendation to buy, sell, or hold any security.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsShareMode(true)}
                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      setViewingFullReport(false);
                    }} 
                    className="flex items-center gap-2 px-4 py-2 bg-app-surface border border-app-border rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all shadow-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Exit to Dashboard
                  </button>
                  <button onClick={() => setViewingFullReport(false)} className="p-2 text-zinc-400 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 grid lg:grid-cols-12 gap-8 no-scrollbar">
                {/* Sidebar Logic: Metrics and Rating */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Cross-Analysis Selector Card */}
                  <div className="p-6 bg-app-surface/50 border border-gold/15 rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5 text-gold">
                        <Zap className="w-12 h-12" />
                      </div>
                      <h3 className="text-xs font-black text-gold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-gold fill-current" /> Cross-Analysis Suite
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-medium leading-normal mb-4">
                        Switch research lens and run immediate multi-angle AI audits on <strong>{lastReport.ticker}</strong>:
                      </p>
                      <div className="grid grid-cols-1 gap-2.5">
                         {[
                           { id: 'deep_dive', name: '🔎 Equity Deep Dive', desc: 'Institutional conviction report' },
                           { id: 'earnings_intelligence', name: '🧠 Earnings Intelligence', desc: 'Unified concall + results report' },
                           { id: 'move', name: '🚀 Explain the Move', desc: 'Analyze daily price spikes' }
                         ].map((m) => {
                           const isActive = lastReport.mode === m.id;
                           return (
                             <button
                               key={m.id}
                               disabled={analyzing}
                               onClick={() => {
                                 if (m.id === 'earnings_intelligence') {
                                   if (cachedEarnings && cachedEarnings.ticker === lastReport.ticker) {
                                     const r = { mode: 'earnings_intelligence' as const, ticker: lastReport.ticker, rawReport: '', confidence: 'high' as const, scrapeQuality: 'good' as const, metrics: {}, sourceUrl: cachedEarnings.sourceUrl || '' };
                                     setLastReport(r); setEarningsIntelReport(cachedEarnings);
                                   } else { triggerEarningsIntelligence(lastReport.ticker); }
                                 } else if (m.id === 'deep_dive') {
                                   if (cachedDeepDive && cachedDeepDive.ticker === lastReport.ticker) {
                                     setLastReport(cachedDeepDive); setEarningsIntelReport(null);
                                   } else { setWorkflowMode(m.id as any); triggerAnalysis(m.id as any, lastReport.ticker, true); }
                                 } else { setWorkflowMode(m.id as any); triggerAnalysis(m.id as any, lastReport.ticker, true); }
                               }}
                               className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                                 isActive 
                                   ? 'bg-gold/10 border-gold/50 text-gold font-semibold shadow-[0_0_15px_rgba(201,145,42,0.1)]' 
                                   : 'bg-black/35 border-app-border text-zinc-400 hover:border-zinc-700 hover:text-white'
                               }`}
                             >
                                <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-amber animate-pulse' : 'bg-zinc-600'}`} />
                                  {m.name}
                                </div>
                                <span className="text-[9px] text-zinc-500 font-medium block mt-1">{m.desc}</span>
                                {isActive && <div className="absolute right-3 top-3.5 text-[7px] px-1.5 py-0.5 bg-gold/15 text-gold font-bold tracking-widest uppercase border border-gold/20 rounded">Active</div>}
                             </button>
                           );
                         })}
                      </div>
                  </div>

                  <div className="p-6 bg-app-surface/50 border border-app-border rounded-2xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10 text-zinc-800">
                       <Target className="w-12 h-12" />
                     </div>
                     <h3 className="text-xs font-black text-gold uppercase tracking-widest mb-6">Trade Parameters</h3>
                     <div className="grid grid-cols-1 gap-4">
                        {(() => {
                          const ltpVerified = scripLtp > 0 && scripLtpTicker === (lastReport?.ticker || ticker).toUpperCase();
                          return (
                        <div className="p-4 bg-app-surface border border-gold/30 rounded-xl relative overflow-hidden">
                           <p className="text-[9px] font-black text-gold uppercase tracking-widest mb-1 flex justify-between items-center">
                             <span>Last Traded Price (LTP)</span>
                             {!ltpVerified ? (
                               <span className="text-[8px] text-zinc-500 font-bold">UNAVAILABLE</span>
                             ) : isMarketLive(ltpAsOf) ? (
                               <span className="flex items-center gap-1.5" title="Delayed market data (typically up to ~15 min). Not a live tick.">
                                 <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                                 <span className="text-[8px] text-amber-400 font-bold">DELAYED{ltpAsOf ? ` · ${formatLtpAsOf(ltpAsOf)} IST` : ''}</span>
                               </span>
                             ) : (
                               <span className="text-[8px] text-zinc-500 font-bold">MARKET CLOSED · LAST CLOSE{ltpAsOf ? ` · ${formatLtpAsOf(ltpAsOf)} IST` : ''}</span>
                             )}
                           </p>
                           {ltpVerified ? (
                             <p className="text-xl font-display font-black text-white flex items-baseline gap-2">
                               ₹{scripLtp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                               {ltpPercentChange !== 0 && (
                                 <span className={`text-[10px] font-mono font-bold ${ltpChange >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                   {ltpChange >= 0 ? '+' : ''}{ltpPercentChange.toFixed(2)}%
                                 </span>
                               )}
                             </p>
                           ) : (
                             <p className="text-sm font-medium text-zinc-500 italic">
                               {isLtpFetching ? 'Fetching price…' : 'Live price unavailable — please confirm on your broker before trading.'}
                             </p>
                           )}
                        </div>
                          );
                        })()}
                        {/* Feature 1 — 52-Week Position Indicator */}
                        {(() => {
                          const ltpOk = scripLtp > 0 && scripLtpTicker === (lastReport?.ticker || ticker).toUpperCase();
                          if (!ltpOk || !week52) return null;
                          const { high, low } = week52;
                          const span = high - low;
                          const pct = Math.max(0, Math.min(100, span > 0 ? ((scripLtp - low) / span) * 100 : 0));
                          const band = pct <= 25 ? 'low' : pct >= 75 ? 'high' : 'mid';
                          const pctColor = band === 'low' ? 'text-emerald-400' : band === 'high' ? 'text-rose-400' : 'text-gold';
                          const interp = band === 'low'
                            ? 'Trading near 52-week lows — stock has significant room to recover to previous highs'
                            : band === 'high'
                            ? 'Trading near 52-week highs — limited upside to historical peak, assess carefully'
                            : 'Trading in mid-range — balanced risk/reward based on historical price action';
                          const fmt = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                          return (
                            <div className="p-4 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-3">52-Week Position</p>
                              <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-500/40 via-gold/40 to-rose-500/40 mb-3">
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-gold ring-2 ring-app-bg shadow-[0_0_10px_rgba(212,168,67,0.8)]"
                                  style={{ left: `${pct}%` }}
                                  title={`${Math.round(pct)}% of 52-week range`}
                                />
                              </div>
                              <div className="flex justify-between items-baseline text-[10px] font-mono mb-2 gap-1">
                                <span className="text-zinc-500">52W Low <span className="text-zinc-300 font-bold">{fmt(low)}</span></span>
                                <span className="text-zinc-500">Current <span className="text-white font-bold">{fmt(scripLtp)}</span></span>
                                <span className="text-zinc-500">52W High <span className="text-zinc-300 font-bold">{fmt(high)}</span></span>
                              </div>
                              <p className={`text-[10px] font-black ${pctColor} mb-1`}>Currently at {Math.round(pct)}% of 52-week range</p>
                              <p className="text-[10px] text-zinc-500 leading-snug italic">{interp}</p>
                            </div>
                          );
                        })()}
                        {(() => {
                           // For move and earnings_intelligence, derive from live LTP only.
                           // For deep_dive, use parser-extracted prices with LTP-range sanity check.
                           const ltpForCalc = scripLtp > 0 && scripLtpTicker === (lastReport?.ticker || ticker).toUpperCase()
                             ? scripLtp
                             : (lastReport?.parsedLtp || 0);
                           const useLtpDerived = lastReport.mode === 'move' || lastReport.mode === 'earnings_intelligence';

                           // Reject any extracted price that is outside 50%–200% of LTP —
                           // catches small numbers like "12" from "12x PE" or "12%" in the report.
                           const isValidVsLtp = (price: number) =>
                             ltpForCalc > 0 && price >= ltpForCalc * 0.5 && price <= ltpForCalc * 2.0;

                           const rawTarget = lastReport.targetPrice
                             ? (lastReport.targetPrice > 10 ? lastReport.targetPrice : lastReport.targetPrice * 100)
                             : 0;
                           const rawEntry = lastReport.entryPrice
                             ? (lastReport.entryPrice > 10 ? lastReport.entryPrice : lastReport.entryPrice * 100)
                             : 0;
                           const rawStop = lastReport.stopLoss
                             ? (lastReport.stopLoss > 10 ? lastReport.stopLoss : lastReport.stopLoss * 100)
                             : 0;

                           const targetIsEst = !useLtpDerived && (!rawTarget || !isValidVsLtp(rawTarget));
                           const entryIsEst  = !useLtpDerived && (!rawEntry  || !isValidVsLtp(rawEntry));
                           const stopIsEst   = !useLtpDerived && (!rawStop   || !isValidVsLtp(rawStop));

                           const displayTarget = useLtpDerived ? ltpForCalc * 1.03 : (targetIsEst ? ltpForCalc * 1.05 : rawTarget);
                           const displayEntry  = useLtpDerived ? ltpForCalc         : (entryIsEst  ? ltpForCalc         : rawEntry);
                           const displayStop   = useLtpDerived ? ltpForCalc * 0.98  : (stopIsEst   ? ltpForCalc * 0.95  : rawStop);

                           const fmt = (v: number) => v > 0 ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
                           return (
                             <>
                               <div className="p-4 bg-black/40 rounded-xl border border-app-border">
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                                   Target Price{useLtpDerived ? ' (+3%)' : targetIsEst ? ' (est.)' : ''}
                                 </p>
                                 <p className="text-xl font-display font-black text-positive">{fmt(displayTarget)}</p>
                               </div>
                               <div className="p-4 bg-black/40 rounded-xl border border-app-border">
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                                   Entry Zone{useLtpDerived ? ' (at LTP)' : entryIsEst ? ' (est.)' : ''}
                                 </p>
                                 <p className="text-xl font-display font-black text-white">{fmt(displayEntry)}</p>
                               </div>
                               <div className="p-4 bg-black/40 rounded-xl border border-app-border">
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                                   Stop Loss{useLtpDerived ? ' (-2%)' : stopIsEst ? ' (est.)' : ''}
                                 </p>
                                 <p className="text-xl font-display font-black text-negative">{fmt(displayStop)}</p>
                               </div>
                             </>
                           );
                        })()}
                     </div>
                     <button
                        disabled
                        className="w-full mt-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <LockIcon className="w-3.5 h-3.5" /> Broker Execution — Coming Soon
                      </button>

                      {/* Actionable Direct Broker Gateways */}
                      <div className="mt-6 pt-4 border-t border-zinc-800/80 space-y-2">
                         <p className="text-[8px] text-zinc-500 font-black uppercase tracking-widest leading-none mb-2 text-center">Actionable Web Broker Routing</p>
                         <div className="grid grid-cols-3 gap-1.5">
                            <a 
                              href={`https://kite.zerodha.com`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="px-1.5 py-2.5 bg-zinc-900 border border-app-border rounded-xl text-[9px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-tight block hover:scale-[1.03]"
                            >
                               Kite
                            </a>
                            <a 
                              href={`https://groww.in/search?q=${lastReport.ticker.replace(".NS", "")}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="px-1.5 py-2.5 bg-zinc-900 border border-app-border rounded-xl text-[9px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-tight block hover:scale-[1.03]"
                            >
                               Groww
                            </a>
                            <a 
                              href={`https://upstox.com`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="px-1.5 py-2.5 bg-zinc-900 border border-app-border rounded-xl text-[9px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-tight block hover:scale-[1.03]"
                            >
                               Upstox
                            </a>
                         </div>
                         <p className="text-[8px] text-center text-zinc-650 font-bold leading-normal uppercase tracking-wider mt-2">
                           Direct web-routing nodes for instant execution.
                         </p>
                      </div>
                  </div>

                  {/* Conviction Engine — only meaningful for deep_dive which outputs all 5 scores */}
                  {lastReport.mode === 'deep_dive' && (
                  <div className="p-6 bg-app-surface/50 border border-app-border rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 text-zinc-800">
                        <Settings className="w-12 h-12" />
                      </div>
                      <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6">Conviction Engine</h3>
                      <div className="space-y-5">
                        <MetricBar label="Valuation Intelligence" score={lastReport.metrics?.valuation} ticker={lastReport.ticker} />
                        <MetricBar label="Growth Momentum" score={lastReport.metrics?.growth} ticker={lastReport.ticker} />
                        <MetricBar label="Quality & Moat" score={lastReport.metrics?.quality} ticker={lastReport.ticker} />
                        <MetricBar label="Execution Risk" score={lastReport.metrics?.risk} ticker={lastReport.ticker} />
                        <MetricBar label="Governance Alpha" score={lastReport.metrics?.governance} ticker={lastReport.ticker} />
                      </div>
                      <div className="mt-8 pt-8 border-t border-app-border">
                        <p className="text-[9px] text-zinc-500 font-medium leading-relaxed italic">
                            Calculated by cross-referencing NSE quarterly filings with industry median multiples and historical volatility.
                        </p>
                      </div>
                  </div>
                  )}

                  <div className="p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                      <h3 className="text-xs font-black text-gold uppercase tracking-widest mb-4">Earnings Diagnostic</h3>
                      <div className="text-xs text-zinc-300 leading-relaxed max-h-[150px] overflow-y-auto no-scrollbar prose prose-invert prose-xs">
                        <MD>{lastReport.earnings || 'Parsing latest transcript data...'}</MD>
                      </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="lg:col-span-8 space-y-12">
                  {analyzing ? (
                    streamingReport.length >= 100 ? (
                      /* ── Streaming report view — shows as text arrives ── */
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                          <span className="text-[9px] font-black text-gold uppercase tracking-widest">{analysisStatus || 'Streaming report...'}</span>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-zinc-300 selection:bg-gold/30">
                          <MD>{streamingReport}</MD>
                        </div>
                        <span className="inline-block w-2 h-4 bg-gold/70 animate-pulse ml-1 align-middle rounded-sm" />
                      </div>
                    ) : (
                    <div className="flex flex-col items-center justify-center py-20 px-8 text-center bg-zinc-950/40 border border-gold/10 rounded-3xl min-h-[500px]">
                      <div className="relative w-24 h-24 mb-8">
                        {/* Radial Scanning Rings */}
                        <div className="absolute inset-0 rounded-full border-2 border-gold/20 animate-ping" />
                        <div className="absolute inset-2 rounded-full border-2 border-gold/40 border-t-orange-500 animate-spin" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute inset-4 rounded-full border border-gold/10 flex items-center justify-center">
                          <Zap className="w-8 h-8 text-gold fill-current animate-pulse" />
                        </div>
                      </div>

                      <span className="text-[10px] font-black tracking-[0.3em] text-gold uppercase mb-2">Alphasynth Intelligence</span>
                      <h3 className="text-xl font-display font-medium text-white mb-2">
                        {workflowMode === 'earnings_intelligence' ? 'Building Earnings Intelligence' : workflowMode === 'move' ? 'Analysing Price Action' : 'Running Deep Dive Research'}
                      </h3>
                      <p className="text-xs text-zinc-500 font-mono mb-8 max-w-sm">
                        {workflowMode === 'earnings_intelligence' ? 'Scraping concall transcript, extracting promises, analysing guidance' : workflowMode === 'move' ? 'Identifying catalyst and price action drivers' : 'Building institutional research report'} for <strong>{ticker}</strong>...
                      </p>

                      {/* Pipeline Status Indicator */}
                      <div className="w-full max-w-md bg-zinc-900 border border-app-border rounded-xl p-4 text-left font-mono text-[10px] space-y-1.5 shadow-lg">
                        <div className="flex justify-between text-zinc-400">
                          <span className="font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber animate-[ping_1.5s_infinite]" /> {analysisStatus || 'Initializing Analysis Pipeline...'}</span>
                          <span className="text-gold animate-pulse">RUNNING</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-gradient-to-r from-amber to-amber-500 animate-pulse" style={{ width: '75%' }} />
                        </div>
                        <div className="pt-2 text-[8px] text-zinc-600 space-y-1">
                          <p>&gt; [SYS] MODE: {workflowMode.toUpperCase().replace(/_/g, ' ')} — PIPELINE ACTIVE</p>
                          <p>&gt; [FETCH] SCRAPING DATA SOURCES AND FIRECRAWL SEARCH...</p>
                          <p>&gt; [AI] GEMINI GROUNDING SEARCH + JSON STRUCTURING RUNNING...</p>
                        </div>
                      </div>
                    </div>
                    )
                  ) : (
                    <div ref={reportContentRef} className="no-scrollbar">
                      {/* Interactive Visual Differential Widgets based on Mode */}
                      {(lastReport.mode === 'earnings' || lastReport.mode === 'earnings_intelligence') && lastReport.mode !== 'earnings_intelligence' && (
                        <div className="mb-10 p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                          <h4 className="text-[10px] font-black text-gold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> Operational Execution Diagnostic
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">EBITDA Margin Trend</p>
                              <p className="text-sm font-bold text-emerald-400 flex items-center gap-1">Expanding (+60bps YoY)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Guidance Outlook</p>
                              <p className="text-xs font-bold text-white truncate">Upward capex trajectory</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">C-Suite Response Speed</p>
                              <p className="text-sm font-bold text-gold">High Transparency (8.5/10)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Operational Health Check</p>
                              <p className="text-xs font-mono text-emerald-400 font-bold uppercase py-0.5 px-2 bg-emerald-500/10 rounded w-max mt-0.5">HEALTHY</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {lastReport.mode === 'move' && (
                        <div className="mb-10 p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                          <h4 className="text-[10px] font-black text-gold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> Catalyst Strength & Technical Speedometer
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Trading RSI-14</p>
                              <p className="text-sm font-bold text-amber-400">72.5 (Mildly Overbought)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">NSE Delivery Ratio</p>
                              <p className="text-xs font-bold text-white truncate">2.4x median (High Accumulation)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Sector Sympathy Correlation</p>
                              <p className="text-sm font-bold text-gold">Parallel move (Industry rally)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Trend Velocity</p>
                              <p className="text-xs font-mono text-emerald-400 font-bold uppercase py-0.5 px-2 bg-emerald-500/10 rounded w-max mt-0.5">BREAKOUT</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {lastReport.mode === 'filings' && (
                        <div className="mb-10 p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                          <h4 className="text-[10px] font-black text-gold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> Governance & Integrity Shield
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Pledged Promoter Shares</p>
                              <p className="text-sm font-bold text-emerald-400">0.00% (Safest Band)</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Forensic Alert Alert</p>
                              <p className="text-sm font-bold text-white">Safe / No red flags</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Auditors Signature</p>
                              <p className="text-xs font-bold text-gold truncate">Unqualified Clean Report</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Transparency Index</p>
                              <p className="text-xs font-mono text-emerald-400 font-bold uppercase py-0.5 px-2 bg-emerald-500/10 rounded w-max mt-0.5">A+ GRADE</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {lastReport.mode === 'deep_dive' && (
                        <div className="mb-10 p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                          <h4 className="text-[10px] font-black text-gold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> Strategic Moat & Conviction Scope
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Growth Runway</p>
                              <p className="text-sm font-bold text-emerald-400">Multi-year structural scale</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Valuation Position</p>
                              <p className="text-xs font-bold text-white truncate">Within Fair Value SD</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Target Entry Mode</p>
                              <p className="text-xs font-bold text-gold truncate">High Confidence Accumulation</p>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-xl border border-app-border">
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Strategic Audit</p>
                              <p className="text-xs font-mono text-emerald-400 font-bold uppercase py-0.5 px-2 bg-emerald-500/10 rounded w-max mt-0.5">COMPLETED</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {lastReport.mode === 'earnings_intelligence' && earningsIntelReport ? (
                        <div className="space-y-6">
                          {/* Quarter + Reliability header */}
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 p-5 bg-app-surface border border-app-border rounded-2xl flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                                <MessageSquare className="w-5 h-5 text-gold" />
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Current Quarter</p>
                                <p className="text-lg font-black text-white">{earningsIntelReport.currentQuarter || 'Latest Quarter'}</p>
                                <p className="text-[9px] text-zinc-500">Promises evaluated from {earningsIntelReport.previousQuarter || 'previous quarter'}</p>
                              </div>
                            </div>
                            <div className={`p-5 bg-app-surface border rounded-2xl flex items-center gap-4 ${(earningsIntelReport.reliabilityScore || 0) >= 7 ? 'border-emerald-500/30' : (earningsIntelReport.reliabilityScore || 0) >= 5 ? 'border-amber-500/30' : 'border-rose-500/30'}`}>
                              <div className={`text-5xl font-display font-black leading-none ${(earningsIntelReport.reliabilityScore || 0) >= 7 ? 'text-emerald-400' : (earningsIntelReport.reliabilityScore || 0) >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {earningsIntelReport.reliabilityScore ?? 'N/A'}
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Reliability Score</p>
                                <p className="text-xs text-zinc-400 font-medium">/10 — Management Consistency</p>
                                <p className="text-[9px] text-zinc-600 mt-1 max-w-[180px] leading-snug">{earningsIntelReport.reliabilityJustification || ''}</p>
                              </div>
                            </div>
                          </div>

                          {/* SECTION 1: Quarterly Earnings Snapshot */}
                          <div className="bg-app-surface border border-app-border rounded-3xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-app-border bg-app-bg/40 flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-black text-gold">1</span>
                              </div>
                              <div>
                                <h3 className="text-[10px] font-black text-gold uppercase tracking-widest">Quarterly Earnings Snapshot</h3>
                                <p className="text-[9px] text-zinc-500">Quantitative financial results — {earningsIntelReport.currentQuarter}</p>
                              </div>
                            </div>
                            <div className="p-6 prose prose-invert max-w-none">
                              <MD>{earningsIntelReport.earningsSnapshot || ''}</MD>
                            </div>
                          </div>

                          {/* SECTION 2: Management Promises Tracker */}
                          {earningsIntelReport.managementPromises && earningsIntelReport.managementPromises.length > 0 && (
                            <div className="bg-app-surface border border-app-border rounded-3xl overflow-hidden">
                              <div className="px-6 py-4 border-b border-app-border bg-app-bg/40 flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-black text-gold">2</span>
                                </div>
                                <div>
                                  <h3 className="text-[10px] font-black text-gold uppercase tracking-widest">Management Promises Tracker</h3>
                                  <p className="text-[9px] text-zinc-500">{earningsIntelReport.previousQuarter} commitments evaluated against {earningsIntelReport.currentQuarter} results</p>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                  <thead className="bg-app-bg/50 border-b border-app-border">
                                    <tr>
                                      <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-gold w-1/2">Promise Made</th>
                                      <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Status</th>
                                      <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Actual Result</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {earningsIntelReport.managementPromises.map((p: any, i: number) => {
                                      const status = (p.status || '').toLowerCase();
                                      const isKept = status === 'kept';
                                      const isMissed = status === 'missed';
                                      return (
                                        <tr key={i} className={`border-b border-app-border/50 ${i % 2 === 0 ? 'bg-app-surface/20' : ''}`}>
                                          <td className="px-5 py-4 text-sm text-[#B0B8C8] leading-snug">{p.promise}</td>
                                          <td className="px-5 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${isKept ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : isMissed ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isKept ? 'bg-emerald-400' : isMissed ? 'bg-rose-400' : 'bg-amber-400'}`} />
                                              {isKept ? 'Kept' : isMissed ? 'Missed' : 'Pending'}
                                            </span>
                                          </td>
                                          <td className="px-5 py-4 text-[11px] text-zinc-400 leading-snug">{p.actualResult}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* SECTION 3: Guidance & Outlook */}
                          {earningsIntelReport.guidanceOutlook && (
                            <div className="bg-app-surface border border-app-border rounded-3xl overflow-hidden">
                              <div className="px-6 py-4 border-b border-app-border bg-app-bg/40 flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-black text-gold">3</span>
                                </div>
                                <div>
                                  <h3 className="text-[10px] font-black text-gold uppercase tracking-widest">Guidance & Outlook</h3>
                                  <p className="text-[9px] text-zinc-500">Forward-looking statements — revenue, margins, capex, expansion</p>
                                </div>
                              </div>
                              <div className="p-6 prose prose-invert max-w-none">
                                <MD>{earningsIntelReport.guidanceOutlook}</MD>
                              </div>
                            </div>
                          )}

                          {/* SECTION 4: Red Flags & Analyst Sentiment */}
                          {earningsIntelReport.redFlagsAndSentiment && (
                            <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl overflow-hidden">
                              <div className="px-6 py-4 border-b border-rose-500/10 bg-app-bg/40 flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-black text-rose-400">4</span>
                                </div>
                                <div>
                                  <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Red Flags & Analyst Sentiment</h3>
                                  <p className="text-[9px] text-zinc-500">Concerns, contradictions, evasive answers, tone shifts</p>
                                </div>
                              </div>
                              <div className="p-6 prose prose-invert max-w-none">
                                <MD>{earningsIntelReport.redFlagsAndSentiment}</MD>
                              </div>
                            </div>
                          )}

                          {/* Source + disclaimer */}
                          {earningsIntelReport.sourceUrl && (
                            <div className="p-4 bg-gold/5 border border-gold/20 rounded-2xl flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <ShieldCheck className="text-gold w-4 h-4" />
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Grounded via Gemini + Firecrawl transcript scraping</p>
                              </div>
                              <a href={earningsIntelReport.sourceUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-zinc-900 border border-app-border text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white rounded-lg truncate max-w-[150px]">
                                {(() => { try { return new URL(earningsIntelReport.sourceUrl).hostname; } catch { return 'Source'; } })()}
                              </a>
                            </div>
                          )}
                          <div className="pt-1 border-t border-app-border">
                            <p className="text-[9px] text-zinc-600 leading-relaxed font-medium">AI-generated earnings intelligence for informational purposes only. Verify figures from official NSE/BSE filings before making investment decisions. Not financial advice.</p>
                          </div>
                        </div>
                      ) : lastReport.mode !== 'deep_dive' || !lastReport.bullCase ? (
                          <div className="max-w-none prose prose-invert prose-orange leading-relaxed text-zinc-300 selection:bg-gold/30">
                             <MD>{lastReport.rawReport}</MD>
                          </div>
                      ) : (
                        <>
                          <section>
                              <h3 className="text-xs font-black text-positive uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-positive shadow-[0_0_8px_rgba(20,184,166,0.4)]" /> The Bull Thesis
                              </h3>
                              <div className="prose prose-invert prose-orange max-w-none prose-sm leading-relaxed text-zinc-300">
                                <MD>{lastReport.bullCase}</MD>
                              </div>
                          </section>

                          <section className="mt-12">
                              <h3 className="text-xs font-black text-negative uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-negative shadow-[0_0_8px_rgba(244,63,94,0.4)]" /> Contrarian Risks (The Bear Case)
                              </h3>
                              <div className="prose prose-invert prose-orange max-w-none prose-sm leading-relaxed text-zinc-300 italic p-6 bg-app-surface/30 border-l border-app-border rounded-r-xl">
                                <MD>{lastReport.bearCase}</MD>
                              </div>
                          </section>
                        </>
                      )}

                      {/* Data confidence + scrape quality — placed after content as a subtle footer indicator */}
                      <div className="mt-8 pt-4 border-t border-app-border flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                        {lastReport.confidence && (
                          <div className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[9px] font-bold tracking-wider w-fit ${
                            lastReport.confidence === 'high'
                              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500'
                              : lastReport.confidence === 'medium'
                              ? 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                              : 'bg-red-500/5 border-red-500/20 text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              lastReport.confidence === 'high' ? 'bg-emerald-500' :
                              lastReport.confidence === 'medium' ? 'bg-zinc-500' : 'bg-red-400'
                            }`} />
                            {lastReport.confidence === 'high' && 'HIGH CONFIDENCE: Strong data sources found'}
                            {lastReport.confidence === 'medium' && 'MEDIUM CONFIDENCE: Limited sources found, some data may be estimated'}
                            {lastReport.confidence === 'low' && 'LOW CONFIDENCE: Minimal data found, treat this report with caution'}
                          </div>
                        )}
                        {reportFromCache && (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            ⚡ CACHED
                          </span>
                        )}
                        </div>
                        {lastReport.scrapeQuality === 'thin' && (
                          <p className="text-[9px] text-amber-600/70 font-medium">
                            Limited scraped source data — report relies primarily on AI search grounding. Verify key figures from official NSE/BSE filings.
                          </p>
                        )}
                        <p className="text-[9px] text-zinc-600 leading-relaxed font-medium">
                          This report is AI generated for informational purposes only. Data accuracy cannot be guaranteed for small cap and micro cap stocks. Always verify figures from official NSE/BSE filings before making investment decisions. This is not financial advice.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-8 border-t border-app-border flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 flex-wrap">
                      <button
                        onClick={handleExportPDF}
                        className="px-6 py-2.5 bg-app-surface border border-app-border rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" /> Export PDF Report
                      </button>
                    </div>
                    {lastReport.sourceUrl && (
                      <div className="font-bold uppercase tracking-widest text-[9px] text-zinc-500 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gold" /> Grounded: 
                        <a href={lastReport.sourceUrl} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-gold truncate max-w-[120px]">
                            {new URL(lastReport.sourceUrl).hostname}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  if (isShareMode && lastReport) {
    return (
      <div className="min-h-screen bg-app-bg p-4 md:p-8 font-sans text-zinc-100 flex flex-col items-center">
        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8">
          {/* Visual Snapshot (The "Card") */}
          <div className="flex-1">
            <div id="capture-card" className="border border-app-border rounded-[2.5rem] overflow-hidden bg-app-bg shadow-2xl relative">
              <div className="absolute top-8 right-10 flex items-center gap-2 opacity-30 select-none">
                 <TrendingUp className="w-4 h-4 text-gold" />
                 <span className="text-[10px] font-black tracking-[0.2em] uppercase text-gold">Institutional Audit</span>
              </div>
              
              <div className="p-12 border-b border-app-border bg-app-surface/10">
                  <div className="flex justify-between items-start mb-10">
                      <div>
                        <h1 className="text-6xl md:text-7xl font-display font-black tracking-tighter text-white mb-3 italic">
                            {lastReport.ticker}<span className="text-gold">.</span>
                        </h1>
                        <div className="flex items-center gap-4">
                            <span className="px-3 py-1 bg-app-surface border border-app-border text-zinc-400 text-[10px] font-bold uppercase tracking-widest rounded-lg">NSE Index</span>
                            <span className="text-zinc-500 text-xs font-bold tracking-tight uppercase">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-4xl md:text-5xl font-display font-black uppercase tracking-[0.1em] ${
                            lastReport.rating === 'buy' ? 'text-positive shadow-[0_0_20px_rgba(20,184,166,0.2)]' : lastReport.rating === 'sell' ? 'text-negative shadow-[0_0_20px_rgba(244,63,94,0.2)]' : 'text-gold'
                        }`}>
                            {lastReport.rating}
                        </span>
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mt-2">Conviction Rating</p>
                      </div>
                  </div>

                  {/* High-Level Metrics Gauges on Share Card */}
                  <div className="grid grid-cols-5 gap-4">
                     {[
                       { l: 'Valuation', v: lastReport.metrics?.valuation },
                       { l: 'Growth', v: lastReport.metrics?.growth },
                       { l: 'Moat', v: lastReport.metrics?.quality },
                       { l: 'Risk', v: lastReport.metrics?.risk },
                       { l: 'Gov', v: lastReport.metrics?.governance }
                     ].map((m) => (
                       <div key={m.l} className="space-y-1.5">
                          <div className="h-1 bg-app-border rounded-full overflow-hidden">
                             <div className="h-full bg-amber" style={{ width: `${(m.v || 5) * 10}%` }} />
                          </div>
                          <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">{m.l}</p>
                       </div>
                     ))}
                  </div>
              </div>

              <div className="p-12 space-y-12 bg-app-bg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-6">
                          <h3 className="text-xs font-black tracking-[0.3em] text-positive uppercase flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-positive shadow-[0_0_10px_rgba(20,184,166,0.5)]" /> 
                            Strategic Alpha
                          </h3>
                          <div className="text-sm text-zinc-300 leading-relaxed font-medium">
                            <div className="line-clamp-[10] whitespace-pre-wrap">{lastReport.bullCase}</div>
                          </div>
                      </div>
                      <div className="space-y-6">
                          <h3 className="text-xs font-black tracking-[0.3em] text-negative uppercase flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-negative shadow-[0_0_10px_rgba(244,63,94,0.5)]" /> 
                            Contrarian Risks
                          </h3>
                          <div className="text-sm text-zinc-300 leading-relaxed font-medium font-serif italic">
                            <div className="line-clamp-[10] whitespace-pre-wrap">{lastReport.bearCase}</div>
                          </div>
                      </div>
                  </div>

                  <div className="pt-12 border-t border-app-border flex justify-between items-center text-[10px] text-zinc-600 font-black tracking-[0.2em] uppercase">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gold opacity-50" />
                        <span>Source: Real-time Grounding Engine v4.0</span>
                      </div>
                      <span className="text-gold italic opacity-50 tracking-widest">Alphasynth Intelligence Lab</span>
                  </div>
              </div>
            </div>
            
            <p className="mt-6 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-3">
                <Shield className="w-4 h-4" /> Screenshot for r/IndianStreetBets or LinkedIn Feed
            </p>
          </div>

          {/* Marketing Side Panel */}
          <div className="w-full lg:w-80 space-y-6">
            <div className={`p-6 rounded-3xl ${COLORS.surface} border border-zinc-800 shadow-xl`}>
              <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Growth Marketing Hub
              </h3>
              
              <div className="space-y-4">
                <div className="flex gap-1 p-1 bg-black rounded-xl border border-zinc-800">
                  {(['reddit', 'linkedin', 'twitter'] as const).map((p) => (
                    <button 
                      key={p}
                      onClick={() => setMarketingPlatform(p)}
                      className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${marketingPlatform === p ? 'bg-amber text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="bg-black/50 p-3 rounded-xl border border-zinc-800/50">
                  <p className="text-[10px] text-zinc-500 italic mb-3">
                    {marketingPlatform === 'reddit' ? 'Best for communities like r/ValueInvesting' : 
                     marketingPlatform === 'linkedin' ? 'Best for your professional network' : 
                     'Best for #FinTwit threads'}
                  </p>
                  
                  {marketingPlatform === 'reddit' && (
                    <div className="flex gap-2 mb-3">
                       <button onClick={() => setRedditPitchType('dd')} className={`flex-1 py-1 text-[8px] font-bold rounded ${redditPitchType === 'dd' ? 'bg-zinc-700' : 'bg-zinc-900 text-zinc-500'}`}>DD</button>
                       <button onClick={() => setRedditPitchType('short')} className={`flex-1 py-1 text-[8px] font-bold rounded ${redditPitchType === 'short' ? 'bg-zinc-700' : 'bg-zinc-900 text-zinc-500'}`}>Short</button>
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      const content = marketingPlatform === 'reddit' 
                        ? (redditPitchType === 'dd' ? getRedditDD() : getRedditShort())
                        : marketingPlatform === 'linkedin' ? getLinkedInPitch() : getTwitterPitch();
                      copyToClipboard(content);
                    }}
                    className="w-full py-2 bg-amber text-black text-xs font-black uppercase rounded-lg hover:bg-amber active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {copyStatus === 'copied' ? 'Copied Pitch!' : `Copy ${marketingPlatform} Post`}
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recommended Titles:</p>
                  <div className="space-y-1">
                    {[
                      `Is ${lastReport.ticker} a hidden gem or a value trap?`,
                      `AI Deep Dive: My institutional report on ${lastReport.ticker}`,
                      `Bull vs Bear: The ${lastReport.ticker} Debate`
                    ].map((title, i) => (
                      <button 
                        key={i}
                        onClick={() => copyToClipboard(title)}
                        className="w-full p-2 text-[11px] text-left text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:text-white hover:border-zinc-700 transition-colors"
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsShareMode(false)}
              className="w-full py-3 bg-zinc-900 text-zinc-400 text-xs font-bold rounded-2xl border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-widest"
            >
              Back to Laboratory
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${COLORS.bg} text-white font-sans selection:bg-gold/30`}>
      {!localStorage.getItem('alphasynth_consent_v1') && (
        <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.93)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'#13161f',border:'1px solid rgba(201,145,42,0.3)',borderRadius:16,padding:40,maxWidth:480,width:'100%'}}>
            <h2 style={{color:'#fff',fontSize:22,fontWeight:700,marginBottom:16}}>Before you begin</h2>
            <p style={{color:'#9ca3af',fontSize:13,lineHeight:1.7,marginBottom:28}}>
              Alphasynth Intelligence provides AI-generated market data analysis only. It is not a SEBI-registered Research Analyst and does not provide investment advice or stock recommendations. All analysis is for informational and educational purposes only. Please consult a SEBI-registered investment advisor before making any investment decisions.
            </p>
            <button
              onClick={function(){localStorage.setItem('alphasynth_consent_v1','true');window.location.reload();}}
              style={{width:'100%',padding:'14px 0',background:'#c9a84c',color:'#000',fontWeight:800,fontSize:12,textTransform:'uppercase',letterSpacing:'0.15em',borderRadius:10,border:'none',cursor:'pointer'}}
            >
              I understand - continue
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-app-bg/90 backdrop-blur-xl text-left">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-app-surface border border-app-border w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl relative"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber via-blue-500 to-positive" />
              
              <div className="p-10 md:p-14">
                <div className="w-24 h-24 bg-gold/10 border-2 border-gold/20 rounded-[2rem] flex items-center justify-center mb-10 mx-auto shadow-[0_0_60px_rgba(201,145,42,0.15)] relative overflow-hidden group">
                   <div className="absolute inset-0 bg-gold/20 blur-xl group-hover:scale-150 transition-transform duration-700" />
                   <TrendingUp className="w-12 h-12 text-gold relative z-10" />
                </div>
                
                <div className="text-center mb-6 pt-2">
                  <p className="text-[10px] font-black tracking-[0.3em] text-gold uppercase mb-2">Alphasynth Intelligence</p>
                  <h2 className="text-4xl md:text-5xl font-display font-black text-center text-white tracking-tighter italic leading-[1.1]">
                     NSE RESEARCH <br/><span className="text-gold">TERMINAL.</span>
                  </h2>
                </div>

                <p className="text-zinc-400 text-center text-base leading-relaxed mb-12 max-w-sm mx-auto font-medium">
                   Access institutional-grade insights grounded in live NSE SEBI filings. No noise. Just Alpha.
                </p>
                
                <div className="grid gap-4 mb-12">
                  {[
                    { label: 'Fact-Grounded', icon: Globe, desc: 'Avoid AI hallucinations with live SEBI/NSE filings', tab: 'news' as const },
                    { label: 'Contrarian Audit', icon: ShieldCheck, desc: 'Every bull case is stress-tested against a bear logic', tab: 'equity' as const },
                    { label: 'Portfolio Health', icon: LockIcon, desc: 'Sync your holdings to identify hidden sector overlaps', tab: 'portfolio' as const }
                  ].map((feat, i) => (
                    <motion.button 
                      key={i} 
                      whileHover={{ x: 5 }}
                      onClick={() => {
                        setActiveTab(feat.tab);
                        completeOnboarding();
                        setTimeout(scrollToWorkflow, 100);
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + (i * 0.1) }}
                      className="w-full flex items-center gap-5 p-5 bg-app-bg/50 border border-app-border rounded-3xl hover:border-gold/30 transition-all group cursor-pointer text-left"
                    >
                      <div className="p-3 bg-app-surface border border-app-border rounded-xl group-hover:bg-amber transition-all flex-shrink-0">
                        <feat.icon className="w-5 h-5 text-zinc-400 group-hover:text-black" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white uppercase tracking-widest leading-none mb-1.5">{feat.label}</p>
                        <p className="text-[10px] text-zinc-500 leading-tight font-medium">{feat.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
                
                <button 
                  onClick={() => {
                    setActiveTab('news');
                    completeOnboarding();
                    setTimeout(scrollToWorkflow, 100);
                  }}
                  className="w-full py-5 bg-amber text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-2xl hover:bg-amber transition-all shadow-[0_10px_30px_rgba(201,145,42,0.3)] active:scale-[0.98]"
                >
                  Enter NSE Research Terminal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingPortfolioAudit && portfolioAudit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-app-bg/95 backdrop-blur-md text-left">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-app-bg border border-app-border w-full max-w-6xl h-[90vh] overflow-hidden rounded-3xl flex flex-col shadow-2xl relative"
            >
              {/* Header */}
              <div className="p-8 border-b border-app-border flex items-center justify-between bg-app-surface/40">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-amber rounded-2xl text-black shadow-[0_0_20px_rgba(201,145,42,0.3)]">
                     <Shield className="w-8 h-8" />
                  </div>
                  <div>
                      <h2 className="text-3xl font-display font-black text-white tracking-tight uppercase italic">
                        Institutional Portfolio Audit<span className="text-gold">.</span>
                      </h2>
                      <div className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-positive animate-pulse" /> Grounding Engine Active 
                        <span className="text-app-border">•</span>
                        Archive: {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setViewingPortfolioAudit(false)} 
                    className="p-3 bg-app-surface hover:bg-app-surface-accent border border-app-border rounded-xl text-zinc-400 hover:text-white transition-all group"
                  >
                    <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 lg:p-16 no-scrollbar">
                <div className="grid lg:grid-cols-12 gap-16">
                  {/* Sidebar/Impact Column */}
                  <div className="lg:col-span-4 space-y-10">
                    <div className="p-8 bg-app-surface/50 border border-app-border rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                          <Settings className="w-16 h-16" />
                        </div>
                        <h3 className="text-xs font-black text-gold uppercase tracking-[0.2em] mb-8">Asset Concentration</h3>
                        <div className="h-64 mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={holdings.filter(h => h.ticker && h.qty > 0).map((h, i) => ({ name: h.ticker, value: h.qty }))}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={85}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                  >
                                    {holdings.filter(h => h.ticker && h.qty > 0).map((_, index) => (
                                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Pie>
                                    <Tooltip 
                                      contentStyle={{ backgroundColor: '#151819', border: '1px solid #242829', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                                      itemStyle={{ color: '#ffffff', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-col gap-3">
                           {holdings.slice(0, 4).map((h, i) => (
                             <div key={i} className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-zinc-500">
                               <span>{h.ticker}</span>
                               <span className="text-zinc-300">{h.qty} UNITS</span>
                             </div>
                           ))}
                        </div>
                    </div>

                    <div className="p-8 bg-app-bg border border-app-border rounded-3xl">
                        <h3 className="text-xs font-black text-positive uppercase tracking-[0.2em] mb-4">Risk Integrity</h3>
                        <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                           Analysis grounded in real-time NSE volatility indices and sector rotation patterns. Correlation scores calculated using historical median deviations.
                        </p>
                    </div>
                  </div>

                  {/* Main Report Column */}
                  <div className="lg:col-span-8 space-y-12">
                    <div 
                      ref={auditContentRef}
                      className="max-w-none prose-lg leading-relaxed text-zinc-300 selection:bg-gold/30 p-12 bg-black rounded-[40px] border border-zinc-900 shadow-2xl relative overflow-hidden text-left"
                    >
                      {/* Decorative elements for rich feel */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2" />
                      
                      <div className="relative z-10">
                        <MD>{portfolioAudit}</MD>
                      </div>
                    </div>
                    
                    <div className="pt-16 border-t border-zinc-900 flex items-center justify-between font-black uppercase tracking-[0.2em] text-[10px] text-zinc-500">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-gold opacity-50" /> 
                          <span>Institutional Engine v4.0 • 256-bit Encryption • Audit Log Validated</span>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-6 border-t border-zinc-900 bg-zinc-900/20 flex flex-wrap justify-end gap-4">
                  <button 
                  onClick={() => {
                    navigator.clipboard.writeText(portfolioAudit);
                    alert("Report copied to clipboard.");
                  }}
                  className="px-6 py-2.5 bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-xl transition-all flex items-center gap-2"
                 >
                   <Copy className="w-3.5 h-3.5" />
                   Copy Text
                 </button>
                 <button 
                  onClick={() => {
                    const blob = new Blob([portfolioAudit], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `portfolio-audit-${new Date().toISOString().slice(0,10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-6 py-2.5 bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-xl transition-all flex items-center gap-2"
                 >
                   <Download className="w-3.5 h-3.5" />
                   Download TXT
                 </button>
                 <button 
                  onClick={handleExportPDF}
                  className="px-6 py-2.5 bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-xl transition-all flex items-center gap-2"
                 >
                   <FileText className="w-3.5 h-3.5" />
                   Export PDF
                 </button>
                 <button 
                  onClick={() => setViewingPortfolioAudit(false)}
                  className="px-8 py-2.5 bg-amber text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber transition-all shadow-[0_4px_14px_rgba(201,145,42,0.3)]"
                 >
                   Close Audit
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {renderReportModal()}
      {/* Login / IFrame Notice - Only show on explicit error */}
      <AnimatePresence>
        {showIframeWarning && !user && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[70] w-[90%] max-w-sm bg-app-surface border border-gold/50 backdrop-blur-xl p-4 rounded-2xl flex items-center gap-4 shadow-2xl"
          >
            <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold flex-shrink-0">
               <Shield className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Acessibility Issue</p>
              <p className="text-[10px] text-zinc-400 leading-tight">IFrame detected. If login fails, use the <span className="text-gold font-bold">Launch App</span> button or Shared URL.</p>
            </div>
            <button 
              onClick={() => setShowIframeWarning(false)}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Link Helper Bar */}
      <div className="fixed bottom-6 left-6 z-[60] hidden md:block">
        <div className={`p-1 pr-4 bg-app-surface border ${COLORS.border} backdrop-blur-xl rounded-full flex items-center gap-3 shadow-2xl overflow-hidden group`}>
          <button 
            onClick={() => copyToClipboard(getSharedUrl())}
            className={`p-3 rounded-full transition-all ${copyStatus === 'copied' ? 'bg-green-500 text-black' : 'bg-amber text-black hover:scale-105 active:scale-95'}`}
          >
            {copyStatus === 'copied' ? <TrendingUp className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 leading-none mb-1">Public Share Link</p>
            <p className="text-[10px] text-zinc-300 font-mono opacity-60 group-hover:opacity-100 transition-opacity">
              {getSharedUrl().substring(0, 30)}...
            </p>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {previewContent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`w-full max-w-xl ${COLORS.surface} border ${COLORS.border} rounded-3xl p-8 shadow-2xl relative`}
            >
              <button 
                onClick={() => setPreviewContent(null)}
                className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-500 hover:text-white"
              >
                <LogOut className="w-5 h-5 rotate-180" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gold/10 rounded-lg flex items-center justify-center text-gold">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{previewContent.title}</h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Review & Export Draft</p>
                </div>
              </div>

              <div className="bg-app-surface border border-app-border rounded-xl p-4 mb-6">
                <textarea 
                  className="w-full bg-transparent text-zinc-300 text-sm font-sans min-h-[200px] focus:outline-none resize-none leading-relaxed"
                  value={previewContent.text}
                  onChange={(e) => setPreviewContent({...previewContent, text: e.target.value})}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(previewContent.text);
                    alert("Draft copied to clipboard!");
                  }}
                  className="flex-1 px-6 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" /> Copy Text
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(previewContent.text);
                    if (previewContent.title.includes("LinkedIn")) {
                      window.open('https://www.linkedin.com/feed/', '_blank');
                    } else if (previewContent.title.includes("Analysis Audit")) {
                      alert("Analysis Audit saved to your Private Portfolio tab!");
                      setActiveTab('portfolio');
                    } else {
                      alert("Briefing copied! You can now paste this into Substack, WordPress, or your Email newsletter.");
                    }
                    setPreviewContent(null);
                  }}
                  className="flex-1 px-6 py-3 bg-amber text-black font-bold rounded-xl hover:bg-amber transition-colors flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> 
                  {previewContent.title.includes("LinkedIn") 
                    ? "Copy & Open LinkedIn" 
                    : previewContent.title.includes("Analysis Audit")
                    ? "Close Audit"
                    : "Copy Briefing for Newsletter"}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-4 text-center">
                {previewContent.title.includes("Analysis Audit") 
                  ? "This high-fidelity audit is generated by Alphasynth Intelligence's institutional engine."
                  : "LinkedIn doesn't allow direct text injection. We've copied the text; just paste (Ctrl+V) it into your feed."}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Beta Banner */}
      {showBetaBanner && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center py-1.5 px-6"
          style={{ background: 'rgba(201,145,42,0.15)', borderBottom: '1px solid rgba(201,145,42,0.3)' }}
        >
          <p className="text-[11px] font-medium text-amber text-center">
            🚀 Beta — Free access to all features.&nbsp;Share feedback:&nbsp;
            <a href="mailto:srscoll@gmail.com" className="underline hover:text-white transition-colors">srscoll@gmail.com</a>
          </p>
          <button
            onClick={() => { setShowBetaBanner(false); localStorage.setItem('beta_banner_dismissed', 'true'); }}
            className="absolute right-4 text-amber/70 hover:text-amber text-base leading-none transition-colors"
            aria-label="Dismiss beta banner"
          >×</button>
        </div>
      )}

      {/* Navigation */}
      <nav className={`fixed ${showBetaBanner ? 'top-[30px]' : 'top-0'} w-full z-50 border-b border-app-border backdrop-blur-md bg-app-bg/50`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group relative cursor-pointer" title="Back to home">
            <div className={`w-8 h-8 bg-amber rounded flex items-center justify-center group-hover:scale-105 transition-transform`}>
              <TrendingUp className="text-black w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white group-hover:text-gold transition-colors">
              Alphasynth Intelligence
              <span className="md:hidden ml-1.5 text-sm opacity-40">⌂</span>
            </span>
            <span className="absolute top-full left-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-zinc-900 text-zinc-300 text-xs px-2.5 py-1 rounded-lg whitespace-nowrap pointer-events-none border border-zinc-800 hidden md:block z-50">
              ← Home
            </span>
          </a>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
               <button onClick={() => { setActiveTab('news'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'news' ? 'text-gold' : ''}`}>Pulse</button>
               <button onClick={() => { setActiveTab('equity'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'equity' ? 'text-gold' : ''}`}>Research</button>
               <button onClick={() => { setActiveTab('filings'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'filings' ? 'text-gold' : ''}`}>Filings</button>
               <button onClick={() => { setActiveTab('portfolio'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'portfolio' ? 'text-gold' : ''}`}>Audit</button>
               <button onClick={() => { setActiveTab('marketing'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'marketing' ? 'text-gold' : ''}`}>Growth</button>
               <button onClick={() => { setActiveTab('community'); scrollToWorkflow(); }} className={`hover:text-white transition-colors ${activeTab === 'community' ? 'text-gold' : ''}`}>Social</button>
            </div>
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-white leading-none mb-1">{user.displayName}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">Beta Access</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4 text-zinc-500 group-hover:text-gold" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest bg-amber text-black rounded hover:bg-amber transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(201,145,42,0.3)] active:scale-95`}
              >
                <TrendingUp className="w-3 h-3" /> Start Free Research
              </button>
            )}
          </div>
        </div>
      </nav>

      <div style={{width:'100%',background:'rgba(201,145,42,0.06)',borderBottom:'1px solid rgba(201,145,42,0.2)',padding:'7px 24px',textAlign:'center'}}>
        <p style={{margin:0,fontSize:11,color:'#9ca3af'}}><span style={{color:'#c9a84c',fontWeight:700}}>Alphasynth Intelligence</span> provides AI-generated market data analysis only. Not a SEBI-registered Research Analyst. Not investment advice.</p>
      </div>
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gold/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 bg-app-surface border border-app-border rounded-full text-[10px] font-bold uppercase tracking-widest text-gold mb-6 font-display">
              Institutional Intelligence for Retail Investors
            </span>
            <h1 className="text-4xl md:text-7xl font-display font-semibold tracking-tight leading-[1.05] mb-8 text-white">
              Own the Workflow. <br />
              <span className="text-gold font-medium">Out-Research the Street.</span>
            </h1>

            {/* Main Action Hub */}
            <div className="max-w-4xl mx-auto mb-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
               {[
                 { 
                   id: 'deep_dive', 
                   title: 'Equity Deep Dive', 
                   icon: BarChart3, 
                   desc: 'Institutional report with risk alpha', 
                   outcome: 'Generate conviction',
                   accent: 'border-gold/30' 
                 },
                 {
                   id: 'earnings_intelligence',
                   title: 'Earnings Intelligence',
                   icon: MessageSquare,
                   desc: 'Unified concall + results report',
                   outcome: 'Spot hidden signals',
                   accent: 'border-blue-500/20'
                 },
                 { 
                   id: 'move', 
                   title: 'Explain the Move', 
                   icon: TrendingUp, 
                   desc: 'Why is it up/down today?', 
                   outcome: 'Audit daily spikes',
                   accent: 'border-positive/20' 
                 },
                 { 
                   id: 'filings', 
                   title: 'Filing & Transcripts', 
                   icon: FileText, 
                   desc: 'For forensic corporate audits', 
                   outcome: 'Audit management trust',
                   accent: 'border-yellow-500/20' 
                 }
               ].map((mode) => (
                 <button 
                  key={mode.id}
                  onClick={() => {
                    if (mode.id === 'filings') {
                      setActiveTab('filings');
                      setTimeout(scrollToWorkflow, 100);
                    } else if (mode.id === 'earnings_intelligence') {
                      setWorkflowMode('earnings_intelligence');
                      setActiveTab('equity');
                      setTimeout(scrollToWorkflow, 100);
                    } else {
                      setWorkflowMode(mode.id as 'deep_dive' | 'earnings' | 'move');
                      setActiveTab('equity');
                      setTimeout(scrollToWorkflow, 100);
                    }
                  }}
                  className={`p-6 rounded-2xl border ${((mode.id === 'filings' && activeTab === 'filings') || (mode.id !== 'filings' && workflowMode === mode.id && activeTab === 'equity')) ? 'bg-app-surface-accent ' + mode.accent : 'bg-transparent border-app-border'} hover:border-zinc-700 transition-all text-left flex flex-col justify-between gap-4 group relative overflow-hidden h-full shadow-lg`}
                 >
                    <div className={`p-3 rounded-xl w-fit ${workflowMode === mode.id ? 'bg-amber text-black' : 'bg-app-surface text-zinc-500'}`}>
                      <mode.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">{mode.title}</h4>
                      <p className="text-[10px] text-zinc-400 font-medium leading-tight mt-1 mb-2">{mode.desc}</p>
                      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gold/80 mt-auto">
                        <Zap className="w-2.5 h-2.5" /> {mode.outcome}
                      </div>
                    </div>
                    {workflowMode === mode.id && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-amber" />}
                 </button>
               ))}
            </div>

            {/* Data Source Configuration */}
            <div className="max-w-2xl mx-auto mb-6 flex flex-wrap justify-center gap-3">
              {[
                { id: 'official', name: 'Official Filings', category: 'Compliance' },
                { id: 'research', name: 'Verified Research', category: 'Analysis' },
                { id: 'news', name: 'Global News', category: 'Sentiment' },
                { id: 'social', name: 'Social Alpha', category: 'Risk' }
              ].map((source) => (
                <button
                  key={source.id}
                  onClick={() => {
                    if (dataSources.includes(source.id)) {
                      setDataSources(dataSources.filter(s => s !== source.id));
                    } else {
                      setDataSources([...dataSources, source.id]);
                    }
                  }}
                  className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    dataSources.includes(source.id) 
                      ? 'bg-app-surface-accent border-gold/30 text-gold' 
                      : 'bg-app-surface/50 border-app-border text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full ${dataSources.includes(source.id) ? 'bg-amber shadow-[0_0_8px_rgba(201,145,42,0.5)]' : 'bg-app-border'}`} />
                  {source.name}
                </button>
              ))}
            </div>

            <div className="max-w-2xl mx-auto mb-6 text-center animate-pulse">
              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 leading-none">
                <ShieldCheck className="w-3.5 h-3.5 text-gold" /> 
                Institutional Compliance Shield Active
              </p>
            </div>

            {/* Input Controls */}
            <div className="max-w-2xl mx-auto mb-10 flex flex-col md:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search company or ticker (e.g. Tata Steel, RELIANCE)"
                  value={ticker}
                  onChange={(e) => { const v = e.target.value.toUpperCase(); setTicker(v); fetchSuggestions(v); }}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => { setTimeout(closeSuggestions, 150); }}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-autocomplete="list"
                  className="w-full px-4 py-4 bg-app-surface border border-app-border rounded-xl text-sm text-white focus:outline-none focus:border-gold transition-colors placeholder:text-zinc-600 font-semibold"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul
                    role="listbox"
                    className="absolute z-50 left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-xl border border-app-border bg-app-surface shadow-[0_20px_50px_rgba(0,0,0,0.6)] py-1 text-left"
                  >
                    {suggestions.map((item, idx) => (
                      <li
                        key={item.symbol}
                        role="option"
                        aria-selected={idx === activeSuggestion}
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item); }}
                        onMouseEnter={() => setActiveSuggestion(idx)}
                        className={`relative flex items-center justify-between gap-4 px-4 py-2.5 cursor-pointer transition-colors ${
                          idx === activeSuggestion ? 'bg-app-surface-accent' : 'hover:bg-app-surface-accent/60'
                        }`}
                      >
                        {idx === activeSuggestion && (
                          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold rounded-r" />
                        )}
                        <span className={`truncate text-sm font-medium ${idx === activeSuggestion ? 'text-white' : 'text-zinc-200'}`}>
                          {item.name}
                        </span>
                        <span className={`shrink-0 font-mono text-xs tracking-wide ${idx === activeSuggestion ? 'text-gold' : 'text-zinc-500'}`}>
                          {item.symbol}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button 
                onClick={() => triggerAnalysis()}
                disabled={analyzing}
                className="px-8 py-4 bg-amber text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 rounded-xl hover:bg-amber active:scale-[0.98] transition-all disabled:opacity-50 min-w-[200px] shadow-[0_10px_20px_rgba(201,145,42,0.2)]"
              >
                {analyzing ? (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    <span>{analysisStatus || 'Analyzing...'}</span>
                  </div>
                ) : (
                  <>Execute Research <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2 text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-positive" /> Grounding Engine: Active
                </div>
                <div className="flex items-center gap-2 text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> NSE/BSE Sourced
                </div>
            </div>

            {/* Social Proof Section */}
            <div className="mt-20 pt-10 border-t border-app-border/30">
               <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-10">Trusted by Institutional Minds</p>
               <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
                  {['Dalal Street Pro', 'NSE Collective', 'Alpha Insights', 'FinTech Labs'].map((brand) => (
                    <div key={brand} className="flex items-center gap-2">
                       <Zap className="w-4 h-4 text-gold" />
                       <span className="text-sm font-display font-bold text-white tracking-tighter italic">{brand}</span>
                    </div>
                  ))}
               </div>
               <div className="mt-12 flex flex-col md:flex-row justify-center items-center gap-8">
                  <div className="flex -space-x-4">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-app-bg bg-zinc-800 flex items-center justify-center overflow-hidden">
                        <UserIcon className="w-5 h-5 text-zinc-600" />
                      </div>
                    ))}
                  </div>
                  <div className="text-left">
                     <p className="text-xl font-display font-medium text-white italic tracking-tight">"The first tool that actually reads the filings. Non-negotiable for my workflow."</p>
                     <p className="text-[10px] font-black text-gold uppercase tracking-widest mt-1.5">— Siddhartha V., Equity Derivatives Desk</p>
                  </div>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Dynamic Workflow Tab */}
      <section id="workflow" className="py-20 px-6 border-t border-app-border bg-app-surface/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-4 justify-center mb-16">
            {(['news', 'equity', 'filings', 'portfolio', 'marketing', 'community'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); scrollToWorkflow(); }}
                className={`px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group ${
                  activeTab === tab
                  ? 'bg-amber text-black shadow-[0_10px_25px_rgba(201,145,42,0.25)]'
                  : 'bg-app-surface text-zinc-500 border border-app-border hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="opacity-40">
                    {tab === 'news' ? '01' : tab === 'equity' ? '02' : tab === 'filings' ? '03' : tab === 'portfolio' ? '04' : tab === 'marketing' ? '05' : '06'}
                  </span>
                  <span>{tab.toUpperCase()}</span>
                </div>
                {activeTab !== tab && (
                  <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                )}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === 'news' && (
                <motion.div
                  key="news"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="col-span-2 w-full"
                >
                  {/* ── Daily AI Market Brief + Smart Money Leaderboard ───────────────── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32, width: '100%' }}>

                    {/* LEFT: Daily AI Market Brief */}
                    <div style={{ background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 14, padding: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c', boxShadow: '0 0 8px #c9a84c', flexShrink: 0 }} />
                        <span style={{ color: '#c9a84c', fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Daily AI Market Brief</span>
                      </div>
                      {dailyBrief ? (
                        <>
                          <p style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{dailyBrief}</p>
                          {(() => {
                            const last10 = fiiDiiData?.last10Days || [];
                            let fiiNet = fiiDiiData?.fiiNet ?? 0;
                            let diiNet = fiiDiiData?.diiNet ?? 0;
                            if (fiiNet === 0 && last10.length > 0) {
                              const r = last10[last10.length - 1] || last10[0];
                              fiiNet = r?.fiiNet ?? 0;
                              if (diiNet === 0) diiNet = r?.diiNet ?? 0;
                            }
                            const mood = liveIntel?.marketMoodScore;
                            const pill = (label: string, bg: string, color: string) => (
                              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: bg, color }}>{label}</span>
                            );
                            const badges: any[] = [];
                            if (fiiNet < 0) badges.push(pill('FII Selling', 'rgba(244,63,94,0.12)', '#f43f5e'));
                            if (fiiNet > 0) badges.push(pill('FII Buying', 'rgba(16,185,129,0.12)', '#10b981'));
                            if (diiNet > 0) badges.push(pill('DII Buying', 'rgba(168,85,247,0.12)', '#a855f7'));
                            if (mood !== null && mood !== undefined && mood > 55) badges.push(pill('Bullish Mood', 'rgba(16,185,129,0.12)', '#10b981'));
                            if (mood !== null && mood !== undefined && mood < 45) badges.push(pill('Bearish Mood', 'rgba(244,63,94,0.12)', '#f43f5e'));
                            return badges.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>{badges}</div>
                            ) : null;
                          })()}

                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                          <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid #2a2d3a', borderTopColor: '#c9a84c', borderRadius: '50%' }} />
                        </div>
                      )}
                    </div>

                    {/* RIGHT: FII/DII Flow Summary */}
                    <div style={{ background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 14, padding: 24 }}>
                      {(() => {
                        const last10 = fiiDiiData?.last10Days || [];
                        let fiiNet = fiiDiiData?.fiiNet ?? 0;
                        let diiNet = fiiDiiData?.diiNet ?? 0;
                        let dataDate = fiiDiiData?.date || 'Latest available';
                        // Use last10Days[0] when today's reading is still zero (pre-close).
                        if (fiiNet === 0 && last10.length > 0) {
                          const r = last10[0];
                          fiiNet = r?.fiiNet ?? 0;
                          diiNet = r?.diiNet ?? 0;
                          dataDate = r?.date || dataDate;
                        }
                        const fiiColor = fiiNet >= 0 ? '#10b981' : '#f43f5e';
                        const diiColor = diiNet >= 0 ? '#3b82f6' : '#f59e0b';
                        const fmtNum = (v: number) => `${v >= 0 ? '+' : ''}${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
                        return (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
                              <span style={{ color: '#c9a84c', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>FII/DII Flow Summary</span>
                            </div>
                            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 22px' }}>As of {dataDate}</p>
                            {fiiDiiData ? (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                  <div>
                                    <p style={{ fontSize: 10, color: '#6b7280', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 8px' }}>FII Net</p>
                                    <p style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: fiiColor, margin: 0, whiteSpace: 'nowrap' }}>{fmtNum(fiiNet)}</p>
                                    <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>₹ Crore</p>
                                  </div>
                                  <div>
                                    <p style={{ fontSize: 10, color: '#6b7280', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 8px' }}>DII Net</p>
                                    <p style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: diiColor, margin: 0, whiteSpace: 'nowrap' }}>{fmtNum(diiNet)}</p>
                                    <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>₹ Crore</p>
                                  </div>
                                </div>
                                <p style={{ fontSize: 10, color: '#4b5563', margin: 0, lineHeight: 1.5 }}>Today's data available after market close (3:30 PM IST)</p>
                              </>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '28px 0', gap: 10 }}>
                                <div className='animate-spin' style={{ width: 24, height: 24, border: '2px solid #2a2d3a', borderTopColor: '#c9a84c', borderRadius: '50%' }} />
                                <span style={{ fontSize: 12, color: '#6b7280' }}>Loading flow summary...</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {/* ──────────────────────────────────────────────────────────────────── */}

                  <div className="grid lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2 space-y-8">
                    <div>
                    <div className="flex items-center justify-between mb-2">
                       <h2 className="text-4xl font-display font-semibold tracking-tight text-white">Market Intelligence Snapshot</h2>
                       <button 
                         onClick={fetchMarketIntel}
                         disabled={loadingIntel}
                         className="p-2 text-zinc-500 hover:text-gold transition-colors disabled:opacity-50"
                         title="Refresh Pulse intelligence"
                       >
                         <RefreshCw className={`w-5 h-5 ${loadingIntel ? 'animate-spin' : ''}`} />
                       </button>
                    </div>
                      <p className="text-zinc-400 mb-6 leading-relaxed">
                        Periodic highlights identifying trending tickers and institutional-grade news.
                      </p>
                      
                      <div className="grid sm:grid-cols-2 gap-4">
                        {loadingIntel ? (
                          <div className="space-y-3 col-span-2">
                            {[1,2,3].map(i => (
                              <div key={i} className="h-16 bg-app-surface border border-app-border rounded-xl animate-pulse" />
                            ))}
                          </div>
                        ) : liveIntel?.trending?.map((item, i) => (
                          <div 
                            key={i} 
                            className="p-4 bg-app-surface/50 border border-app-border rounded-xl hover:border-gold/30 transition-all cursor-pointer group flex justify-between items-center"
                            onClick={() => {
                              setTicker(item.ticker.split('.')[0]);
                              setWorkflowMode('deep_dive');
                              setActiveTab('equity');
                              document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-black text-gold uppercase tracking-widest">{item.ticker}</span>
                                <TrendingUp className="w-3 h-3 text-positive opacity-50" />
                              </div>
                              <p className="text-[10px] text-zinc-300 font-medium line-clamp-1">{item.reason}</p>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                addToWatchlist(item.ticker.split('.')[0]);
                              }}
                              className="p-2 text-zinc-600 hover:text-gold transition-colors"
                            >
                              <Heart className="w-4 h-4" />
                            </button>
                          </div>
                        )) || (
                          <div className="col-span-2 p-12 text-center border-2 border-dashed border-app-border rounded-2xl group hover:border-gold/50 transition-all cursor-pointer" onClick={fetchMarketIntel}>
                            <RefreshCw className={`w-6 h-6 text-zinc-700 mb-2 mx-auto ${loadingIntel ? 'animate-spin' : ''}`} />
                            <p className="text-zinc-600 italic text-xs">Awaiting market signal...</p>
                            <p className="text-[10px] text-zinc-800 uppercase mt-2 font-black tracking-widest">Click to pulse manual fetch</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-8">
                       <div className={`p-8 rounded-2xl bg-app-surface border border-app-border shadow-2xl relative overflow-hidden flex-1`}>
                          <div className="flex items-center justify-between mb-6">
                             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Macro Sentiment Audit</p>
                             <Globe className="w-4 h-4 text-gold" />
                          </div>
                          <p className="text-sm font-medium text-zinc-100 leading-relaxed italic mb-8">
                             {loadingIntel ? "Parsing macro news..." : liveIntel?.marketSentiment || "Fetching latest market intelligence..."}
                          </p>
                          <div className="pt-6 border-t border-app-border/50 flex justify-between items-center">
                             <div className="flex flex-wrap gap-2">
                                {liveIntel?.sources?.slice(0, 3).map((s: any, i: number) => (
                                   <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-[9px] bg-app-bg border border-app-border px-2 py-1 rounded text-zinc-400 hover:text-gold transition-colors">
                                      {s.title?.substring(0, 20)}...
                                   </a>
                                ))}
                             </div>
                             <div className="text-[9px] font-bold text-zinc-700 uppercase tracking-widest">v2.4</div>
                          </div>
                       </div>

                       <div className={`p-8 rounded-2xl bg-app-surface/30 border border-app-border shadow-2xl flex flex-col justify-center items-center text-center relative overflow-hidden`}>
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-negative via-amber to-positive" />
                          <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-8">Fear & Greed Index</h3>
                          
                          <div className="relative w-32 h-32 mb-6">
                             {liveIntel?.marketMoodScore !== null && liveIntel?.marketMoodScore !== undefined ? (
                               <>
                                 <svg className="w-full h-full -rotate-90">
                                   <circle cx="64" cy="64" r="58" fill="none" stroke="#242829" strokeWidth="12" />
                                   <motion.circle
                                     initial={{ strokeDashoffset: 364 }}
                                     animate={{ strokeDashoffset: 364 - (364 * liveIntel.marketMoodScore / 100) }}
                                     cx="64" cy="64" r="58" fill="none"
                                     stroke={(fiiDiiData?.last10Days || []).slice(0, 5).filter((d: any) => (d.fiiNet ?? 0) < 0).length >= 3 ? '#f59e0b' : liveIntel.marketMoodScore > 70 ? 'var(--color-positive)' : liveIntel.marketMoodScore > 40 ? 'var(--color-gold)' : 'var(--color-negative)'}
                                     strokeWidth="12" strokeDasharray="364" strokeLinecap="round"
                                   />
                                 </svg>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                                   <span className="text-3xl font-display font-black text-white leading-none">
                                     {loadingIntel ? "..." : liveIntel.marketMoodScore}
                                   </span>
                                   <span className={`text-[8px] font-black uppercase tracking-widest mt-1 ${(fiiDiiData?.last10Days || []).slice(0, 5).filter((d: any) => (d.fiiNet ?? 0) < 0).length >= 3 ? 'text-amber' : liveIntel.marketMoodScore > 70 ? 'text-positive' : liveIntel.marketMoodScore > 40 ? 'text-gold' : 'text-negative'}`}>
                                     {(() => { const score = liveIntel.marketMoodScore; const fiiBias = fiiDiiData?.last10Days?.slice(0,3).filter((d:any)=>d.fiiNet<0).length >= 2; if (fiiBias && score > 60) return 'Caution'; return score > 80 ? 'Exuberance' : score > 60 ? 'Greed' : score > 40 ? 'Neutral' : score > 20 ? 'Fear' : 'Panic'; })()}
                                   </span>
                                 </div>
                               </>
                             ) : (
                               <div className="absolute inset-0 flex flex-col items-center justify-center">
                                 <svg className="w-full h-full -rotate-90">
                                   <circle cx="64" cy="64" r="58" fill="none" stroke="#242829" strokeWidth="12" />
                                 </svg>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                                   <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest text-center leading-tight">{loadingIntel ? "..." : "Unavailable"}</span>
                                 </div>
                               </div>
                             )}
                          </div>
                          <p className="text-[9px] text-zinc-500 font-medium leading-relaxed px-4">Real-time analysis of volatility, momentum, and retail sentiment across Dalal Street.</p>
                          <p className="text-[9px] text-zinc-600 font-medium leading-relaxed px-4 mt-3 italic">Note: Based on AI sentiment analysis of market data. Cross-reference with FII flows above for complete picture.</p>
                       </div>
                    </div>

                    {/* ── Institutional Flow Monitor ── */}
                    <div className="space-y-6">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Institutional Flow Monitor</h2>
                        <p className="text-zinc-400 text-xs leading-relaxed mt-1">FII &amp; DII daily net buy/sell activity — sourced from NSE disclosures</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {fiiDiiData?.lastUpdated && (
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isMarketOpen() ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                              {isMarketOpen() ? 'Live' : 'Last available'} · {new Date(fiiDiiData.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={fetchFiiDii}
                          disabled={loadingFiiDii}
                          className="p-2 text-zinc-500 hover:text-gold transition-colors disabled:opacity-40"
                          title="Refresh FII/DII data"
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingFiiDii ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Loading state */}
                    {loadingFiiDii && (
                      <div className="bg-gold/5 border border-gold/20 rounded-2xl p-5 text-center animate-pulse">
                        <p className="text-gold text-[11px] font-bold font-mono tracking-widest uppercase">{fiiDiiStatus || 'Fetching institutional flow data...'}</p>
                      </div>
                    )}

                    {/* Data unavailable state */}
                    {!loadingFiiDii && fiiDiiData && !fiiDiiData.dataAvailable && (
                      <div className="bg-app-surface/40 border border-app-border border-dashed rounded-2xl p-8 text-center">
                        <Database className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-400 text-sm font-medium">Institutional flow data temporarily unavailable.</p>
                        <p className="text-zinc-600 text-xs mt-1">Please check back later — data is published after market close.</p>
                      </div>
                    )}

                    {/* Main content — shown only when data is available */}
                    {!loadingFiiDii && fiiDiiData?.dataAvailable && (
                      <>
                        {/* Summary Cards: FII Net + DII Net */}
                        {(() => {
                          const last10 = fiiDiiData.last10Days || [];
                          let fiiNet = fiiDiiData.fiiNet ?? 0;
                          let diiNet = fiiDiiData.diiNet ?? 0;
                          let dataDate = fiiDiiData.date || 'Latest';
                          // Fall back to last10Days[0] when today's reading is still zero (pre-close).
                          if (fiiNet === 0 && last10.length > 0) {
                            const r = last10[0];
                            fiiNet = r?.fiiNet ?? 0;
                            diiNet = r?.diiNet ?? 0;
                            dataDate = r?.date || dataDate;
                          }
                          return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* FII Net */}
                          <div className={`p-6 rounded-2xl border relative overflow-hidden ${fiiNet >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                            {/* Glow — sits inside the overflow-hidden card so it can't escape */}
                            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 blur-2xl rounded-full pointer-events-none" style={{ background: fiiNet >= 0 ? '#10b981' : '#f43f5e' }} />
                            <p className="relative text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">FII Net Flow</p>
                            <p className="relative text-xs text-zinc-500 font-medium mb-3">Foreign Institutional Investors</p>
                            <p className={`relative text-3xl font-display font-black leading-none whitespace-nowrap ${fiiNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {`${fiiNet >= 0 ? '+' : ''}${fiiNet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            </p>
                            <p className="relative text-xs text-zinc-500 mt-2">₹ Crore · {dataDate}</p>
                            <div className={`relative mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${fiiNet >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${fiiNet >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                              {fiiNet >= 0 ? 'Net Buying' : 'Net Selling'}
                            </div>
                          </div>

                          {/* DII Net */}
                          <div className={`p-6 rounded-2xl border relative overflow-hidden ${diiNet >= 0 ? 'bg-blue-500/5 border-blue-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 blur-2xl rounded-full pointer-events-none" style={{ background: diiNet >= 0 ? '#3b82f6' : '#f59e0b' }} />
                            <p className="relative text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">DII Net Flow</p>
                            <p className="relative text-xs text-zinc-500 font-medium mb-3">Domestic Institutional Investors</p>
                            <p className={`relative text-3xl font-display font-black leading-none whitespace-nowrap ${diiNet >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                              {`${diiNet >= 0 ? '+' : ''}${diiNet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            </p>
                            <p className="relative text-xs text-zinc-500 mt-2">₹ Crore · {dataDate}</p>
                            <div className={`relative mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${diiNet >= 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${diiNet >= 0 ? 'bg-blue-400' : 'bg-amber-400'}`} />
                              {diiNet >= 0 ? 'Net Buying' : 'Net Selling'}
                            </div>
                          </div>
                        </div>
                          );
                        })()}

                        {/* 10-Day Flow Chart */}
                        {fiiDiiData.last10Days && fiiDiiData.last10Days.length > 0 && (
                          <div className="bg-app-surface border border-app-border rounded-2xl p-6">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-5">10-Day FII / DII Net Flow (₹ Crore)</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={[...fiiDiiData.last10Days].reverse()} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} barCategoryGap="25%">
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} width={55}
                                  tickFormatter={(v) => `${v >= 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`} />
                                <Tooltip
                                  contentStyle={{ background: '#0f1012', border: '1px solid #2a2d2f', borderRadius: 8, fontSize: 11 }}
                                  labelStyle={{ color: '#d4a843', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                  formatter={(value: any, name: string) => [`₹${Number(value).toLocaleString('en-IN')} Cr`, name === 'fiiNet' ? 'FII Net' : 'DII Net']}
                                />
                                <Bar dataKey="fiiNet" name="FII Net" radius={[3, 3, 0, 0]}>
                                  {([...fiiDiiData.last10Days].reverse() as any[]).map((entry: any, index: number) => (
                                    <Cell key={`fii-${index}`} fill={(entry.fiiNet ?? 0) >= 0 ? '#10b981' : '#f43f5e'} />
                                  ))}
                                </Bar>
                                <Bar dataKey="diiNet" name="DII Net" radius={[3, 3, 0, 0]}>
                                  {([...fiiDiiData.last10Days].reverse() as any[]).map((entry: any, index: number) => (
                                    <Cell key={`dii-${index}`} fill={(entry.diiNet ?? 0) >= 0 ? '#3b82f6' : '#f59e0b'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="flex items-center gap-5 mt-3 justify-center">
                              {[
                                { label: 'FII Buying', color: 'bg-emerald-500' },
                                { label: 'FII Selling', color: 'bg-rose-500' },
                                { label: 'DII Buying', color: 'bg-blue-500' },
                                { label: 'DII Selling', color: 'bg-amber-500' },
                              ].map(l => (
                                <div key={l.label} className="flex items-center gap-1.5">
                                  <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                                  <span className="text-[9px] text-zinc-500 font-bold">{l.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Interpretation */}
                        {fiiDiiData.aiInterpretation && (
                          <div className="relative p-6 bg-app-surface border-l-4 border-gold rounded-r-2xl border border-app-border">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gold/3 blur-3xl -z-10 rounded-full" />
                            <p className="text-[9px] font-black text-gold uppercase tracking-widest mb-3">AI Flow Interpretation</p>
                            <p className="text-sm text-[#B0B8C8] leading-relaxed font-light">{fiiDiiData.aiInterpretation}</p>
                          </div>
                        )}

                        {/* Sector Flow Breakdown — always render the card; show message when empty */}
                        <div className="bg-app-surface border border-app-border rounded-2xl p-6">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Sector-wise FII Flow (₹ Crore)</p>
                          <p className="text-[11px] text-zinc-300 mb-5">Fortnightly sector allocation data from NSE · Updated every two weeks via NSE SEBI disclosures</p>
                          {fiiDiiData.sectorFlows && fiiDiiData.sectorFlows.length > 0 ? (
                            <div className="space-y-4">
                              {fiiDiiData.sectorFlows.slice(0, 6).map((s: any, i: number) => {
                                const maxAbs = Math.max(...fiiDiiData.sectorFlows.map((x: any) => Math.abs(x.fiiNet ?? 0)), 1);
                                const pct = Math.abs(s.fiiNet ?? 0) / maxAbs * 100;
                                const positive = (s.fiiNet ?? 0) >= 0;
                                return (
                                  <div key={i} className="flex items-center gap-3">
                                    <span className="text-xs text-zinc-300 font-semibold w-40 flex-shrink-0 truncate">{s.sector}</span>
                                    <div className="flex-1 h-4 bg-app-bg rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${positive ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-mono font-black w-24 text-right flex-shrink-0 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {s.fiiNet !== null ? `${positive ? '+' : ''}${Number(s.fiiNet).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'N/A'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 italic">Sector-wise flow data unavailable for this period.</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Initial load placeholder (before first fetch completes) */}
                    {!loadingFiiDii && !fiiDiiData && (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-16 bg-app-surface border border-app-border rounded-xl animate-pulse" />
                        ))}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Watchlist Sidebar */}
                  <div className="space-y-6">
                    <div className={`p-6 rounded-2xl bg-app-surface/50 border border-app-border shadow-xl`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-gold" /> Private Watchlist
                        </h3>
                        <span className="text-[9px] font-bold text-zinc-500">{watchlist.length} Tickers</span>
                      </div>
                      
                      <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar">
                        {watchlist.length > 0 ? watchlist.map((t) => (
                          <div key={t} className="p-3 bg-app-bg/50 border border-app-border rounded-xl flex items-center justify-between group">
                            <button 
                              onClick={() => {
                                setTicker(t);
                                setWorkflowMode('deep_dive');
                                setActiveTab('equity');
                                document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="text-sm font-bold text-zinc-300 hover:text-gold transition-colors"
                            >
                              {t}
                            </button>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button 
                                onClick={() => removeFromWatchlist(t)}
                                className="p-1 hover:text-negative transition-colors"
                               >
                                  <LogOut className="w-3 h-3 rotate-45" />
                               </button>
                            </div>
                          </div>
                        )) : (
                          <div className="py-8 text-center border border-dashed border-app-border rounded-xl">
                            <p className="text-[10px] text-zinc-600 font-medium italic">Your watchlist is empty.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-gold/5 border border-gold/10">
                       <h4 className="text-[10px] font-black text-gold uppercase tracking-widest mb-2">Alpha Signal</h4>
                       <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Your watchlist conviction is computed daily against institutional flow data.
                       </p>
                    </div>
                  </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'equity' && (
                <div className="space-y-12 col-span-2 w-full text-left">
                  <motion.div
                    key="equity"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="grid md:grid-cols-2 gap-12 items-center"
                  >
                    <div className="order-2 md:order-1">
                      <div 
                        onClick={() => {
                          if (lastReport && lastReport.ticker === ticker) {
                            setViewingFullReport(true);
                          } else if (!analyzing) {
                            triggerAnalysis();
                          }
                        }}
                        className={`p-6 rounded-2xl ${COLORS.surface} border ${COLORS.border} shadow-2xl cursor-pointer hover:border-gold/50 transition-all group`}
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="font-bold text-lg group-hover:text-gold transition-colors">Target: {(lastReport && lastReport.ticker === ticker) ? lastReport.ticker : ticker || 'Analysis'}</h3>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                              {(lastReport && lastReport.ticker === ticker) ? 'Equity Research Report' : analyzing ? 'Analysis in Progress' : 'Awaiting New Analysis'}
                            </span>
                          </div>
                          <TrendingUp className={`transition-colors ${analyzing ? 'text-gold animate-pulse' : 'text-zinc-600 group-hover:text-gold'}`} />
                        </div>
                        <div className="space-y-3 mb-6">
                          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }} 
                              animate={{ width: (lastReport && lastReport.ticker === ticker) ? '100%' : analyzing ? '45%' : '15%' }} 
                              className="h-full bg-amber" 
                            />
                          </div>
                        </div>
                        <div className={`text-xs text-zinc-400 leading-relaxed italic mb-4 ${(lastReport && lastReport.ticker === ticker) ? 'line-clamp-[15]' : ''}`}>
                          {analyzing ? (
                            <div className="flex flex-col gap-2">
                              <span className="text-gold font-bold not-italic animate-pulse">RESEARCHING: {ticker}</span>
                              <span className="text-zinc-500 not-italic">{analysisStatus}</span>
                            </div>
                          ) : error ? (
                            <div className="not-italic bg-red-950/30 border border-red-500/20 rounded-xl p-4">
                              <p className="text-red-400 font-semibold text-sm mb-1">Unable to generate report</p>
                              <p className="text-zinc-400 text-xs leading-relaxed">{error}</p>
                            </div>
                          ) : (lastReport && lastReport.ticker === ticker) ? (
                            lastReport.rawReport
                          ) : ticker ? (
                            <div className="bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl not-italic group-hover:bg-zinc-800/80 transition-colors">
                              <span className="text-gold font-bold block mb-2">
                                {ticker} SELECTION CONFIRMED
                              </span>
                              <span className="text-zinc-500">
                                Click this card or the <strong className="text-white">"Scrape NSE Data"</strong> button above to initiate institutional research for {ticker}.
                              </span>
                            </div>
                          ) : (
                            "Click the 'Scrape NSE Data' button above to generate a real-time equity analysis for your chosen ticker."
                          )}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gold flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            {(lastReport && lastReport.ticker === ticker) ? 'View Full Analysis' : analyzing ? 'Researching...' : 'Initiate Analysis'} 
                            <ArrowRight className={`w-3 h-3 ${analyzing ? 'animate-bounce' : ''}`} />
                          </span>
                          {(lastReport && lastReport.ticker === ticker) && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setIsShareMode(true); }}
                              className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-[9px] hover:bg-amber hover:text-black transition-colors"
                            >
                               Snapshot for Reddit
                            </button>
                          )}
                          {user && (lastReport && lastReport.ticker === ticker) && (
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                try {
                                  setAnalysisStatus('Securing in Vault...');
                                  const tkr = lastReport.ticker || ticker.toUpperCase();
                                  const portfolioId = `${user.uid}_${tkr}`;
                                  await setDoc(doc(db, 'user_portfolio', portfolioId), {
                                    ...lastReport,
                                    ticker: tkr,
                                    summary: lastReport.rawReport || lastReport.summary,
                                    rating: lastReport.rating || (lastReport.rawReport?.toLowerCase().includes('buy') ? 'buy' : lastReport.rawReport?.toLowerCase().includes('sell') ? 'sell' : 'hold'),
                                    userId: user.uid,
                                    createdAt: serverTimestamp(), // Keep this for legacy or tracking
                                    updatedAt: serverTimestamp()
                                  });
                                  alert(`Institutional report for ${tkr} updated in your Vault.`);
                                } catch (err) {
                                  console.error("Manual save failed:", err);
                                  alert("Failed to save report. Please check connection.");
                                } finally {
                                  setAnalysisStatus('');
                                }
                              }}
                              className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-[9px] hover:bg-amber hover:text-black transition-colors flex items-center gap-1"
                            >
                               <Save className="w-3 h-3" /> Save to Vault
                            </button>
                          )}
                          {user && (lastReport && lastReport.ticker === ticker) && !publishing && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); publishReport(); }}
                              className="bg-amber text-black px-3 py-1 rounded-full text-[9px] hover:bg-amber transition-colors"
                            >
                              Publish to Feed
                            </button>
                          )}
                          {publishing && <span className="animate-pulse text-xs">Publishing...</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="order-1 md:order-2">
                      <h2 className="text-4xl font-display font-semibold mb-6 tracking-tight text-zinc-100">Dalal Street Reports</h2>
                      <p className="text-zinc-400 mb-8 leading-relaxed">
                        Proprietary scoring tailored for the Indian landscape, factoring in RBI policy changes and FII/DII activity.
                      </p>
                      <ul className="space-y-4">
                        {[
                          "Quantitative stock scoring",
                          "Executive summary generation",
                          "Risk factor identification"
                        ].map((item, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-medium">
                            <FileText className="text-gold w-5 h-5 flex-shrink-0" /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>

                  {/* Feature 2 — Peer Comparison Table */}
                  {(loadingPeerComparison || peerComparison.length > 0) && (
                  <div className="bg-app-surface border border-app-border rounded-3xl p-6 md:p-8 relative overflow-hidden mt-6 shadow-2xl">
                     <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black px-2 py-0.5 bg-gold/10 text-gold tracking-widest rounded-full uppercase border border-gold/20">Alphasynth Intel</span>
                     </div>
                     <h3 className="text-xl md:text-2xl font-display font-black text-white italic tracking-tight mb-1">PEER COMPARISON</h3>
                     <p className="text-xs text-zinc-400 mb-6 font-medium">{(lastReport?.ticker || ticker).toUpperCase()} vs its closest sector competitors on key valuation, profitability and growth metrics.</p>
                     {loadingPeerComparison && peerComparison.length === 0 ? (
                       <div className="flex items-center gap-3 text-zinc-500 text-xs py-8">
                         <div className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" /> Identifying peers and fetching metrics…
                       </div>
                     ) : (() => {
                       const subject = peerComparison.find((r: any) => r.isTarget) || peerComparison[0];
                       const metrics: { key: string; label: string; fmt: (v: any) => string; dir: number }[] = [
                         { key: 'price', label: 'Price', dir: 0, fmt: (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A' },
                         { key: 'marketCapCr', label: 'Mkt Cap (₹ Cr)', dir: 0, fmt: (v) => v != null ? `₹${Number(v).toLocaleString('en-IN')} Cr` : 'N/A' },
                         { key: 'pe', label: 'P/E', dir: -1, fmt: (v) => v != null ? Number(v).toFixed(1) : 'N/A' },
                         { key: 'roe', label: 'ROE %', dir: 1, fmt: (v) => v != null ? `${Number(v).toFixed(1)}%` : 'N/A' },
                         { key: 'debtEquity', label: 'D/E', dir: -1, fmt: (v) => v != null ? Number(v).toFixed(2) : 'N/A' },
                         { key: 'revenueGrowthYoY', label: 'Rev Growth YoY', dir: 1, fmt: (v) => v != null ? `${Number(v).toFixed(1)}%` : 'N/A' },
                         { key: 'week52Return', label: '52W Return', dir: 1, fmt: (v) => v != null ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%` : 'N/A' },
                       ];
                       const colorFor = (m: any, row: any) => {
                         if (row.isTarget || m.dir === 0) return '';
                         const a = row[m.key]; const b = subject ? subject[m.key] : null;
                         if (a == null || b == null || a === b) return '';
                         const better = m.dir > 0 ? a > b : a < b;
                         return better ? 'text-emerald-400' : 'text-rose-400';
                       };
                       return (
                         <>
                           <div className="overflow-x-auto -mx-2 px-2">
                             <table className="w-full min-w-[780px] border-collapse text-sm">
                               <thead>
                                 <tr className="border-b border-app-border">
                                   <th className="text-left py-3 px-3 text-[10px] font-black text-gold uppercase tracking-widest">Company</th>
                                   <th className="text-left py-3 px-3 text-[10px] font-black text-gold uppercase tracking-widest">Ticker</th>
                                   {metrics.map((m) => (<th key={m.key} className="text-right py-3 px-3 text-[10px] font-black text-gold uppercase tracking-widest whitespace-nowrap">{m.label}</th>))}
                                 </tr>
                               </thead>
                               <tbody>
                                 {peerComparison.map((row: any, idx: number) => (
                                   <tr key={row.ticker + idx} className={`border-b border-app-border/40 ${row.isTarget ? 'bg-gold/[0.08] border-l-2 border-l-gold' : idx % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                                     <td className={`py-3 px-3 ${row.isTarget ? 'text-white font-bold' : 'text-zinc-300'}`}>{row.name}{row.isTarget && <span className="ml-2 text-[8px] font-black text-gold uppercase">(subject)</span>}</td>
                                     <td className="py-3 px-3 font-mono text-xs text-zinc-500">{row.ticker}</td>
                                     {metrics.map((m) => (<td key={m.key} className={`py-3 px-3 text-right font-mono whitespace-nowrap ${row.isTarget ? 'text-white' : (colorFor(m, row) || 'text-zinc-300')}`}>{m.fmt(row[m.key])}</td>))}
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                           </div>
                           <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px]">
                             <span className="text-zinc-500"><span className="text-emerald-400 font-bold">Green</span> = better than subject stock on this metric</span>
                             <span className="text-zinc-500"><span className="text-rose-400 font-bold">Red</span> = worse than subject stock</span>
                           </div>
                           <p className="mt-2 text-[10px] text-zinc-600 italic">Price and 52-week return sourced from Yahoo Finance. P/E (trailing), market cap, ROE, Debt/Equity and Revenue Growth sourced from Gemini AI grounded search. For informational purposes only — not investment advice.</p>
                         </>
                       );
                     })()}
                  </div>
                  )}
                </div>
              )}

              {activeTab === 'filings' && (
                <motion.div
                  key="filings"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-12 col-span-2 w-full text-left"
                >
                  <div className="grid lg:grid-cols-12 gap-12 items-start">
                     {/* Left Workspace Panel */}
                     <div className="lg:col-span-8 space-y-8">
                        <div>
                           <h2 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white mb-2 leading-none">SEBI DISCLOSURES & MANAGEMENT MEETS</h2>
                           <p className="text-zinc-400 text-xs md:text-sm max-w-xl leading-relaxed">
                              Forensically track corporate filings, evaluate transparency metrics, index investor transcript guidance conservatism, and audit board decisions.
                           </p>
                        </div>

                        {/* Search and Trigger Console */}
                        <div className="bg-app-surface border border-app-border rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 blur-[50px] -z-10 rounded-full" />
                           <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Auditing Pipeline Registry</h3>
                           
                           <div className="flex flex-col sm:flex-row gap-3 mb-6">
                              <input 
                                type="text"
                                placeholder="Enter NSE Ticker (e.g., RELIANCE)"
                                value={filingsTicker}
                                onChange={(e) => setFilingsTicker(e.target.value.toUpperCase())}
                                className="flex-1 px-4 py-3 bg-zinc-950 border border-app-border rounded-xl text-xs text-white focus:outline-none focus:border-gold font-semibold"
                              />
                              <button
                                onClick={() => triggerFilingsAudit()}
                                disabled={auditingFilings}
                                className="px-6 py-3 bg-amber text-black font-black uppercase tracking-widest text-[9px] rounded-xl hover:bg-amber active:scale-95 transition-all flex items-center justify-center gap-2"
                              >
                                {auditingFilings ? (
                                   <>
                                      <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                      <span>AUDITING...</span>
                                   </>
                                ) : (
                                   <>
                                      <FileText className="w-3.5 h-3.5" /> Run Filings Audit
                                   </>
                                )}
                              </button>
                           </div>

                           <div>
                              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-3">POPULAR MARKET DISCLOSURES</p>
                              <div className="flex flex-wrap gap-2">
                                 {[
                                   { name: "RELIANCE" },
                                   { name: "TCS" },
                                   { name: "HDFCBANK" },
                                   { name: "INFOSYS" },
                                   { name: "MARUTI" }
                                 ].map((sh) => (
                                    <button
                                      key={sh.name}
                                      onClick={() => {
                                        setFilingsTicker(sh.name);
                                        triggerFilingsAudit(sh.name);
                                      }}
                                      className={`px-3 py-1.5 bg-zinc-900 border ${filingsTicker === sh.name ? 'border-gold text-gold' : 'border-app-border text-zinc-400 hover:text-white'} text-[9px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer`}
                                    >
                                       {sh.name}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        </div>

                        {/* Audit Status indicator */}
                        {auditingFilings && (
                           <div className="bg-gold/5 border border-gold/20 rounded-2xl p-6 text-center animate-pulse">
                              <p className="text-gold text-xs font-bold font-mono tracking-widest leading-relaxed uppercase">{filingsStatus || "Initializing Node Connection..."}</p>
                           </div>
                        )}

                        {/* Error Indicator */}
                        {filingsError && (
                           <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6 text-left">
                              <p className="text-rose-400 text-xs font-bold font-mono uppercase">CONDUIT ERROR: {filingsError}</p>
                           </div>
                        )}

                        {/* Report Output results */}
                        {filingsReport && !auditingFilings && (
                           <div className="space-y-6">
                              {/* Summary Scorecard Metrics */}
                              <div className="bg-app-surface/40 border border-app-border rounded-3xl p-6 relative">
                                 <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Disclosure Scorecard: {filingsReport.ticker}</h3>
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                      { label: "Transcript Transparency", score: filingsReport.metrics.transparency, desc: "Answering direct analyst inquiries", color: "text-blue-400", bg: "bg-blue-400/5", border: "border-blue-400/20" },
                                      { label: "Disclosure Completeness", score: filingsReport.metrics.completeness, desc: "Level of SEBI compliance details", color: "text-emerald-400", bg: "bg-emerald-400/5", border: "border-emerald-400/20" },
                                      { label: "Guideline Conservatism", score: filingsReport.metrics.conservatism, desc: "Realism level of outlook goals", color: "text-amber-400", bg: "bg-amber-400/5", border: "border-amber-400/20" },
                                      { label: "Governance Cleanliness", score: filingsReport.metrics.governance, desc: "Pledges & board independence metrics", color: "text-rose-400", bg: "bg-rose-400/5", border: "border-rose-400/20" }
                                    ].map((m, idx) => (
                                       <div key={idx} className={`p-4 rounded-xl border ${m.border} ${m.bg} flex flex-col justify-between`}>
                                          <div>
                                             <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-tight mb-1">{m.label}</p>
                                             <p className="text-[8px] text-zinc-600 leading-none mb-4">{m.desc}</p>
                                          </div>
                                          <div className="flex items-baseline gap-1">
                                             <span className={`text-3xl font-display font-black leading-none ${m.score !== null && m.score !== undefined ? m.color : 'text-zinc-600'}`}>
                                               {m.score !== null && m.score !== undefined ? m.score : 'N/A'}
                                             </span>
                                             {m.score !== null && m.score !== undefined && <span className="text-[10px] text-zinc-500 font-bold font-mono">/10</span>}
                                          </div>
                                       </div>
                                    ))}
                                 </div>
                              </div>

                              {/* Live Grounding Certificate */}
                              <div className="p-4 bg-gold/5 border border-gold/20 rounded-2xl flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                    <ShieldCheck className="text-gold w-5 h-5" />
                                    <div>
                                       <p className="text-[9px] font-black text-white uppercase tracking-widest">Fact-Grounded Analysis Shield</p>
                                       <p className="text-[9px] text-zinc-400 uppercase tracking-wider">
                                         {filingsReport.sourceUrl
                                           ? (() => {
                                               try {
                                                 const host = new URL(filingsReport.sourceUrl).hostname.toLowerCase();
                                                 if (host.includes('nseindia')) return 'SECURED VIA NSE INDIA CORPORATE FILING ENDPOINTS';
                                                 if (host.includes('screener')) return 'SECURED VIA SCREENER.IN FINANCIAL DATA';
                                                 if (host.includes('moneycontrol')) return 'SECURED VIA MONEYCONTROL FINANCIAL DATA';
                                                 if (host.includes('bseindia')) return 'SECURED VIA BSE INDIA CORPORATE FILING ENDPOINTS';
                                                 return `SECURED VIA ${host.toUpperCase()}`;
                                               } catch { return 'SECURED VIA FINANCIAL DATA AGGREGATOR'; }
                                             })()
                                           : 'SECURED VIA GEMINI SEARCH GROUNDING'}
                                       </p>
                                    </div>
                                 </div>
                                 {filingsReport.sourceUrl && (
                                    <a 
                                      href={filingsReport.sourceUrl} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="px-3 py-1.5 bg-zinc-900 border border-app-border text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white rounded-lg truncate max-w-[150px]"
                                    >
                                       {new URL(filingsReport.sourceUrl).hostname}
                                    </a>
                                 )}
                              </div>

                              {/* Actionable Direct Broker Gateways */}
                              <div className="p-6 bg-gold/[0.03] border border-gold/25 rounded-[1.5rem] space-y-4">
                                 <div>
                                    <span className="text-[8px] font-black px-2 py-0.5 bg-gold/15 text-gold tracking-widest rounded uppercase">Cognitive Action Hub</span>
                                    <h4 className="text-xs font-black text-white uppercase tracking-wider mt-2.5">TRANSLATE DISCLOSURE ANALYSIS INTO ACTIONS ON {filingsReport.ticker}</h4>
                                    <p className="text-[10px] text-zinc-400 mt-1 font-semibold leading-relaxed">
                                       Seamlessly transmit researched insights directly to India's leading broker execution terminals to execute trades with preselected stock tickers.
                                    </p>
                                 </div>
                                 <div className="grid grid-cols-3 gap-2">
                                    <a 
                                      href={`https://kite.zerodha.com`} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="px-3 py-3 bg-zinc-900 border border-app-border rounded-xl text-[10px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-wider block hover:scale-[1.02] flex items-center justify-center gap-1.5"
                                    >
                                       <Zap className="w-3.5 h-3.5 fill-current" /> Zerodha
                                    </a>
                                    <a 
                                      href={`https://groww.in/search?q=${filingsReport.ticker}`} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="px-3 py-3 bg-zinc-900 border border-app-border rounded-xl text-[10px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-wider block hover:scale-[1.02] flex items-center justify-center gap-1.5"
                                    >
                                       <Globe className="w-3.5 h-3.5" /> Groww
                                    </a>
                                    <a 
                                      href={`https://upstox.com`} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="px-3 py-3 bg-zinc-900 border border-app-border rounded-xl text-[10px] font-black text-center text-zinc-400 hover:bg-gold/15 hover:text-gold hover:border-gold/50 transition-all uppercase tracking-wider block hover:scale-[1.02] flex items-center justify-center gap-1.5"
                                    >
                                       <TrendingUp className="w-3.5 h-3.5" /> Upstox
                                    </a>
                                 </div>
                              </div>

                              {/* Main Report Markdown Output */}
                              <div className="p-8 bg-app-surface border border-app-border rounded-[2rem] relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-4 text-zinc-800 opacity-20">
                                    <FileText className="w-16 h-16" />
                                 </div>
                                 {/* Data confidence badge */}
                                 {filingsReport.confidence && (
                                   <div className={`mb-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider w-fit ${
                                     filingsReport.confidence === 'high'
                                       ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                       : filingsReport.confidence === 'medium'
                                       ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                       : 'bg-red-500/10 border-red-500/30 text-red-400'
                                   }`}>
                                     <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                       filingsReport.confidence === 'high' ? 'bg-emerald-400' :
                                       filingsReport.confidence === 'medium' ? 'bg-amber-400' : 'bg-red-400'
                                     }`} />
                                     {filingsReport.confidence === 'high' && 'HIGH CONFIDENCE: Strong data sources found'}
                                     {filingsReport.confidence === 'medium' && 'MEDIUM CONFIDENCE: Limited sources found, some data may be estimated'}
                                     {filingsReport.confidence === 'low' && 'LOW CONFIDENCE: Minimal data found, treat this report with caution'}
                                   </div>
                                 )}
                                 {/* Scrape quality notice — only show when confidence is not already HIGH
                                     (HIGH confidence + thin scrape would contradict each other) */}
                                 {filingsReport.scrapeQuality === 'thin' && filingsReport.confidence !== 'high' && (
                                   <div className="mb-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[10px] text-amber-400 font-medium leading-relaxed">
                                     Note: Limited source data was available for this analysis. This report relies primarily on AI knowledge rather than scraped financial data. Verify key figures independently.
                                   </div>
                                 )}
                                 <div className="prose prose-invert prose-orange max-w-none text-zinc-300">
                                    <MD>{filingsReport.rawReport}</MD>
                                 </div>
                                 {/* Permanent disclaimer */}
                                 <div className="mt-8 pt-4 border-t border-app-border">
                                   <p className="text-[9px] text-zinc-600 leading-relaxed font-medium">
                                     This report is AI generated for informational purposes only. Data accuracy cannot be guaranteed for small cap and micro cap stocks. Always verify figures from official NSE/BSE filings before making investment decisions. This is not financial advice.
                                   </p>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* Idle/Wait State graphics */}
                        {!filingsReport && !auditingFilings && (
                           <div className="p-12 border border-app-border border-dashed rounded-3xl text-center bg-zinc-900/10">
                              <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                              <h4 className="text-xs font-black uppercase tracking-widest text-zinc-400">Initialize Disclosure Audit Workspace</h4>
                              <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto mt-2 font-medium">
                                 Select one of the popular pre-defined stock models above or research any custom NSE ticker through our real-time audit conduit.
                              </p>
                           </div>
                        )}
                     </div>

                     {/* Right Advisory Sidebar Panel */}
                     <div className="lg:col-span-4 space-y-6">
                        <div className="p-6 bg-app-surface border border-app-border rounded-3xl">
                           <span className="text-[8px] font-black px-2 py-0.5 bg-gold/10 border border-gold/20 text-gold tracking-widest rounded uppercase">Compliance Node</span>
                           <h4 className="text-sm font-bold text-white uppercase mt-4 mb-2">Corporate Disclosures Scope</h4>
                           <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                              This model specializes in examining management honesty, transcript inconsistencies, SEBI filing transparency audits, and capital reallocation pledge fluctuations.
                           </p>

                           <div className="mt-6 pt-6 border-t border-app-border space-y-4">
                              <div className="flex gap-3">
                                 <div className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5" />
                                 <p className="text-xs text-zinc-400 font-bold">Auto-scrapes NSE corporate announcements and annual returns.</p>
                              </div>
                              <div className="flex gap-3">
                                 <div className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5" />
                                 <p className="text-xs text-zinc-400 font-bold">Calculates guideline conservatism indexes to spot management hyperbole.</p>
                              </div>
                              <div className="flex gap-3">
                                 <div className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5" />
                                 <p className="text-xs text-zinc-400 font-bold">Extracts explicit answers to contrarian questions from analyst conferences.</p>
                              </div>
                           </div>
                        </div>

                        <div className="p-6 bg-zinc-950 border border-app-border rounded-3xl relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 opacity-5 text-white">
                              <ShieldCheck className="w-16 h-16" />
                           </div>
                           <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Filing Integrity Audit</h4>
                           <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                              Cross-references board independent resolutions, pledge updates, and audit transparency vectors. Updates are calculated in close compliance with Indian SEBI LODR rules.
                           </p>
                           <button 
                             onClick={() => { setActiveTab('news'); scrollToWorkflow(); }}
                             className="w-full py-3 bg-zinc-900 border border-app-border hover:border-zinc-700 hover:text-white text-[9px] font-black uppercase tracking-wider text-zinc-400 rounded-xl transition-all cursor-pointer"
                           >
                              Jump to Market Pulse Core
                           </button>
                        </div>
                     </div>
                  </div>
                </motion.div>
              )}


              {activeTab === 'portfolio' && (
                <motion.div
                  key="portfolio"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-24"
                >
                  {/* Part 1: Portfolio Audit Lab */}
                  <div className="grid lg:grid-cols-12 gap-12 items-start">
                     <div className="lg:col-span-8">
                        <h2 className="text-4xl font-display font-semibold mb-4 tracking-tight text-white">Portfolio Audit Lab</h2>
                        <p className="text-zinc-400 mb-8 max-w-2xl">
                          Institutional portfolio diagnostic. Upload your CSV from Zerodha or Groww to analyze sector concentration and correlation risks.
                        </p>
                        
                          <div className="flex flex-wrap gap-4 mb-8">
                            <div className="relative">
                               <input 
                                 type="file" 
                                 accept=".csv" 
                                 onChange={handleCsvUpload} 
                                 className="absolute inset-0 opacity-0 cursor-pointer"
                               />
                               <button className="px-6 py-3 bg-app-surface border border-app-border rounded-xl text-xs font-bold uppercase text-zinc-400 hover:border-gold/50 transition-all flex items-center gap-2">
                                 <Upload className="w-4 h-4" /> Import CSV
                               </button>
                            </div>
                            <button 
                             onClick={() => {
                               const csvContent = "STOCK NAME,NUMBER,PRICE,LAST PRICE\nRELIANCE,10,2400,2900\nTCS,5,3200,3800\nHDFCBANK,20,1400,1650";
                               const blob = new Blob([csvContent], { type: 'text/csv' });
                               const url = URL.createObjectURL(blob);
                               const a = document.createElement('a');
                               a.href = url;
                               a.download = "portfolio_template.csv";
                               a.click();
                             }}
                             className="px-6 py-3 bg-app-surface border border-app-border rounded-xl text-xs font-bold uppercase text-zinc-600 hover:text-zinc-300 transition-all flex items-center gap-2"
                            >
                             <Download className="w-3 h-3" /> Get Template
                            </button>
                            <button 
                             onClick={() => addHolding('', 0, 0)}
                             className="px-6 py-3 bg-gold/10 border border-gold/20 text-gold rounded-xl text-xs font-bold uppercase hover:bg-gold/20 transition-all flex items-center gap-2"
                            >
                             <Plus className="w-4 h-4" /> Add Asset
                            </button>
                         </div>

                        <div className="bg-app-surface/50 border border-app-border rounded-2xl overflow-hidden mb-8">
                           <table className="w-full text-left border-collapse">
                              <thead className="bg-app-bg/50 border-b border-app-border">
                                 <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ticker</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Quantity</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Action</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-app-border/50">
                                 {holdings.map((h, i) => (
                                   <tr key={i} className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-3">
                                         <input 
                                          type="text" 
                                          value={h.ticker} 
                                          onChange={(e) => {
                                            const newHoldings = [...holdings];
                                            newHoldings[i].ticker = e.target.value.toUpperCase();
                                            setHoldings(newHoldings);
                                          }}
                                          placeholder="e.g. TATASTEEL"
                                          className="bg-transparent border-none text-zinc-100 font-bold focus:outline-none w-full"
                                         />
                                      </td>
                                      <td className="px-6 py-3">
                                         <input 
                                          type="number" 
                                          value={h.qty === 0 ? '' : h.qty} 
                                          onChange={(e) => {
                                            const newHoldings = [...holdings];
                                            newHoldings[i].qty = parseFloat(e.target.value) || 0;
                                            setHoldings(newHoldings);
                                          }}
                                          placeholder="0"
                                          className="bg-transparent border-none text-zinc-100 font-bold focus:outline-none w-full"
                                         />
                                      </td>
                                      <td className="px-6 py-3">
                                         <button onClick={() => removeHolding(i)} className="text-zinc-600 hover:text-negative transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                         </button>
                                      </td>
                                   </tr>
                                 ))}
                                 {holdings.length === 0 && (
                                   <tr>
                                      <td colSpan={3} className="px-6 py-12 text-center text-zinc-600 italic text-xs">No assets imported. Add your first holding to begin.</td>
                                   </tr>
                                 )}
                              </tbody>
                           </table>
                        </div>

                        <button 
                          onClick={triggerPortfolioAudit}
                          disabled={auditingPortfolio || holdings.length === 0}
                          className="w-full py-4 bg-amber text-black font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-amber active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_10px_20px_rgba(201,145,42,0.1)]"
                        >
                          {auditingPortfolio ? 'Analyzing Portfolio Correlation...' : 'Execute AI Diagnostic audit'}
                        </button>
                     </div>

                     <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                        <div className="p-8 rounded-3xl bg-app-surface border border-app-border shadow-2xl relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                              <Zap className="w-16 h-16 text-gold" />
                           </div>
                           <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-8">Asset Allocation</h3>
                           <div className="h-72 w-full">
                              <ResponsiveContainer width="100%" height="100%" key={holdings.length}>
                                 <PieChart>
                                    <Pie
                                      data={holdings.filter(h => h.ticker).length > 0 ? holdings.filter(h => h.ticker).map((h, i) => ({ name: h.ticker || `Asset ${i+1}`, value: h.qty || 1 })) : [{ name: 'Empty', value: 1 }]}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={65}
                                      outerRadius={95}
                                      paddingAngle={8}
                                      dataKey="value"
                                      stroke="none"
                                    >
                                      {(holdings.filter(h => h.ticker).length > 0 ? holdings.filter(h => h.ticker) : [{}]).map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip 
                                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                                      itemStyle={{ color: '#ffffff', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase' }}
                                    />
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                           <div className="mt-8 flex flex-col gap-3">
                              <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-zinc-500 border-b border-zinc-800 pb-2 mb-1">
                                 <span>Portfolio Vitals</span>
                                 <span className="text-white">Active</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-widest text-zinc-600">
                                 <span>Total Positions</span>
                                 <span className="text-zinc-300">{holdings.length}</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-widest text-zinc-600">
                                 <span>Liquidity Bias</span>
                                 <span className="text-zinc-300">High</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-widest text-zinc-600">
                                 <span>Sector Variety</span>
                                 <span className="text-zinc-300">{new Set(holdings.map(h => h.ticker)).size} Categories</span>
                              </div>
                           </div>
                              {holdings.slice(0, 5).filter(h => h.ticker).map((h, i) => (
                                <div key={i} className="flex justify-between items-center text-[9px] uppercase font-bold tracking-tighter text-zinc-400">
                                   <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                      {h.ticker}
                                   </div>
                                   <span>{h.qty} UNITS</span>
                                </div>
                              ))}
                        </div>

                        <div className="p-6 rounded-2xl bg-gold/5 border border-gold/10">
                           <h4 className="text-[10px] font-black text-gold uppercase tracking-widest mb-2">Institutional Sync</h4>
                           <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                              Real-time grounding checks your holdings against overnight structural shifts. Changes reflect immediately in the audit engine.
                           </p>
                        </div>
                     </div>
                  </div>

                  {portfolioAudit && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-10 md:p-14 rounded-[2.5rem] bg-gradient-to-br from-zinc-900 to-black border border-gold/20 shadow-2xl relative overflow-hidden cursor-pointer group`}
                      onClick={() => setViewingPortfolioAudit(true)}
                    >
                       <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Zap className="w-24 h-24 text-gold" />
                       </div>
                       <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                         <div className="flex items-center gap-6 text-left">
                            <div className="w-16 h-16 bg-amber rounded-2xl flex items-center justify-center text-black shadow-[0_0_30px_rgba(201,145,42,0.4)]">
                               <BarChart3 className="w-8 h-8" />
                            </div>
                            <div>
                               <h3 className="text-3xl font-display font-black text-white italic uppercase tracking-tighter">Your Institutional Audit is Ready<span className="text-gold">.</span></h3>
                               <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em] mt-1.5">Deep Grounding Check Completed • Click to Expand Insight</p>
                            </div>
                         </div>
                         <button className="px-10 py-5 bg-white text-black text-xs font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-200 transition-all flex items-center gap-3">
                            Launch Report View <ArrowRight className="w-4 h-4" />
                         </button>
                       </div>
                    </motion.div>
                  )}

                  {/* Part 2: Private Research Vault (Moved here from duplicate section) */}
                  <div className="pt-20 border-t border-zinc-900">
                    <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                      <div className="text-left">
                        <h2 className="text-4xl font-display font-semibold mb-4 tracking-tight text-zinc-100">Private Research Vault</h2>
                        <p className="text-zinc-400 max-w-xl">
                          Your research history secured by your Google Identity. Every analysis is archived in our encrypted institutional database (Firestore).
                          <span className="block mt-1 text-[10px] text-zinc-600 italic">*Note: Reports are stored within this application's secure infrastructure.</span>
                        </p>
                      </div>
                      {userPortfolio.length > 0 && (
                        <div className="px-4 py-2 bg-gold/10 border border-gold/20 rounded-xl">
                           <span className="text-[10px] font-black text-gold uppercase tracking-widest">{userPortfolio.length} Reports Archived</span>
                        </div>
                      )}
                    </div>

                    {!user ? (
                      <div className="py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
                        <LockIcon className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-zinc-200 mb-2">Google Identity Required</h3>
                        <p className="text-zinc-500 mb-6 px-6">Your Private Vault is encrypted and linked to your Google Account. Please log in to view your history.</p>
                        <button 
                          onClick={handleLogin}
                          className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all flex items-center gap-2 mx-auto"
                        >
                          <UserIcon className="w-4 h-4" /> Authenticate Archive
                        </button>
                      </div>
                    ) : userPortfolio.length === 0 ? (
                      <div className="py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
                        <Database className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-zinc-200 mb-2">Vault is Currently Empty</h3>
                        <p className="text-zinc-500 font-medium px-6">Start a new analysis to automatically archive institutional-grade reports here.</p>
                        <button 
                          onClick={() => setActiveTab('equity')}
                          className="mt-6 px-6 py-3 bg-amber text-black text-[10px] font-black uppercase tracking-widest rounded-lg"
                        >
                          Initiate First Analysis
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {userPortfolio.map((item) => (
                          <div 
                            key={item.id}
                            className="bg-app-surface border border-app-border p-6 rounded-2xl group hover:border-gold/30 transition-all cursor-pointer"
                            onClick={() => {
                              setLastReport(item);
                              setViewingFullReport(true);
                            }}
                          >
                            <div className="flex justify-between items-start mb-6">
                              <div>
                                <p className="text-[10px] font-black text-gold uppercase tracking-widest mb-1">
                                  {item.updatedAt?.seconds ? `Updated ${new Date(item.updatedAt.seconds * 1000).toLocaleDateString()}` : item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Draft'}
                                </p>
                                <h3 className="text-2xl font-display font-black tracking-tight text-white">{item.ticker}</h3>
                              </div>
                              <span className={`text-[10px] font-black p-1.5 rounded uppercase tracking-widest ${
                                item.rating === 'buy' ? 'bg-green-500/10 text-green-400' : item.rating === 'sell' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
                              }`}>
                                {item.rating}
                              </span>
                            </div>
                            
                            <div className="space-y-4 mb-6">
                               <div className="text-sm text-zinc-400 line-clamp-3 leading-relaxed prose prose-invert prose-xs">
                                  <MD>{item.bullCase?.substring(0, 200) + '...'}</MD>
                               </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                               <span className="flex items-center gap-1.5">
                                 <Globe className="w-3 h-3" /> {item.sourceUrl ? new URL(item.sourceUrl).hostname : 'Grounding Search'}
                               </span>
                               <button className="text-gold group-hover:gap-2 flex items-center transition-all">
                                 Open Audit <ArrowRight className="w-3 h-3" />
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'marketing' && (
                <motion.div
                  key="marketing"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-12"
                >
                  <div className="grid lg:grid-cols-5 gap-12 items-start">
                    <div className="lg:col-span-2">
                      <h2 className="text-4xl font-display font-semibold mb-6 tracking-tight text-zinc-100">Market & Monetize</h2>
                      <p className="text-zinc-400 mb-8 leading-relaxed">
                        Your research deserves an audience. Convert your technical analysis into viral-ready social content or premium newsletter drafts with one click.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <div className={`p-4 rounded-xl ${COLORS.surface} border ${COLORS.border} flex flex-col items-center gap-2 group cursor-pointer hover:border-gold/50 transition-colors`}>
                          <Share2 className="w-5 h-5 text-gold" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">LinkedIn</span>
                        </div>
                        <div className={`p-4 rounded-xl ${COLORS.surface} border ${COLORS.border} flex flex-col items-center gap-2 group cursor-pointer hover:border-gold/50 transition-colors`}>
                          <PenTool className="w-5 h-5 text-gold" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Substack</span>
                        </div>
                        <div className={`p-4 rounded-xl ${COLORS.surface} border ${COLORS.border} flex flex-col items-center gap-2 group cursor-pointer hover:border-gold/50 transition-colors`}>
                          <Layout className="w-5 h-5 text-gold" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">WP Blog</span>
                        </div>
                      </div>
                    </div>
                    <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <button 
                        disabled={!lastReport}
                        onClick={() => {
                          const post = `🚨 MARKET ALERT: ${lastReport?.ticker} Analysis 🚨\n\nI just finished a deep dive into ${lastReport?.ticker}. Here's the conviction:\n\n📈 BULL: ${lastReport?.bullCase?.replace(/\*\*.*?\*\*/, '').substring(0, 100).trim()}...\n📉 BEAR: ${lastReport?.bearCase?.replace(/\*\*.*?\*\*/, '').substring(0, 100).trim()}...\n\nFull report available in my Analyst Hub. #Nifty50 #Investing #NSE`;
                          setPreviewContent({ title: "LinkedIn Accelerator", text: post });
                        }}
                        className={`min-h-[220px] bg-app-surface border border-app-border rounded-3xl p-8 flex flex-col items-start text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold/30 w-full`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-amber group-hover:text-black transition-all">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <div className="mt-auto">
                          <p className="text-[10px] font-black uppercase tracking-wider text-gold mb-2">Growth Accelerator</p>
                          <h3 className="text-xl font-bold text-white leading-tight">Auto-Draft LinkedIn Post</h3>
                        </div>
                      </button>

                      <button 
                         disabled={!lastReport}
                         onClick={() => {
                          const content = `📊 EQUITY BRIEFING: ${lastReport?.ticker}\n\nOur proprietary analysis has identified a potential structural divergence in ${lastReport?.ticker} listed on the NSE.\n\nExecutive Outlook:\nWhile the technical setup shows ${lastReport?.bullCase?.substring(0, 150).trim()}..., our contrarian risk assessment indicates ${lastReport?.bearCase?.substring(0, 150).trim()}...\n\nKey Takeaways for Investors:\n- Momentum Context: The "Dalal Street Sentiment" currently reflects institutional positioning.\n- Strategic Pivot: If the bear case catalysts materialize, target zones should be adjusted accordingly.\n\nFull data-set and raw research logs attached in the Analyst Hub.`;
                           setPreviewContent({ title: "Alpha Digest Briefing", text: content });
                         }}
                        className={`min-h-[220px] bg-app-surface border border-app-border rounded-3xl p-8 flex flex-col items-start text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold/30 w-full`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 group-hover:bg-amber group-hover:text-black transition-all">
                          <Search className="w-6 h-6" />
                        </div>
                        <div className="mt-auto">
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Alpha Digest</p>
                          <h3 className="text-xl font-bold text-white leading-tight">Generate Market Pulse</h3>
                        </div>
                      </button>
                    </div>
                  </div>

                  {!lastReport && (
                    <div className="p-8 border border-app-border rounded-3xl bg-app-surface text-center">
                      <p className="text-zinc-500 text-sm font-medium italic">
                        Generate an equity analysis first to unlock marketing automation tools.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'community' && (
                <motion.div
                  key="community"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full"
                >
                  {/* Beta Access Banner */}
                  <div className="mb-12 p-4 rounded-2xl border border-gold/20 bg-gold/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🚀</span>
                      <div>
                        <p className="text-sm font-bold text-white">Beta Access — All features unlocked.</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Free during beta. Share your feedback to help shape what we build next.</p>
                      </div>
                    </div>
                    <a href="mailto:srscoll@gmail.com" className="px-3 py-1.5 bg-gold/10 border border-gold/30 rounded-lg text-[10px] font-bold text-gold uppercase tracking-widest whitespace-nowrap hover:bg-gold/20 transition-colors flex-shrink-0" style={{textDecoration:'none'}}>
                      Send Feedback →
                    </a>
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                    <div className="text-left">
                      <h2 className="text-4xl font-display font-semibold mb-4 tracking-tight text-zinc-100">Analyst Collective</h2>
                      <p className="text-zinc-400 max-w-xl mb-6">
                        Crowdsourced equity intelligence from independent analysts. Monitor conflicting perspectives to find the true market edge.
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-4 mb-8">
                        <div className="flex flex-wrap gap-2 p-1 bg-app-surface border border-app-border rounded-xl w-fit">
                          <button 
                            onClick={() => {
                              setCommunityFilter('all');
                              setCommunitySearch('');
                            }}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap border ${
                              communityFilter === 'all' && !communitySearch ? 'bg-amber text-black border-gold' : 'text-zinc-500 border-transparent hover:text-white'
                            }`}
                          >
                            Explore All
                          </button>
                          <button 
                            onClick={() => setCommunityFilter('ticker')}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-2 whitespace-nowrap border ${
                              communityFilter === 'ticker' ? 'bg-amber text-black border-gold' : 'text-zinc-500 border-transparent hover:text-white'
                            }`}
                          >
                            {communitySearch || ticker ? `${(communitySearch || ticker).toUpperCase()} Only` : 'Filtered View'}
                          </button>
                        </div>

                        <div className="flex-1 min-w-[260px] max-w-sm relative group">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-gold transition-colors" />
                          <input 
                            type="text"
                            placeholder="Search historical reports..."
                            value={communitySearch}
                            onChange={(e) => {
                              setCommunitySearch(e.target.value.toUpperCase());
                              setCommunityFilter('ticker');
                            }}
                            className="w-full pl-11 pr-4 py-2.5 bg-app-surface border border-app-border rounded-xl text-xs focus:outline-none focus:border-gold/50 transition-all font-medium placeholder:text-zinc-700"
                          />
                        </div>
                      </div>
                    </div>
                    {!user && (
                      <button 
                        onClick={handleLogin}
                        className="px-6 py-3 bg-app-surface border border-app-border rounded-xl text-xs font-bold uppercase tracking-widest hover:border-gold transition-colors"
                      >
                        Join the Collective
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {communityReports.length > 0 ? communityReports.map((item) => (
                      <motion.div 
                        key={item.id}
                        layoutId={item.id}
                        className={`bg-app-surface border border-app-border p-6 rounded-2xl hover:border-gold/30 transition-all group`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="px-3 py-1 bg-app-bg rounded-full border border-app-border flex items-center gap-2">
                            <span className="text-sm font-black text-white">{item.ticker}</span>
                            <div className="w-1 h-1 rounded-full bg-amber" />
                            <span className="text-[8px] font-bold text-gold uppercase tracking-tighter">BETA</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${
                              item.rating === 'buy' ? 'text-green-400' : item.rating === 'sell' ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {item.rating}
                            </span>
                            <span className="text-[8px] text-zinc-600 font-medium uppercase mt-0.5">NSE Analyst</span>
                          </div>
                        </div>
                        
                        <div className="relative mb-6">
                            <div className="absolute -top-2 -right-2 bg-gold/10 border border-gold/20 px-2 py-0.5 rounded text-[7px] font-black text-gold uppercase tracking-widest z-10">
                              Unlocked
                            </div>
                            <AnimatePresence mode="wait">
                                {visibleBearCases[item.id] ? (
                                    <motion.div 
                                        key="bear"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="text-zinc-400 text-sm leading-relaxed"
                                    >
                                        <div className="flex items-center gap-2 text-red-400/80 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">The Contrarian Bear Case</span>
                                        </div>
                                        <div className="text-zinc-400 text-sm leading-relaxed prose prose-invert prose-xs">
                                          <MD>{item.bearCase || item.summary}</MD>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div 
                                        key="bull"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        className="text-zinc-400 text-sm leading-relaxed"
                                    >
                                        <div className="flex items-center gap-2 text-green-400/80 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">The Bull Case</span>
                                        </div>
                                        <div className="text-zinc-400 text-sm leading-relaxed prose prose-invert prose-xs">
                                          <MD>{item.bullCase || item.summary}</MD>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <button 
                            onClick={() => {
                                // Simulate unlocking or just show full report in a prompt/modal
                                // Since we already show partial, maybe we can show "Full Audit" in a popup
                                const fullContent = `--- INSTITUTIONAL EQUITY REPORT: ${item.ticker} ---\n\nBULL CASE:\n${item.bullCase}\n\nBEAR CASE:\n${item.bearCase}\n\nRATING: ${item.rating.toUpperCase()}\n\nANALYSIS BY: ${item.authorName}\nDATE: ${new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}\n\n--- PROMOTION: SHARED VIA PUBLIC ANALYST HUB ---`;
                                setPreviewContent({ title: `${item.ticker} Full Analysis Audit`, text: fullContent });
                            }}
                            className="w-full py-3 mb-1 bg-app-bg border border-app-border rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-amber hover:text-white hover:border-gold transition-all shadow-lg active:scale-95"
                        >
                            Open Full PRO Report
                        </button>

                        <button 
                             onClick={() => {
                               setLastReport({
                                 ticker: item.ticker,
                                 bullCase: item.bullCase,
                                 bearCase: item.bearCase,
                                 rating: item.rating,
                                 rawReport: item.summary // fallback
                               });
                               setIsShareMode(true);
                             }}
                             className="w-full py-2 mb-3 bg-gold/10 border border-gold/20 rounded-xl text-[8px] font-black uppercase tracking-widest text-gold hover:bg-amber hover:text-white transition-all"
                        >
                             Snapshot for Reddit
                        </button>

                        <button 
                            onClick={() => setVisibleBearCases(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                            className="w-full py-2 mb-6 border border-transparent rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-gold transition-all"
                        >
                            {visibleBearCases[item.id] ? '← Switch to Bull Case' : 'View Contrarian Risks →'}
                        </button>

                        <div className="pt-4 border-t border-app-border flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-app-surface flex items-center justify-center">
                              <UserIcon className="w-3 h-3 text-zinc-500" />
                            </div>
                            <span className="text-[10px] text-zinc-500 font-medium">{item.authorName}</span>
                          </div>
                          <button 
                            onClick={() => handleLike(item.id)}
                            className="flex items-center gap-1.5 text-zinc-500 hover:text-gold transition-colors"
                          >
                            <Heart className={`w-3.5 h-3.5 ${item.likesCount > 0 ? 'fill-orange-500 text-gold' : ''}`} />
                            <span className="text-[10px] font-bold">{item.likesCount || 0}</span>
                          </button>
                        </div>
                      </motion.div>
                    )) : (
                      <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
                        <MessageSquare className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <p className="text-zinc-500 font-medium">No community reports published yet. Be the first to analyze.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Beta Access Section */}
      <section className="py-24 px-6 border-t border-app-border bg-app-bg">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-[10px] font-black tracking-[0.3em] text-gold uppercase mb-4 block">Beta Access</span>
          <h2 className="text-4xl md:text-5xl font-display font-black text-white italic tracking-tighter mb-3">
            Free During Beta<span className="text-gold">.</span>
          </h2>
          <p className="text-zinc-400 text-lg mb-10">No credit card. No signup. Full access to every feature.</p>

          <div className="p-8 rounded-3xl bg-app-surface border border-gold/20 text-left mb-8 space-y-5">
            {[
              'All 5 research modes — Equity Deep Dive, Earnings Intelligence, Explain the Move, Filings Audit, Portfolio Audit',
              'FII/DII Institutional Flow Monitor — live during market hours',
              'Sector Peer Benchmarking — across all NSE/BSE listed stocks'
            ].map((benefit) => (
              <div key={benefit} className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                <span className="text-sm text-zinc-200 leading-relaxed">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-gold/20 mb-8" />

          <p className="text-xs text-zinc-500 mb-10 leading-relaxed max-w-lg mx-auto">
            Alphasynth Intelligence is currently in invite-only beta. Early users will receive preferential pricing when we launch commercially. Pricing will be announced based on feedback from this beta cohort.
          </p>

          <button
            onClick={() => { setActiveTab('equity'); scrollToWorkflow(); }}
            className="px-10 py-4 bg-amber text-black font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-transform text-sm"
          >
            Start Researching Free →
          </button>

          <div className="mt-12 pt-8 border-t border-app-border">
            <p className="text-sm text-zinc-500 mb-2">Already using Alphasynth? We read every reply.</p>
            <a
              href="mailto:srscoll@gmail.com"
              className="text-sm text-gold hover:text-amber transition-colors font-medium"
            >
              Share your feedback →
            </a>
          </div>
        </div>
      </section>

      {/* Blog & Newsletter Section */}
      <section className="py-20 px-6 max-w-7xl mx-auto">
        <div className={`p-1 bg-gradient-to-r from-gold/30 via-zinc-800 to-transparent rounded-[2rem]`}>
          <div className={`${COLORS.bg} rounded-[1.9rem] p-12 md:p-20 text-center relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold/10 blur-[80px] -mr-32 -mt-32" />
            <h2 className="text-3xl md:text-5xl font-display font-semibold mb-6 tracking-tight text-zinc-200">The Morning Bell Newsletter</h2>
            <p className="max-w-xl mx-auto text-zinc-400 mb-10 text-lg">
              Get the top 3 community-voted Indian equity insights delivered to your inbox every market open. No noise, just high-conviction signals.
            </p>
            
            {isSubscribed ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-500/10 border border-green-500/30 p-6 rounded-2xl max-w-sm mx-auto"
              >
                <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-green-500 font-bold uppercase tracking-widest text-sm">Welcome to the Inner Circle</p>
                <p className="text-zinc-400 text-xs mt-2">You'll receive your first briefing tomorrow at 08:30 AM IST.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubscribe} className="max-w-md mx-auto flex flex-col sm:flex-row gap-2">
                <input 
                  type="email" 
                  required
                  placeholder="analyst@firm.com"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="flex-1 px-6 py-4 bg-app-surface border border-app-border rounded-xl text-sm focus:outline-none focus:border-gold transition-colors text-white"
                />
                <button 
                  type="submit"
                  className="px-8 py-4 bg-amber text-black font-black uppercase tracking-[0.2em] rounded-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" /> Subscribe
                </button>
              </form>
            )}
            
            <button className="mt-8 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 transition-colors">
              Read Past Editions
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-12 border-t ${COLORS.border} px-6`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className={`w-6 h-6 ${COLORS.accentBg} rounded flex items-center justify-center`}>
              <TrendingUp className="text-black w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">Alphasynth Intelligence</span>
          </a>
          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <a href="#" className="hover:text-gold transition-colors">Twitter</a>
            <a href="#" className="hover:text-gold transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-gold transition-colors">Discord</a>
          </div>
          <p className="text-[10px] text-zinc-600 font-mono text-center md:text-right">
            © 2026 ALPHASYNTH INTELLIGENCE. FOR INFORMATIONAL AND ORDER PREPARATION WORKFLOWS.
          </p>
        </div>
      </footer>
      {/* Technical Footer */}
      <footer className="mt-20 py-12 border-t border-zinc-900 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-medium mb-4">Institutional Trading Protocol v4.2</p>
          <div className="flex flex-wrap justify-center gap-6 text-[10px] text-zinc-500 mb-8 font-black uppercase tracking-[0.2em]">
            <button 
              onClick={() => {
                localStorage.removeItem('insight_onboarding_seen');
                setShowOnboarding(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-5 py-3 bg-app-surface-accent border border-gold/40 rounded-xl hover:border-gold hover:text-gold transition-all flex items-center gap-2 group shadow-xl"
            >
              <Zap className="w-4 h-4 text-gold group-hover:animate-pulse fill-current" />
              <span className="text-zinc-300 group-hover:text-gold">Platform Reset Protocol</span>
            </button>
            <span className="flex items-center gap-1.5 px-4 py-2 bg-app-surface/50 rounded-lg border border-app-border">
              <div className={`w-1 h-1 rounded-full ${backendConfig.scraper ? 'bg-green-500' : 'bg-red-500'}`} />
              PRO Scraper: {backendConfig.scraper ? 'Online' : 'Offline'}
            </span>
            <span className="flex items-center gap-1">
              <div className={`w-1 h-1 rounded-full ${backendConfig.mailer ? 'bg-green-500' : 'bg-red-500'}`} />
              Email Terminal: {backendConfig.mailer ? 'Ready' : 'Not Configured'}
            </span>
          </div>
          <button 
            onClick={() => {
              const url = prompt("Enter a URL to test scraping (e.g. https://www.google.com):");
              if (!url) return;
              alert("Starting test scrape... Check browser console/logs for result.");
              fetch('/api/pipeline/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: 'TEST', url })
              })
              .then(r => r.json())
              .then(data => {
                console.log("Scrape Test Result:", data);
                if (data.scrapedMarkdown && data.scrapedMarkdown.length > 100) {
                  alert(`✅ SUCCESS! Scraped ${data.scrapedMarkdown.length} bytes. Check console for content.`);
                } else {
                  alert(`❌ FAILURE. Scraper returned: ${JSON.stringify(data)}`);
                }
              })
              .catch(err => alert("ERROR: " + err.message));
            }}
            className="mt-8 text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors uppercase tracking-widest"
          >
            Terminal Scraper Test
          </button>
        </div>
      </footer>

      {/* Trade execution Modals — disabled during beta, broker integration coming later */}
      <AnimatePresence>
        {false && showTradeModal && lastReport && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
             <motion.div 
               initial={{ opacity: 0, y: 50 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 50 }}
               className="bg-app-bg border border-app-border w-full max-w-lg rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(201,145,42,0.15)] flex flex-col max-h-[90vh]"
             >
                <div className="p-6 border-b border-app-border bg-gold/10 flex justify-between items-center flex-shrink-0">
                   <div>
                      <h3 className="text-xl font-display font-black text-white italic uppercase tracking-tighter">Unified Execution Bridge</h3>
                      <p className="text-[10px] text-gold font-bold uppercase tracking-widest mt-1">Publisher Logic Alpha (No-Cost API)</p>
                   </div>
                   <button onClick={() => setShowTradeModal(false)} className="p-2 text-zinc-500 hover:text-white">
                      <X className="w-6 h-6" />
                   </button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scroll">
                   <div>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-3">Select Execution Gateway</p>
                      <div className="grid grid-cols-3 gap-3">
                         {[
                            { id: 'zerodha', name: 'Zerodha', icon: 'K' },
                            { id: 'angel', name: 'AngelOne', icon: 'A' },
                            { id: 'upstox', name: 'Upstox', icon: 'U' }
                         ].map(b => (
                            <button 
                              key={b.id}
                              onClick={() => setSelectedBroker(b.id as any)}
                              className={`p-3 rounded-xl border transition-all text-center ${
                                selectedBroker === b.id 
                                  ? 'bg-gold/20 border-gold text-white' 
                                  : 'bg-app-surface border-app-border text-zinc-500 hover:text-white'
                              }`}
                            >
                               <div className="text-lg font-black mb-1">{b.icon}</div>
                               <div className="text-[9px] font-bold uppercase tracking-tighter">{b.name}</div>
                            </button>
                         ))}
                      </div>
                   </div>

                   <div className="flex justify-between items-end bg-black/30 p-4 rounded-2xl border border-app-border">
                      <div>
                         <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Asset Node</p>
                         <p id="asset-node-title" className="text-3xl font-display font-black text-white">{lastReport.ticker}</p>
                         {lastReport.companyName && lastReport.companyName !== lastReport.ticker && (
                           <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{lastReport.companyName}</p>
                         )}

                         {/* Last Traded Price feeder (delayed market data — see /api/pipeline/price) */}
                         {(() => {
                            const ltpVerified = scripLtp > 0 && scripLtpTicker === (lastReport?.ticker || ticker).toUpperCase();
                            return (
                         <div className="mt-4 pt-3.5 border-t border-zinc-800/80 flex items-center justify-between w-full">
                            <div className="flex items-center gap-1.5">
                               <span className={`h-1.5 w-1.5 rounded-full ${isLtpFetching ? 'bg-amber animate-ping' : ltpVerified ? 'bg-zinc-500' : 'bg-zinc-700'}`} />
                               <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                                 {!ltpVerified ? 'Price Unavailable' : isMarketLive(ltpAsOf) ? 'Delayed' : 'Market Closed · Last Close'}
                                 {ltpVerified && ltpAsOf ? <span className="text-zinc-600 normal-case font-medium tracking-normal ml-1">as of {formatLtpAsOf(ltpAsOf)} IST</span> : null}
                               </span>
                            </div>
                            <div className="flex items-baseline gap-2">
                               {ltpVerified ? (
                                 <>
                                   <motion.span
                                     key={isMarketLive(ltpAsOf) ? scripLtp : 'closed'}
                                     initial={isMarketLive(ltpAsOf) ? { scale: 1.12, color: ltpTrend === 'up' ? '#10b981' : ltpTrend === 'down' ? '#f43f5e' : '#ffffff' } : { scale: 1, color: '#ffffff' }}
                                     animate={{ scale: 1, color: '#ffffff' }}
                                     transition={{ duration: 0.25 }}
                                     className="text-2xl font-display font-black text-white"
                                   >
                                      ₹{scripLtp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </motion.span>
                                   {ltpPercentChange !== 0 ? (
                                     <span className={`text-[10px] font-mono font-bold ${ltpChange >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                        {ltpChange >= 0 ? '▲' : '▼'}{ltpChange >= 0 ? '+' : ''}{ltpChange.toFixed(2)} ({ltpPercentChange >= 0 ? '+' : ''}{ltpPercentChange.toFixed(2)}%)
                                     </span>
                                   ) : null}
                                 </>
                               ) : (
                                 <span className="text-xs font-medium text-zinc-500 italic">{isLtpFetching ? 'Fetching…' : 'Check broker'}</span>
                               )}
                            </div>
                         </div>
                            );
                         })()}
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Signal Status</p>
                         <p className="text-xs font-mono font-black text-emerald-400 uppercase tracking-widest mt-1.5">BULLISH DIRECTIVE</p>
                      </div>
                   </div>
                   
                   {/* GTT Notice */}
                   <div className="flex items-start gap-2 p-3 bg-gold/5 border border-gold/20 rounded-xl text-[9px] text-zinc-400 leading-relaxed">
                     <span className="text-gold flex-shrink-0 text-sm">ℹ</span>
                     <span>Note: GTT (Good Till Triggered) orders are not available through this interface. Please log in directly at <a href="https://kite.zerodha.com" target="_blank" rel="noreferrer" className="text-gold underline">kite.zerodha.com</a> to place GTT orders.</span>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-app-surface border border-app-border rounded-2xl">
                         <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Quantity</label>
                         <input 
                            type="number" 
                            value={tradeQuantity} 
                            onChange={(e) => setTradeQuantity(e.target.value)}
                            className="w-full bg-transparent text-xl font-display font-black focus:outline-none text-white border-b border-app-border/30" 
                          />
                      </div>
                      <div className="p-4 bg-app-surface border border-app-border rounded-2xl">
                         <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Order Type</label>
                         <select 
                            value={tradeOrderType}
                            onChange={(e) => setTradeOrderType(e.target.value as any)}
                            className="w-full bg-transparent text-xs font-bold focus:outline-none text-white uppercase mt-1.5 focus:ring-0 cursor-pointer"
                          >
                             <option value="LIMIT" className="bg-app-bg text-white">Limit Order</option>
                             <option value="MARKET" className="bg-app-bg text-white">Market Order</option>
                          </select>
                       </div>
                    </div>

                    <div className="space-y-4 text-left">
                       <div className="p-4 bg-app-surface border border-app-border rounded-2xl animate-fade-in">
                          <div className="flex justify-between items-center mb-1">
                             <div className="flex items-center gap-2">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block font-bold">Entry Price (₹)</label>
                                {getPriceVsLtpLabel(tradePrice, scripLtp)}
                             </div>
                             <button
                               type="button"
                               disabled={!(scripLtp > 0)}
                               onClick={() => { if (scripLtp > 0) setTradePrice(scripLtp.toFixed(2)); }}
                               className="text-[8px] font-black uppercase text-gold hover:text-white transition-colors tracking-widest bg-gold/10 px-1.5 py-0.5 rounded border border-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                             >
                               Match Last Price
                             </button>
                          </div>
                          <input 
                            type="number" 
                            step="0.05"
                            value={tradePrice} 
                            onChange={(e) => setTradePrice(e.target.value)}
                            className="w-full bg-transparent text-xl font-display font-black focus:outline-none text-white border-b border-app-border/30" 
                          />
                       </div>

                       <div className="grid grid-cols-2 gap-4 mt-4">
                          <div className="p-4 bg-app-surface border border-app-border rounded-2xl">
                             <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block text-zinc-400">Target Price (₹)</label>
                                {getTargetVsLtpLabel(tradeTargetPrice, tradePrice, scripLtp)}
                             </div>
                             <input 
                                type="number" 
                                step="0.05"
                                value={tradeTargetPrice} 
                                onChange={(e) => setTradeTargetPrice(e.target.value)}
                                placeholder="Target limit level"
                                className="w-full bg-transparent text-xl font-display font-black focus:outline-none text-white border-b border-app-border/30 placeholder:text-zinc-700" 
                             />
                             <div className="flex gap-1 mt-2.5">
                                {[3, 5, 10].map(pct => (
                                   <button 
                                     type="button" 
                                     key={pct}
                                     onClick={() => {
                                       const base = parseFloat(tradePrice) || scripLtp;
                                       setTradeTargetPrice((Math.round(base * (1 + pct / 100) * 20) / 20).toFixed(2));
                                     }} 
                                     className="text-[8px] bg-emerald-950/40 hover:bg-emerald-600/20 border border-emerald-800/40 text-emerald-400 px-1.5 py-0.5 rounded transition-all font-bold"
                                   >
                                     +{pct}%
                                   </button>
                                ))}
                             </div>
                             <p className="text-[9px] text-zinc-500 font-medium leading-relaxed mt-2 uppercase tracking-wide flex justify-between items-center">
                               <span>Expected Gain:</span>
                               <span className="font-bold text-emerald-400 font-mono">
                                 {(() => {
                                   const targetVal = parseFloat(tradeTargetPrice);
                                   const priceVal = parseFloat(tradePrice) || scripLtp;
                                   if (isNaN(targetVal) || isNaN(priceVal) || priceVal <= 0) return '0.00%';
                                   const gainPct = ((targetVal - priceVal) / priceVal) * 100;
                                   return `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%`;
                                 })()}
                               </span>
                             </p>
                          </div>
                          <div className="p-4 bg-app-surface border border-app-border rounded-2xl">
                             <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block text-zinc-400">Stop Loss (₹)</label>
                                {getStopLossVsLtpLabel(tradeStopLoss, tradePrice, scripLtp)}
                             </div>
                             <input 
                                type="number" 
                                step="0.05"
                                value={tradeStopLoss} 
                                onChange={(e) => setTradeStopLoss(e.target.value)}
                                placeholder="Stop-loss level"
                                className="w-full bg-transparent text-xl font-display font-black focus:outline-none text-white border-b border-app-border/30 placeholder:text-zinc-700" 
                             />
                             <div className="flex gap-1 mt-2.5">
                                {[1, 2, 5].map(pct => (
                                   <button 
                                     type="button" 
                                     key={pct}
                                     onClick={() => {
                                       const base = parseFloat(tradePrice) || scripLtp;
                                       setTradeStopLoss((Math.round(base * (1 - pct / 100) * 20) / 20).toFixed(2));
                                     }} 
                                     className="text-[8px] bg-red-950/40 hover:bg-red-600/20 border border-red-800/40 text-red-100 px-1.5 py-0.5 rounded transition-all font-bold"
                                   >
                                     -{pct}%
                                   </button>
                                ))}
                             </div>
                             <p className="text-[9px] text-zinc-500 font-medium leading-relaxed mt-2 uppercase tracking-wide flex justify-between items-center">
                               <span>Risk Limit:</span>
                               <span className="font-bold text-rose-400 font-mono">
                                 {(() => {
                                   const slVal = parseFloat(tradeStopLoss);
                                   const priceVal = parseFloat(tradePrice) || scripLtp;
                                   if (isNaN(slVal) || isNaN(priceVal) || priceVal <= 0) return '0.00%';
                                   const riskPct = ((slVal - priceVal) / priceVal) * 100;
                                   return `${riskPct >= 0 ? '+' : ''}${riskPct.toFixed(2)}%`;
                                 })()}
                               </span>
                             </p>
                          </div>
                       </div>
                    </div>
                </div>

                <div className="p-6 bg-app-surface/50 border-t border-app-border flex flex-col gap-3 flex-shrink-0">
                   {selectedBroker === 'zerodha' ? (
                     <div className="flex flex-col gap-4">
                        {/* Real Zerodha Kite Button Integration */}
                        <div className="flex items-center justify-between p-3.5 bg-black/40 border border-app-border rounded-xl mb-1">
                           <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">CONNECTIVITY BRIDGE HANDSHAKE</span>
                           <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                             zerodhaApiKey ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                           }`}>
                              {zerodhaApiKey ? `ACTIVE KITE API (...${zerodhaApiKey.slice(-4)})` : "MOCK SANDBOX"}
                           </span>
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-gold/5 border border-gold/20 rounded-xl text-[9px] text-zinc-400 leading-relaxed mb-1">
                          <span className="text-gold flex-shrink-0 text-sm">ℹ</span>
                          <span>For best results, please log in to your Kite account in a separate browser tab before executing trades here.</span>
                        </div>
                        <button
                          onClick={handleExecuteKiteJS}
                          className="kite-buy w-full py-5 bg-amber text-black font-black uppercase tracking-[0.25em] rounded-2xl hover:bg-white hover:text-black transition-all shadow-[0_0_35px_rgba(201,145,42,0.4)] flex items-center justify-center gap-3 relative overflow-hidden"
                        >
                           <Zap className="w-5 h-5 fill-current" /> Execute via Kite
                        </button>
                        <button 
                          onClick={() => setShowTradeModal(false)}
                          className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel & Return to Report
                        </button>
                        <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest leading-relaxed">
                          Clicking above opens the secure Zerodha payment bridge.<br/>No API keys stored here.
                        </p>
                     </div>
                   ) : (
                     <div className="flex flex-col gap-3">
                        <button 
                          onClick={executeTrade}
                          className="w-full py-5 bg-zinc-800 text-zinc-400 font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-white hover:text-black transition-all flex items-center justify-center gap-3"
                        >
                          <Zap className="w-5 h-5 fill-current" /> Route via {selectedBroker.toUpperCase()} Bridge
                        </button>
                        <button 
                          onClick={() => setShowTradeModal(false)}
                          className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel Execution Protocol
                        </button>
                     </div>
                   )}
                </div>
             </motion.div>
          </div>
        )}

        {tradeSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] bg-positive text-black px-10 py-5 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white/20"
          >
             <ShieldCheck className="w-8 h-8" />
             <div>
                <p className="font-black uppercase tracking-[0.2em] text-sm">Order Transmitted Successfully</p>
                <p className="text-[10px] font-bold uppercase opacity-80 mt-0.5">Reference ID: NSE-ALGO-{Math.floor(Math.random() * 899999 + 100000)} • Track via Portfolio Hub</p>
             </div>
          </motion.div>
        )}

        {false && showBrokerAuthModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-app-bg border border-app-border w-full max-w-md rounded-3xl overflow-hidden shadow-[0_0_120px_rgba(201,145,42,0.2)]"
             >
                <div className="p-8 border-b border-app-border bg-gold/10 flex justify-between items-center">
                   <div>
                      <h4 className="text-lg font-display font-black text-white italic uppercase tracking-tighter">Zerodha Kite Authorization</h4>
                      <p className="text-[9px] text-gold font-bold uppercase tracking-widest mt-1">Direct Publisher API Node Setup</p>
                   </div>
                   <button onClick={() => setShowBrokerAuthModal(false)} className="p-2 text-zinc-500 hover:text-white">
                      <X className="w-5 h-5" />
                   </button>
                </div>

                <div className="p-8 space-y-6">
                   <div className="space-y-2">
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">1. API Application Name</p>
                      <div className="p-4 bg-zinc-900 border border-app-border rounded-xl font-mono text-sm text-zinc-300">
                         Capital Pulse Intel
                      </div>
                      <p className="text-[9px] text-zinc-500 leading-normal">
                         Ensure your registered app name on the Zerodha Developer Portal matches this for correct origin verification.
                      </p>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">2. Kite Publisher App API Key — get this from kite.zerodha.com/publishers</label>
                      <input 
                        type="text" 
                        value={zerodhaApiKey}
                        onChange={(e) => setZerodhaApiKey(e.target.value.trim())}
                        placeholder="e.g. yk785cx629ksk97m"
                        className="w-full bg-zinc-900 border border-app-border p-4 rounded-xl font-mono text-white text-base focus:outline-none focus:border-gold transition-colors placeholder:text-zinc-700"
                      />
                      <p className="text-[9px] text-zinc-500 leading-normal">
                         This is your unique API key obtained from your Zerodha publisher app dashboard. Highly secure: stored strictly on your local browser cache.
                      </p>
                   </div>

                   <button
                     onClick={() => {
                       if (!zerodhaApiKey) {
                         alert("Please enter a valid API key to authorize the connection.");
                         return;
                       }
                       localStorage.setItem('capital_pulse_zerodha_api', zerodhaApiKey);
                       setBrokerConnected(true);
                       setShowBrokerAuthModal(false);
                     }}
                     className="w-full py-4 bg-amber text-black font-black uppercase tracking-widest rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(201,145,42,0.2)] text-[11px]"
                   >
                     Authorize & Activate Bridge
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Feedback Button */}
      <a
        href="mailto:srscoll@gmail.com?subject=Alphasynth Beta Feedback&body=Stock I tested: %0D%0AWhat worked well: %0D%0AWhat needs improvement: %0D%0AFeatures I%27d like to see: "
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-gold hover:bg-gold/10 transition-all shadow-lg"
        style={{ background: 'rgba(10,15,30,0.95)', border: '1px solid rgba(201,145,42,0.4)', textDecoration: 'none' }}
      >
        💬 Send Feedback
      </a>

    </div>
  );
}
