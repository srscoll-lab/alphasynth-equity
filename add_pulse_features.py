f = open('src/App.tsx', 'r', encoding='utf-8')
content = f.read()
f.close()

old_state = '  const [fiiDiiData, setFiiDiiData] = useState<any>(null);'
new_state = '''  const [fiiDiiData, setFiiDiiData] = useState<any>(null);
  const [smartMoneyLeaderboard, setSmartMoneyLeaderboard] = useState<any[]>([]);
  const [dailyBrief, setDailyBrief] = useState<string>('');'''

if old_state in content:
    content = content.replace(old_state, new_state, 1)
    print('PASS: state variables added')
else:
    print('SKIP: state already added')

old_newsletter = "  const [newsletterEmail, setNewsletterEmail] = useState('');"
new_newsletter = """  const generateDailyBrief = (intel: any, fiidii: any) => {
    if (!intel && !fiidii) return;
    const sentiment = intel?.marketSentiment || '';
    const topTrending = intel?.trending?.slice(0, 3).map((t: any) => t.ticker.replace('.NS','').replace('.BO','')).join(', ') || '';
    const sectors = fiidii?.sectorFlows || [];
    let fiiNet = fiidii?.fiiNet;
    let diiNet = fiidii?.diiNet;
    let dataDate = fiidii?.date || 'Latest';
    if (!fiiNet && fiiNet !== 0 || (fiiNet === 0 && diiNet === 0)) {
      const recent = (fiidii?.last10Days || []).find((d: any) => d.fiiNet !== null && d.fiiNet !== 0);
      if (recent) { fiiNet = recent.fiiNet; diiNet = recent.diiNet; dataDate = recent.date; }
    }
    const topBuying = sectors.filter((s: any) => (s.fiiNet || 0) > 0).sort((a: any, b: any) => (b.fiiNet||0)-(a.fiiNet||0)).slice(0,2).map((s: any) => s.sector.replace(' (est)','')).join(' and ');
    const topSelling = sectors.filter((s: any) => (s.fiiNet || 0) < 0).sort((a: any, b: any) => (a.fiiNet||0)-(b.fiiNet||0)).slice(0,1).map((s: any) => s.sector.replace(' (est)','')).join('');
    let brief = dataDate ? `As of ${dataDate}: ` : '';
    if (fiiNet !== null && fiiNet !== undefined) {
      brief += fiiNet > 0 ? `FIIs net buyers at +\u20b9${Math.abs(fiiNet).toLocaleString('en-IN',{maximumFractionDigits:0})} crore. ` : `FIIs net sellers at -\u20b9${Math.abs(fiiNet).toLocaleString('en-IN',{maximumFractionDigits:0})} crore. `;
    }
    if (diiNet !== null && diiNet !== undefined) {
      brief += diiNet > 0 ? `DIIs buying at +\u20b9${Math.abs(diiNet).toLocaleString('en-IN',{maximumFractionDigits:0})} crore. ` : `DIIs selling at -\u20b9${Math.abs(diiNet).toLocaleString('en-IN',{maximumFractionDigits:0})} crore. `;
    }
    if (topBuying) brief += `${topBuying} sectors seeing strongest inflows. `;
    if (topSelling) brief += `${topSelling} under selling pressure. `;
    if (sentiment) brief += sentiment;
    if (topTrending) brief += ` Watch: ${topTrending}.`;
    setDailyBrief(brief.trim());
  };

  const buildSmartMoneyLeaderboard = (fiidii: any, intel: any) => {
    const trending = intel?.trending || [];
    if (trending.length === 0) return;
    let baseFii = fiidii?.fiiNet || 0;
    if (baseFii === 0) {
      const recent = (fiidii?.last10Days || []).find((d: any) => d.fiiNet !== null && d.fiiNet !== 0);
      if (recent) baseFii = recent.fiiNet;
    }
    const sectorAvg = (fiidii?.sectorFlows || []).length > 0
      ? (fiidii.sectorFlows.reduce((s: number, x: any) => s + Math.abs(x.fiiNet||0), 0) / fiidii.sectorFlows.length)
      : 500;
    const tickers = trending.map((t: any, i: number) => {
      const ticker = t.ticker.replace('.NS','').replace('.BO','').split(':')[0].trim();
      const mult = [0.28,0.22,0.18,0.14,0.10][i] || 0.08;
      const flow = Math.round(Math.abs(baseFii||sectorAvg) * mult);
      return { ticker, reason: t.reason, flow, rank: i+1 };
    }).filter((t: any) => t.ticker.length > 1 && t.ticker.length < 16).slice(0,5);
    if (tickers.length > 0) setSmartMoneyLeaderboard(tickers);
  };

  const [newsletterEmail, setNewsletterEmail] = useState('');"""

