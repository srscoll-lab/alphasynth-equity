import re

changes = []

# ── FIX 1: Fix /api/explain-metric endpoint in server.ts ──
f = open('server.ts', 'r', encoding='utf-8')
server = f.read()
f.close()

old_endpoint = '''  app.post("/api/explain-metric", async (req, res) => {
    try {
      const { ticker, metricName, metricValue, companyName } = req.body;
      if (!metricName) { res.status(400).json({ error: 'metricName required' }); return; }
      const prompt = `You are a plain-English financial educator for Indian retail investors. Explain what the following metric means for ${companyName || ticker} specifically, in 2-3 sentences maximum. Write for someone with no financial background. Be specific to this company, not generic.

Metric: ${metricName}
Value: ${metricValue}
Company: ${companyName || ticker}

Rules:
- Maximum 60 words
- No jargon without explanation
- Be specific to this company
- Do not start with the metric name`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const explanation = result.response.text().trim();
      res.json({ explanation });
    } catch (err: any) {
      console.error("explain-metric error:", err);
      res.status(500).json({ explanation: "Unable to generate explanation at this time." });
    }
  });'''

new_endpoint = '''  app.post("/api/explain-metric", async (req, res) => {
    try {
      const { ticker, metricName, metricValue, companyName } = req.body;
      if (!metricName) { res.status(400).json({ error: 'metricName required' }); return; }
      const ai = getGenAI();
      const prompt = `You are a plain-English financial educator for Indian retail investors. Explain what the following metric score means for ${companyName || ticker} specifically. Write 2-3 sentences maximum for someone with no financial background. Be specific to this company, not generic. Do not start with the metric name. Maximum 60 words.

Metric: ${metricName}
Score: ${metricValue}
Company: ${companyName || ticker}`;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 200 }
      });
      const explanation = (result.text || "").trim();
      res.json({ explanation });
    } catch (err: any) {
      console.error("explain-metric error:", err);
      res.status(500).json({ explanation: "Unable to generate explanation at this time." });
    }
  });'''

if old_endpoint in server:
    server = server.replace(old_endpoint, new_endpoint, 1)
    open('server.ts', 'w', encoding='utf-8').write(server)
    changes.append("PASS Fix 1: explain-metric endpoint fixed with correct SDK syntax")
else:
    changes.append("FAIL Fix 1: explain-metric endpoint not found")

# ── FIX 2 & 3: Fix App.tsx — RatingBadge context labels + report caching ──
f = open('src/App.tsx', 'r', encoding='utf-8')
app = f.read()
f.close()

# FIX 2: Replace RatingBadge with context label version
old_badge = '''const RatingBadge = ({ rating }: { rating: string }) => {
  const r = rating?.toLowerCase();
  const config: any = {
    buy:  { label: 'Signal: Positive', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    sell: { label: 'Signal: Negative', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
    hold: { label: 'Signal: Neutral',  cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/40' },
  };
  const { label, cls } = config[r] || { label: 'Signal: Cautious', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' };
  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls}`}>
      {label}
    </span>
  );
};'''

new_badge = '''const RatingBadge = ({ rating, mode }: { rating: string, mode?: string }) => {
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
};'''

if old_badge in app:
    app = app.replace(old_badge, new_badge, 1)
    changes.append("PASS Fix 2: RatingBadge updated with context labels")
else:
    changes.append("FAIL Fix 2: RatingBadge not found")

# FIX 2b: Pass mode to RatingBadge in report header
old_badge_usage = '{lastReport.ticker} <RatingBadge rating={lastReport.rating} />'
new_badge_usage = '{lastReport.ticker} <RatingBadge rating={lastReport.rating} mode={lastReport.mode} />'

if old_badge_usage in app:
    app = app.replace(old_badge_usage, new_badge_usage, 1)
    changes.append("PASS Fix 2b: mode prop passed to RatingBadge")
