import re

f = open('src/App.tsx', 'r', encoding='utf-8')
content = f.read()
f.close()

original = content
results = []

def patch(name, find, replace):
    global content
    if find in content:
        content = content.replace(find, replace, 1)
        results.append('PASS: ' + name)
    else:
        results.append('SKIP: ' + name + ' (already applied or not found)')

patch('Spinner CSS injection',
'// Initialize Firebase\nconst app = initializeApp(firebaseConfig);',
'''// Inject spinner keyframe
if (typeof document !== 'undefined') {
  const s = document.createElement('style');
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);''')

patch('RatingBadge with Signal labels and context',
"""const RatingBadge = ({ rating }: { rating: string }) => {
  const colors: any = {
    buy: 'bg-positive/20 text-positive border-positive/50',
    sell: 'bg-negative/20 text-negative border-negative/50',
    hold: 'bg-gold/20 text-gold border-gold/50'
  };
  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${colors[rating?.toLowerCase()] || colors.hold}`}>
      {rating || 'HOLD'}
    </span>
  );
};""",
"""const RatingBadge = ({ rating, mode }: { rating: string, mode?: string }) => {
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
};""")

patch('MetricBar with click-to-explain',
"""const MetricBar = ({ label, score }: { label: string, score: number | null }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
      <span>{label}</span>
      <span className="text-zinc-200">{score !== null && score !== undefined ? `${score}/10` : 'N/A'}</span>
    </div>
    <div className="h-1 bg-app-border rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: score !== null && score !== undefined ? `${score * 10}%` : '0%' }}
        transition={{ duration: 1, ease: "easeOut" }}
        className={`h-full ${score !== null && score !== undefined ? (score > 7 ? 'bg-gold' : score > 4 ? 'bg-zinc-400' : 'bg-negative') : 'bg-zinc-700'}`}
      />
    </div>
  </div>
);""",
"""const MetricBar = ({ label, score, ticker }: { label: string, score: number | null, ticker?: string }) => {
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
};""")

patch('ticker prop to MetricBar calls',
'                        <MetricBar label="Valuation Intelligence" score={lastReport.metrics?.valuation} />\n                        <MetricBar label="Growth Momentum" score={lastReport.metrics?.growth} />\n                        <MetricBar label="Quality & Moat" score={lastReport.metrics?.quality} />\n                        <MetricBar label="Execution Risk" score={lastReport.metrics?.risk} />\n                        <MetricBar label="Governance Alpha" score={lastReport.metrics?.governance} />',
'                        <MetricBar label="Valuation Intelligence" score={lastReport.metrics?.valuation} ticker={lastReport.ticker} />\n                        <MetricBar label="Growth Momentum" score={lastReport.metrics?.growth} ticker={lastReport.ticker} />\n                        <MetricBar label="Quality & Moat" score={lastReport.metrics?.quality} ticker={lastReport.ticker} />\n                        <MetricBar label="Execution Risk" score={lastReport.metrics?.risk} ticker={lastReport.ticker} />\n                        <MetricBar label="Governance Alpha" score={lastReport.metrics?.governance} ticker={lastReport.ticker} />')

patch('mode prop to RatingBadge',
'{lastReport.ticker} <RatingBadge rating={lastReport.rating} />',
'{lastReport.ticker} <RatingBadge rating={lastReport.rating} mode={lastReport.mode} />')

patch('SEBI disclaimer below report header',
'                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Institutional Audit \u2022 Grounding Active</p>',
'                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Institutional Audit \u2022 Grounding Active</p>\n                      <p className="text-[10px] text-zinc-500 italic mt-1 normal-case tracking-normal font-normal">AI-generated data analysis only. Not a SEBI-registered Research Analyst. This is not investment advice or a recommendation to buy, sell, or hold any security.</p>')

patch('Consent gate modal',
'    <div className={`min-h-screen ${COLORS.bg} text-white font-sans selection:bg-gold/30`}>\n      <AnimatePresence>\n        {showOnboarding && (',
"""    <div className={`min-h-screen ${COLORS.bg} text-white font-sans selection:bg-gold/30`}>
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
        {showOnboarding && (""")

patch('Permanent SEBI bar on app landing',
'      {/* Hero Section */}\n      <section className="pt-32 pb-20 px-6 relative overflow-hidden">',
"""      <div style={{width:'100%',background:'rgba(201,145,42,0.06)',borderBottom:'1px solid rgba(201,145,42,0.2)',padding:'7px 24px',textAlign:'center'}}>
        <p style={{margin:0,fontSize:11,color:'#9ca3af'}}><span style={{color:'#c9a84c',fontWeight:700}}>Alphasynth Intelligence</span> provides AI-generated market data analysis only. Not a SEBI-registered Research Analyst. Not investment advice.</p>
      </div>
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">""")

patch('Cache state variables',
'  const [earningsIntelReport, setEarningsIntelReport] = useState<any>(null);',
'  const [earningsIntelReport, setEarningsIntelReport] = useState<any>(null);\n  const [cachedDeepDive, setCachedDeepDive] = useState<any>(null);\n  const [cachedEarnings, setCachedEarnings] = useState<any>(null);')

patch('Cache deep dive on generate',
'        setLastReport({ ...reportData, id: user ? \'pending\' : undefined });',
'        setLastReport({ ...reportData, id: user ? \'pending\' : undefined });\n        if (activeMode === \'deep_dive\') setCachedDeepDive({ ...reportData, id: user ? \'pending\' : undefined });')

patch('Cache earnings on generate',
'      setEarningsIntelReport({ ...data, ticker: tkr });',
'      setEarningsIntelReport({ ...data, ticker: tkr });\n      setCachedEarnings({ ...data, ticker: tkr });')

patch('Instant cache switching',
"""                             onClick={() => {
                                 if (m.id === 'earnings_intelligence') {
                                   triggerEarningsIntelligence(lastReport.ticker);
                                 } else {
                                   setWorkflowMode(m.id as any);
                                   triggerAnalysis(m.id as any, lastReport.ticker, true);
                                 }
                               }}""",
"""                             onClick={() => {
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
                               }}""")

if content != original:
    open('src/App.tsx', 'w', encoding='utf-8').write(content)
    print('\nFile saved successfully!\n')
else:
    print('\nNo changes made.\n')

passed = [r for r in results if r.startswith('PASS')]
skipped = [r for r in results if r.startswith('SKIP')]
print(f'Results: {len(passed)} applied, {len(skipped)} skipped')
for r in results:
    print(' ', r)