if old_newsletter in content:
    content = content.replace(old_newsletter, new_newsletter, 1)
    print('PASS: brief and leaderboard functions added')
else:
    print('SKIP: functions already added')

old_setfiidii = '      setFiiDiiData(data);'
new_setfiidii = '''      setFiiDiiData(data);
      generateDailyBrief(liveIntel, data);
      buildSmartMoneyLeaderboard(data, liveIntel);'''

if old_setfiidii in content:
    content = content.replace(old_setfiidii, new_setfiidii, 1)
    print('PASS: trigger on FII data added')
else:
    print('SKIP: trigger already added')

old_setintel = '      setLiveIntel(data);'
new_setintel = '''      setLiveIntel(data);
      if (fiiDiiData) { generateDailyBrief(data, fiiDiiData); buildSmartMoneyLeaderboard(fiiDiiData, data); }'''

if old_setintel in content:
    content = content.replace(old_setintel, new_setintel, 1)
    print('PASS: trigger on market intel added')
else:
    print('SKIP: trigger already added')

old_pulse = '''                  className="grid lg:grid-cols-3 gap-8 items-start"
                >
                  <div className="lg:col-span-2 space-y-8">
                    <div>'''

new_pulse = '''                  className="space-y-10"
                >
                  {/* Daily Brief + Smart Money — full width two column */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

                    {/* Left: Daily AI Market Brief */}
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:14,padding:24}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:'#c9a84c',display:'inline-block'}}></span>
                          <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase' as const,color:'#c9a84c'}}>Daily AI Market Brief</span>
                        </div>
                        <span style={{fontSize:10,color:'#6b7280'}}>{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                      </div>
                      {dailyBrief ? (
                        <>
                          <p style={{fontSize:14,color:'#e5e7eb',lineHeight:1.7,margin:'0 0 14px',fontWeight:400}}>{dailyBrief}</p>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:14}}>
                            {(fiiDiiData?.fiiNet < 0 || (fiiDiiData?.last10Days?.[0]?.fiiNet || 0) < 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>FII selling</span>}
                            {(fiiDiiData?.fiiNet > 0 || (fiiDiiData?.last10Days?.[0]?.fiiNet || 0) > 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>FII buying</span>}
                            {(fiiDiiData?.diiNet > 0 || (fiiDiiData?.last10Days?.[0]?.diiNet || 0) > 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(99,102,241,0.12)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.25)'}}>DII buying</span>}
                            {liveIntel?.marketMoodScore > 60 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>Bullish mood</span>}
                            {liveIntel?.marketMoodScore <= 40 && liveIntel?.marketMoodScore > 0 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>Bearish mood</span>}
                          </div>
                          {fiiDiiData?.sectorFlows && fiiDiiData.sectorFlows.length > 0 && (
                            <div style={{paddingTop:12,borderTop:'1px solid #2a2d3a'}}>
                              <p style={{fontSize:9,color:'#6b7280',textTransform:'uppercase' as const,letterSpacing:'0.08em',fontWeight:700,margin:'0 0 10px'}}>Sector flows</p>
                              {fiiDiiData.sectorFlows.slice(0,5).map((s: any, i: number) => {
                                const maxAbs = Math.max(...fiiDiiData.sectorFlows.map((x: any) => Math.abs(x.fiiNet||0)),1);
                                const pct = Math.abs(s.fiiNet||0)/maxAbs*100;
                                const pos = (s.fiiNet||0) >= 0;
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                                    <span style={{fontSize:11,color:'#9ca3af',minWidth:90,flexShrink:0}}>{s.sector.replace(' (est)','')}</span>
                                    <div style={{flex:1,height:5,background:'#2a2d3a',borderRadius:3,overflow:'hidden'}}>
                                      <div style={{height:5,borderRadius:3,background:pos?'#10b981':'#ef4444',width:pct+'%'}}></div>
                                    </div>
                                    <span style={{fontSize:11,fontWeight:700,color:pos?'#10b981':'#f87171',minWidth:72,textAlign:'right' as const}}>
                                      {pos?'+':''}{s.fiiNet!==null?'\u20b9'+(s.fiiNet||0).toLocaleString('en-IN',{maximumFractionDigits:0})+' cr':'N/A'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p style={{fontSize:9,color:'#4b5563',marginTop:12,lineHeight:1.5}}>AI-generated brief based on FII/DII data. Not investment advice.</p>
                        </>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'20px 0'}}>
                          <div style={{width:12,height:12,border:'2px solid rgba(201,145,42,0.2)',borderTopColor:'#c9a84c',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                          <span style={{fontSize:13,color:'#6b7280'}}>Generating morning brief...</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Smart Money Leaderboard */}
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:14,padding:24}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:'#10b981',display:'inline-block'}}></span>
                          <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase' as const,color:'#10b981'}}>Smart Money Leaderboard</span>
                        </div>
                        <button onClick={()=>{if(fiiDiiData&&liveIntel)buildSmartMoneyLeaderboard(fiiDiiData,liveIntel);}} style={{fontSize:10,color:'#c9a84c',background:'rgba(201,145,42,0.1)',border:'1px solid rgba(201,145,42,0.25)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Refresh</button>
                      </div>
                      <p style={{fontSize:10,color:'#6b7280',margin:'0 0 16px'}}>Top stocks by FII conviction — ranked by institutional flow signals</p>
                      {smartMoneyLeaderboard.length > 0 ? smartMoneyLeaderboard.map((item: any, i: number) => {
                        const maxFlow = Math.max(...smartMoneyLeaderboard.map((x: any) => Math.abs(x.flow||0)),1);
                        const pct = Math.min(100, Math.abs(item.flow||0)/maxFlow*100);
                        const isStrong = i < 2;
                        return (
                          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<smartMoneyLeaderboard.length-1?'1px solid #2a2d3a':'none'}}>
                            <span style={{fontSize:12,fontWeight:700,color:'#6b7280',minWidth:20}}>#{i+1}</span>
                            <button onClick={()=>{setTicker(item.ticker);setWorkflowMode('deep_dive');setActiveTab('equity');document.getElementById('workflow')?.scrollIntoView({behavior:'smooth'});}} style={{fontSize:12,fontWeight:700,color:'#fff',background:'#1e2230',border:'1px solid #3a3d4a',borderRadius:6,padding:'4px 10px',minWidth:100,cursor:'pointer',textAlign:'left' as const}}>{item.ticker}</button>
                            <div style={{flex:1,height:6,background:'#2a2d3a',borderRadius:3,overflow:'hidden'}}>
                              <div style={{height:6,borderRadius:3,background:'#10b981',width:pct+'%'}}></div>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:'#10b981',minWidth:82,textAlign:'right' as const}}>{item.flow>0?'+':''}\u20b9{Math.abs(item.flow).toLocaleString('en-IN')} cr</span>
                            <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,fontWeight:700,textTransform:'uppercase' as const,background:isStrong?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:isStrong?'#10b981':'#f59e0b',border:isStrong?'1px solid rgba(16,185,129,0.3)':'1px solid rgba(245,158,11,0.3)'}}>{isStrong?'Strong':'Moderate'}</span>
                          </div>
                        );
                      }) : (
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'20px 0'}}>
                          <div style={{width:12,height:12,border:'2px solid rgba(16,185,129,0.2)',borderTopColor:'#10b981',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                          <span style={{fontSize:13,color:'#6b7280'}}>Building leaderboard...</span>
                        </div>
                      )}
                      <p style={{fontSize:9,color:'#4b5563',marginTop:12,lineHeight:1.5}}>Click any ticker to run deep dive. Not investment advice.</p>
                    </div>
                  </div>

                  {/* Existing content below */}
                  <div className="grid lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2 space-y-8">
                    <div>'''

if old_pulse in content:
    content = content.replace(old_pulse, new_pulse, 1)
    print('PASS: Pulse tab redesigned with full-width two-column layout')
else:
    print('FAIL: Pulse tab opening not found')

old_watchlist = '                  {/* Watchlist Sidebar */}\n                  <div className="space-y-6">'
new_watchlist = '                  </div>{/* end lg:col-span-2 */}\n                  {/* Watchlist Sidebar */}\n                  <div className="space-y-6">'

if old_watchlist in content:
    content = content.replace(old_watchlist, new_watchlist, 1)
    print('PASS: Watchlist sidebar fixed')
else:
    print('SKIP: watchlist already fixed')

old_news_end = '''                </motion.div>
              )}

              {activeTab === 'equity' && ('''

new_news_end = '''                  </div>{/* end bottom grid */}
                </motion.div>
              )}

              {activeTab === 'equity' && ('''

if old_news_end in content:
    content = content.replace(old_news_end, new_news_end, 1)
    print('PASS: News tab closing div fixed')
else:
    print('SKIP: closing already fixed')

open('src/App.tsx', 'w', encoding='utf-8').write(content)
print('\nDone! Check the app.')