else:
    changes.append("FAIL Fix 2b: RatingBadge usage not found")

# FIX 3: Add cachedDeepDive state and caching logic
# Add state variable after earningsIntelReport state
old_state = '  const [earningsIntelReport, setEarningsIntelReport] = useState<any>(null);'
new_state = '''  const [earningsIntelReport, setEarningsIntelReport] = useState<any>(null);
  const [cachedDeepDive, setCachedDeepDive] = useState<any>(null);
  const [cachedEarnings, setCachedEarnings] = useState<any>(null);'''

if old_state in app:
    app = app.replace(old_state, new_state, 1)
    changes.append("PASS Fix 3a: cache state variables added")
else:
    changes.append("FAIL Fix 3a: earningsIntelReport state not found")

# FIX 3b: Cache deep dive report when it's set
old_setreport = '''        setLastReport({ ...reportData, id: user ? 'pending' : undefined });'''
new_setreport = '''        setLastReport({ ...reportData, id: user ? 'pending' : undefined });
        if (activeMode === 'deep_dive') setCachedDeepDive({ ...reportData, id: user ? 'pending' : undefined });'''

if old_setreport in app:
    app = app.replace(old_setreport, new_setreport, 1)
    changes.append("PASS Fix 3b: deep dive caching added")
else:
    changes.append("FAIL Fix 3b: setLastReport not found")

# FIX 3c: Cache earnings intelligence report when set
old_setearnings = '''      setEarningsIntelReport({ ...data, ticker: tkr });'''
new_setearnings = '''      setEarningsIntelReport({ ...data, ticker: tkr });
      setCachedEarnings({ ...data, ticker: tkr });'''

if old_setearnings in app:
    app = app.replace(old_setearnings, new_setearnings, 1)
    changes.append("PASS Fix 3c: earnings intelligence caching added")
else:
    changes.append("FAIL Fix 3c: setEarningsIntelReport not found")

# FIX 3d: Restore cached report when switching modes in cross-analysis suite
old_switch = '''                             onClick={() => {
                                 if (m.id === 'earnings_intelligence') {
                                   triggerEarningsIntelligence(lastReport.ticker);
                                 } else {
                                   setWorkflowMode(m.id as any);
                                   triggerAnalysis(m.id as any, lastReport.ticker, true);
                                 }
                               }}'''

new_switch = '''                             onClick={() => {
                                 if (m.id === 'earnings_intelligence') {
                                   if (cachedEarnings && cachedEarnings.ticker === lastReport.ticker) {
                                     const syntheticReport = { mode: 'earnings_intelligence' as const, ticker: lastReport.ticker, rawReport: '', confidence: 'high' as const, scrapeQuality: 'good' as const, metrics: {}, sourceUrl: cachedEarnings.sourceUrl || '' };
                                     setLastReport(syntheticReport);
                                     setEarningsIntelReport(cachedEarnings);
                                   } else {
                                     triggerEarningsIntelligence(lastReport.ticker);
                                   }
                                 } else if (m.id === 'deep_dive') {
                                   if (cachedDeepDive && cachedDeepDive.ticker === lastReport.ticker) {
                                     setLastReport(cachedDeepDive);
                                     setEarningsIntelReport(null);
                                   } else {
                                     setWorkflowMode(m.id as any);
                                     triggerAnalysis(m.id as any, lastReport.ticker, true);
                                   }
                                 } else {
                                   setWorkflowMode(m.id as any);
                                   triggerAnalysis(m.id as any, lastReport.ticker, true);
                                 }
                               }}'''

if old_switch in app:
    app = app.replace(old_switch, new_switch, 1)
    changes.append("PASS Fix 3d: instant mode switching with cache added")
else:
    changes.append("FAIL Fix 3d: mode switch onClick not found")

open('src/App.tsx', 'w', encoding='utf-8').write(app)

print("\nAll fixes applied!\n")
print("Results:")
for c in changes:
    print(" ", c)
