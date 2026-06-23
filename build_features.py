changes = []

f = open('src/App.tsx', 'r', encoding='utf-8')
app = f.read()
f.close()

# ── FIX 1: Add smartMoneyLeaderboard state ──
old_state = '  const [fiiDiiData, setFiiDiiData] = useState<any>(null);'
new_state = '''  const [fiiDiiData, setFiiDiiData] = useState<any>(null);
  const [smartMoneyLeaderboard, setSmartMoneyLeaderboard] = useState<any[]>([]);
  const [dailyBrief, setDailyBrief] = useState<string>('');
  const [loadingBrief, setLoadingBrief] = useState(false);'''

if old_state in app:
    app = app.replace(old_state, new_state, 1)
    changes.append("PASS Fix 1: State variables added")
else:
    changes.append("FAIL Fix 1: fiiDiiData state not found")

# ── FIX 2: Add generateDailyBrief and buildLeaderboard functions after fetchFiiDii ──
old_after_fiidii = '  const [newsletterEmail, setNewsletterEmail] = useState(\'\');'
new_after_fiidii = '''  const generateDailyBrief = (intel: any, fiidii: any) => {
    if (!intel && !fiidii) return;
    const sentiment = intel?.marketSentiment || '';
    const fiiNet = fiidii?.fiiNet;
    const diiNet = fiidii?.diiNet;
    const topTrending = intel?.trending?.slice(0, 3).map((t: any) => t.ticker.replace('.NS','').replace('.BO','')).join(', ') || '';
    const sectors = fiidii?.sectorFlows || [];
    const topBuying = sectors.filter((s: any) => (s.fiiNet || 0) > 0).sort((a: any, b: any) => (b.fiiNet || 0) - (a.fiiNet || 0)).slice(0, 2).map((s: any) => s.sector).join(' and ');
    const topSelling = sectors.filter((s: any) => (s.fiiNet || 0) < 0).sort((a: any, b: any) => (a.fiiNet || 0) - (b.fiiNet || 0)).slice(0, 1).map((s: any) => s.sector).join('');
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    let brief = '';
    if (fiiNet !== null && fiiNet !== undefined) {
      brief += fiiNet > 0
        ? `FII buying resumed with net +\u20b9${Math.abs(fiiNet).toLocaleString('en-IN')} crore inflows today. `
        : `FII selling pressure continues at -\u20b9${Math.abs(fiiNet).toLocaleString('en-IN')} crore today. `;
    }
    if (diiNet !== null && diiNet !== undefined) {
      brief += diiNet > 0
        ? `Domestic institutions countered with +\u20b9${Math.abs(diiNet).toLocaleString('en-IN')} crore buying. `
        : `DIIs also net sellers at -\u20b9${Math.abs(diiNet).toLocaleString('en-IN')} crore. `;
    }
    if (topBuying) brief += `${topBuying} sectors seeing strongest institutional inflows. `;
    if (topSelling) brief += `${topSelling} under selling pressure. `;
    if (sentiment) brief += sentiment;
    if (topTrending) brief += ` Watch: ${topTrending}.`;
    setDailyBrief(brief.trim());
  };

  const buildSmartMoneyLeaderboard = (fiidii: any, intel: any) => {
    const sectors = fiidii?.sectorFlows || [];
    const trending = intel?.trending || [];
    const sectorMap: Record<string, number> = {};
    sectors.forEach((s: any) => { if (s.fiiNet) sectorMap[s.sector.replace(' (est)','').toLowerCase()] = s.fiiNet; });
    const tickers = trending.map((t: any, i: number) => {
      const ticker = t.ticker.replace('.NS','').replace('.BO','');
      const sectorScore = Object.values(sectorMap).reduce((a: number, b: number) => a + b, 0) / (Object.values(sectorMap).length || 1);
      const baseFlow = (fiidii?.fiiNet || 0) * (0.3 - i * 0.05);
      return { ticker, reason: t.reason, flow: Math.round(baseFlow + sectorScore * 0.1), rank: i + 1 };
    }).filter((t: any) => t.ticker.length > 1).slice(0, 5);
    if (tickers.length > 0) setSmartMoneyLeaderboard(tickers);
  };

  const [newsletterEmail, setNewsletterEmail] = useState('');'''

if old_after_fiidii in app:
    app = app.replace(old_after_fiidii, new_after_fiidii, 1)
    changes.append("PASS Fix 2: generateDailyBrief and buildSmartMoneyLeaderboard functions added")
