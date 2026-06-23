import re

filepath = "src/App.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

original = content
changes_made = []

old1 = """const RatingBadge = ({ rating }: { rating: string }) => {
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
};"""

new1 = """const RatingBadge = ({ rating }: { rating: string }) => {
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
};"""

if old1 in content:
    content = content.replace(old1, new1, 1)
    changes_made.append("PASS Change 1: RatingBadge replaced with Signal labels")
else:
    changes_made.append("FAIL Change 1: RatingBadge NOT found")

old2 = """const MetricBar = ({ label, score }: { label: string, score: number | null }) => (
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
);"""

new2 = """const MetricBar = ({ label, score, ticker }: { label: string, score: number | null, ticker?: string }) => {
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
    } catch {
      setExplanation('Unable to generate explanation at this time.');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-1.5">
      <div
        className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors group"
        onClick={handleExplain}
      >
        <span className="flex items-center gap-1.5">
          {label}
          <span style={{color:'#6366f1',opacity:0.7,fontSize:11}} className="group-hover:opacity-100 transition-opacity">&#10022;</span>
        </span>
        <span className="text-zinc-200">{score !== null && score !== undefined ? score + '/10' : 'N/A'}</span>
      </div>
      <div className="h-1 bg-app-border rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: score !== null && score !== undefined ? (score * 10) + '%' : '0%' }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full ${score !== null && score !== undefined ? (score > 7 ? 'bg-gold' : score > 4 ? 'bg-zinc-400' : 'bg-negative') : 'bg-zinc-700'}`}
        />
      </div>
      {open && (
        <div style={{background:'#1a1d2e',border:'1px solid #6366f1',borderRadius:8,padding:'10px 12px',marginTop:6}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:10,color:'#6366f1',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>AI insight: {label}</span>
            <button onClick={function(e){e.stopPropagation();setOpen(false);}} style={{color:'#6366f1',background:'none',border:'none',cursor:'pointer',fontSize:14,lineHeight:1}}>X</button>
          </div>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#6366f1'}}>
              <div style={{width:10,height:10,border:'1.5px solid #6366f130',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
              Generating explanation...
            </div>
          ) : (
            <p style={{fontSize:11,color:'#c8ccd8',lineHeight:1.6,margin:0}}>{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
};"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    changes_made.append("PASS Change 2: MetricBar replaced with click-to-explain")
else:
    changes_made.append("FAIL Change 2: MetricBar NOT found")

old3 = '                        <MetricBar label="Valuation Intelligence" score={lastReport.metrics?.valuation} />\n                        <MetricBar label="Growth Momentum" score={lastReport.metrics?.growth} />\n                        <MetricBar label="Quality & Moat" score={lastReport.metrics?.quality} />\n                        <MetricBar label="Execution Risk" score={lastReport.metrics?.risk} />\n                        <MetricBar label="Governance Alpha" score={lastReport.metrics?.governance} />'

new3 = '                        <MetricBar label="Valuation Intelligence" score={lastReport.metrics?.valuation} ticker={lastReport.ticker} />\n                        <MetricBar label="Growth Momentum" score={lastReport.metrics?.growth} ticker={lastReport.ticker} />\n                        <MetricBar label="Quality & Moat" score={lastReport.metrics?.quality} ticker={lastReport.ticker} />\n                        <MetricBar label="Execution Risk" score={lastReport.metrics?.risk} ticker={lastReport.ticker} />\n                        <MetricBar label="Governance Alpha" score={lastReport.metrics?.governance} ticker={lastReport.ticker} />'

if old3 in content:
    content = content.replace(old3, new3, 1)
    changes_made.append("PASS Change 3: ticker prop added to MetricBar calls")
else:
    changes_made.append("FAIL Change 3: MetricBar calls NOT found")

old4 = '                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Institutional Audit \xe2\x80\xa2 Grounding Active</p>'
new4 = '                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Institutional Audit \xe2\x80\xa2 Grounding Active</p>\n                      <p className="text-[10px] text-zinc-500 italic mt-1 normal-case tracking-normal font-normal">AI-generated data analysis only. Not a SEBI-registered Research Analyst. This is not investment advice or a recommendation to buy, sell, or hold any security.</p>'

if old4 in content:
    content = content.replace(old4, new4, 1)
    changes_made.append("PASS Change 4: SEBI disclaimer added")
else:
    changes_made.append("FAIL Change 4: Header line NOT found")

old5 = '    <div className={`min-h-screen ${COLORS.bg} text-white font-sans selection:bg-gold/30`}>\n      <AnimatePresence>\n        {showOnboarding && ('
new5 = '    <div className={`min-h-screen ${COLORS.bg} text-white font-sans selection:bg-gold/30`}>\n      {!localStorage.getItem(\'alphasynth_consent_v1\') && (\n        <div style={{position:\'fixed\',inset:0,zIndex:9999,background:\'rgba(0,0,0,0.93)\',display:\'flex\',alignItems:\'center\',justifyContent:\'center\',padding:24}}>\n          <div style={{background:\'#13161f\',border:\'1px solid rgba(201,145,42,0.3)\',borderRadius:16,padding:40,maxWidth:480,width:\'100%\'}}>\n            <h2 style={{color:\'#fff\',fontSize:22,fontWeight:700,marginBottom:16}}>Before you begin</h2>\n            <p style={{color:\'#9ca3af\',fontSize:13,lineHeight:1.7,marginBottom:28}}>\n              Alphasynth Intelligence provides AI-generated market data analysis only. It is not a SEBI-registered Research Analyst and does not provide investment advice or stock recommendations. All analysis is for informational and educational purposes only. Please consult a SEBI-registered investment advisor before making any investment decisions.\n            </p>\n            <button\n              onClick={function(){localStorage.setItem(\'alphasynth_consent_v1\',\'true\');window.location.reload();}}\n              style={{width:\'100%\',padding:\'14px 0\',background:\'#c9a84c\',color:\'#000\',fontWeight:800,fontSize:12,textTransform:\'uppercase\',letterSpacing:\'0.15em\',borderRadius:10,border:\'none\',cursor:\'pointer\'}}\n            >\n              I understand - continue\n            </button>\n          </div>\n        </div>\n      )}\n      <AnimatePresence>\n        {showOnboarding && ('

if old5 in content:
    content = content.replace(old5, new5, 1)
    changes_made.append("PASS Change 5: Consent gate modal added")
else:
    changes_made.append("FAIL Change 5: Return div NOT found")

old6 = '// Initialize Firebase\nconst app = initializeApp(firebaseConfig);'
new6 = '// Inject spinner keyframe for click-to-explain\nif (typeof document !== \'undefined\') {\n  const s = document.createElement(\'style\');\n  s.textContent = \'@keyframes spin { to { transform: rotate(360deg); } }\';\n  document.head.appendChild(s);\n}\n\n// Initialize Firebase\nconst app = initializeApp(firebaseConfig);'

if old6 in content:
    content = content.replace(old6, new6, 1)
    changes_made.append("PASS Change 6: Spinner CSS injection added")
else:
    changes_made.append("FAIL Change 6: Firebase init NOT found")

if content != original:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("\nFile updated successfully!\n")
else:
    print("\nNo changes made - file unchanged.\n")

print("Results:")
for c in changes_made:
    print(" ", c)

print("\nOriginal length: " + str(len(original)) + " chars")
print("Updated length:  " + str(len(content)) + " chars")