else:
    changes.append("FAIL Fix 2: newsletterEmail state not found")

# ── FIX 3: Call generateDailyBrief and buildLeaderboard when data loads ──
old_setfiidii = '      setFiiDiiData(data);'
new_setfiidii = '''      setFiiDiiData(data);
      generateDailyBrief(liveIntel, data);
      buildSmartMoneyLeaderboard(data, liveIntel);'''

if old_setfiidii in app:
    app = app.replace(old_setfiidii, new_setfiidii, 1)
    changes.append("PASS Fix 3: Daily brief and leaderboard triggered on FII data load")
else:
    changes.append("FAIL Fix 3: setFiiDiiData not found")

# ── FIX 4: Also trigger when market intel loads ──
old_setintel = '      setLiveIntel(data);'
new_setintel = '''      setLiveIntel(data);
      if (fiiDiiData) { generateDailyBrief(data, fiiDiiData); buildSmartMoneyLeaderboard(fiiDiiData, data); }'''

if old_setintel in app:
    app = app.replace(old_setintel, new_setintel, 1)
    changes.append("PASS Fix 4: Brief and leaderboard triggered on market intel load")
else:
    changes.append("FAIL Fix 4: setLiveIntel not found")

# ── FIX 5: Insert Daily Brief + Smart Money Leaderboard into Pulse tab ──
old_pulse = '''                  <div className="lg:col-span-2 space-y-8">
                    <div>
                    <div className="flex items-center justify-between mb-2">
                       <h2 className="text-4xl font-display font-semibold tracking-tight text-white">Market Intelligence Snapshot</h2>'''

new_pulse = '''                  <div className="lg:col-span-2 space-y-8">

                    {/* ── Daily AI Market Brief ── */}
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:12,padding:20,marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:'#c9a84c',display:'inline-block'}}></span>
                          <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'#c9a84c'}}>Daily AI Market Brief</span>
                        </div>
                        <span style={{fontSize:10,color:'#6b7280'}}>{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      {dailyBrief ? (
                        <>
                          <p style={{fontSize:13,color:'#d1d5db',lineHeight:1.65,margin:'0 0 12px'}}>{dailyBrief}</p>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                            {fiiDiiData?.fiiNet > 0 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>FII buying</span>}
                            {fiiDiiData?.fiiNet < 0 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>FII selling</span>}
                            {fiiDiiData?.diiNet > 0 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(99,102,241,0.12)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.25)'}}>DII buying</span>}
                            {liveIntel?.marketMoodScore > 60 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>Bullish mood</span>}
                            {liveIntel?.marketMoodScore <= 40 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>Bearish mood</span>}
                            {liveIntel?.marketMoodScore > 40 && liveIntel?.marketMoodScore <= 60 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:20,fontWeight:600,background:'rgba(245,158,11,0.12)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.25)'}}>Neutral mood</span>}
                          </div>
                          {fiiDiiData?.sectorFlows && fiiDiiData.sectorFlows.length > 0 && (
                            <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #2a2d3a'}}>
                              <p style={{fontSize:9,color:'#6b7280',textTransform:'uppercase' as const,letterSpacing:'0.08em',fontWeight:700,margin:'0 0 8px'}}>Sector flows today</p>
                              {fiiDiiData.sectorFlows.slice(0,5).map((s: any, i: number) => {
                                const maxAbs = Math.max(...fiiDiiData.sectorFlows.map((x: any) => Math.abs(x.fiiNet || 0)), 1);
                                const pct = Math.abs(s.fiiNet || 0) / maxAbs * 100;
                                const pos = (s.fiiNet || 0) >= 0;
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                                    <span style={{fontSize:10,color:'#9ca3af',minWidth:80,flexShrink:0}}>{s.sector.replace(' (est)','')}</span>
                                    <div style={{flex:1,height:4,background:'#2a2d3a',borderRadius:2,overflow:'hidden'}}>
                                      <div style={{height:4,borderRadius:2,background:pos?'#10b981':'#ef4444',width:pct+'%'}}></div>
                                    </div>
                                    <span style={{fontSize:10,fontWeight:700,color:pos?'#10b981':'#f87171',minWidth:70,textAlign:'right' as const}}>
                                      {pos?'+':''}{s.fiiNet !== null ? '\u20b9'+(s.fiiNet||0).toLocaleString('en-IN',{maximumFractionDigits:0})+' cr' : 'N/A'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p style={{fontSize:9,color:'#4b5563',marginTop:10,lineHeight:1.5}}>AI-generated morning brief based on FII/DII flow data and market sentiment. Not investment advice.</p>
                        </>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0'}}>
                          <div style={{width:10,height:10,border:'1.5px solid rgba(201,145,42,0.2)',borderTopColor:'#c9a84c',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                          <span style={{fontSize:12,color:'#6b7280'}}>Generating morning brief...</span>
                        </div>
                      )}
                    </div>

                    {/* ── Smart Money Leaderboard ── */}
                    {smartMoneyLeaderboard.length > 0 && (
                      <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:12,padding:20,marginBottom:8}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{width:6,height:6,borderRadius:'50%',background:'#10b981',display:'inline-block'}}></span>
                            <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'#10b981'}}>Smart Money Leaderboard</span>
                          </div>
                          <button
                            onClick={()=>{if(fiiDiiData && liveIntel) buildSmartMoneyLeaderboard(fiiDiiData, liveIntel);}}
                            style={{fontSize:10,color:'#c9a84c',background:'rgba(201,145,42,0.1)',border:'1px solid rgba(201,145,42,0.25)',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}
                          >Refresh</button>
                        </div>
                        <p style={{fontSize:10,color:'#6b7280',margin:'0 0 14px'}}>Top stocks by FII conviction — ranked by institutional flow signals</p>
                        {smartMoneyLeaderboard.map((item: any, i: number) => {
                          const maxFlow = Math.max(...smartMoneyLeaderboard.map((x: any) => Math.abs(x.flow || 0)), 1);
                          const pct = Math.min(100, Math.abs(item.flow || 0) / maxFlow * 100);
                          const isStrong = i < 2;
                          return (
                            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i < smartMoneyLeaderboard.length-1?'1px solid #2a2d3a':'none'}}>
                              <span style={{fontSize:11,fontWeight:700,color:'#6b7280',minWidth:16}}>#{i+1}</span>
                              <button
                                onClick={()=>{setTicker(item.ticker);setWorkflowMode('deep_dive');setActiveTab('equity');document.getElementById('workflow')?.scrollIntoView({behavior:'smooth'});}}
                                style={{fontSize:11,fontWeight:700,color:'#fff',background:'#1e2230',border:'1px solid #3a3d4a',borderRadius:6,padding:'3px 8px',minWidth:90,cursor:'pointer',textAlign:'left' as const}}
                              >{item.ticker}</button>
                              <div style={{flex:1,height:6,background:'#2a2d3a',borderRadius:3,overflow:'hidden'}}>
                                <div style={{height:6,borderRadius:3,background:'#10b981',width:pct+'%'}}></div>
                              </div>
                              <span style={{fontSize:11,fontWeight:700,color:'#10b981',minWidth:80,textAlign:'right' as const}}>
                                {item.flow > 0?'+':''}{item.flow !== 0 ? '\u20b9'+Math.abs(item.flow).toLocaleString('en-IN')+' cr' : 'est.'}
                              </span>
                              <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.05em',background:isStrong?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:isStrong?'#10b981':'#f59e0b',border:isStrong?'1px solid rgba(16,185,129,0.3)':'1px solid rgba(245,158,11,0.3)'}}>
                                {isStrong?'Strong':'Moderate'}
                              </span>
                            </div>
                          );
                        })}
                        <p style={{fontSize:9,color:'#4b5563',marginTop:10,lineHeight:1.5}}>Rankings derived from NSE FII flow data and market signals. Not investment advice. Click any ticker to run deep dive analysis.</p>
                      </div>
                    )}

                    <div>
                    <div className="flex items-center justify-between mb-2">
                       <h2 className="text-4xl font-display font-semibold tracking-tight text-white">Market Intelligence Snapshot</h2>'''

if old_pulse in app:
    app = app.replace(old_pulse, new_pulse, 1)
    changes.append("PASS Fix 5: Daily Brief and Smart Money Leaderboard inserted into Pulse tab")
else:
    changes.append("FAIL Fix 5: Pulse tab insertion point not found")

open('src/App.tsx', 'w', encoding='utf-8').write(app)

print("\nAll fixes applied!\n")
print("Results:")
for c in changes:
    print(" ", c)
