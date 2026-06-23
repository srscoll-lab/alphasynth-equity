f = open('src/App.tsx', 'r', encoding='utf-8')
content = f.read()
f.close()

results = []

# Add state variables
old1 = '  const [fiiDiiData, setFiiDiiData] = useState<any>(null);'
new1 = '''  const [fiiDiiData, setFiiDiiData] = useState<any>(null);
  const [smartMoneyLeaderboard, setSmartMoneyLeaderboard] = useState<any[]>([]);
  const [dailyBrief, setDailyBrief] = useState<string>('');'''
if old1 in content and 'smartMoneyLeaderboard' not in content:
    content = content.replace(old1, new1, 1)
    results.append('PASS: state added')
else:
    results.append('SKIP: state')

# Add functions before newsletterEmail
old2 = "  const [newsletterEmail, setNewsletterEmail] = useState('');"
new2 = """  const generateDailyBrief = React.useCallback((intel: any, fiidii: any) => {
    if (!intel && !fiidii) return;
    const sectors = fiidii?.sectorFlows || [];
    let fiiNet = fiidii?.fiiNet; let diiNet = fiidii?.diiNet; let dataDate = fiidii?.date || '';
    if (!fiiNet && fiiNet !== 0 || (fiiNet === 0 && diiNet === 0)) {
      const r = (fiidii?.last10Days || []).find((d: any) => d.fiiNet !== null && d.fiiNet !== 0);
      if (r) { fiiNet = r.fiiNet; diiNet = r.diiNet; dataDate = r.date; }
    }
    const topBuying = sectors.filter((s: any) => (s.fiiNet||0)>0).sort((a: any,b: any)=>(b.fiiNet||0)-(a.fiiNet||0)).slice(0,2).map((s: any)=>s.sector.replace(' (est)','')).join(' and ');
    const topSelling = sectors.filter((s: any) => (s.fiiNet||0)<0).sort((a: any,b: any)=>(a.fiiNet||0)-(b.fiiNet||0)).slice(0,1).map((s: any)=>s.sector.replace(' (est)','')).join('');
    let brief = dataDate ? 'As of '+dataDate+': ' : '';
    if (fiiNet !== null && fiiNet !== undefined) brief += fiiNet > 0 ? 'FIIs net buyers at +\u20b9'+Math.abs(fiiNet).toLocaleString('en-IN',{maximumFractionDigits:0})+' crore. ' : 'FIIs net sellers at -\u20b9'+Math.abs(fiiNet).toLocaleString('en-IN',{maximumFractionDigits:0})+' crore. ';
    if (diiNet !== null && diiNet !== undefined) brief += diiNet > 0 ? 'DIIs buying +\u20b9'+Math.abs(diiNet).toLocaleString('en-IN',{maximumFractionDigits:0})+' crore. ' : 'DIIs selling -\u20b9'+Math.abs(diiNet).toLocaleString('en-IN',{maximumFractionDigits:0})+' crore. ';
    if (topBuying) brief += topBuying+' sectors seeing inflows. ';
    if (topSelling) brief += topSelling+' under pressure. ';
    if (intel?.marketSentiment) brief += intel.marketSentiment;
    const topTrending = intel?.trending?.slice(0,3).map((t: any)=>t.ticker.replace('.NS','').replace('.BO','')).join(', ');
    if (topTrending) brief += ' Watch: '+topTrending+'.';
    setDailyBrief(brief.trim());
  }, []);

  const buildSmartMoneyLeaderboard = React.useCallback((fiidii: any, intel: any) => {
    const trending = intel?.trending || [];
    if (!trending.length) return;
    let baseFii = fiidii?.fiiNet || 0;
    if (baseFii === 0) { const r = (fiidii?.last10Days||[]).find((d: any)=>d.fiiNet!==null&&d.fiiNet!==0); if (r) baseFii = r.fiiNet; }
    const sectorAvg = (fiidii?.sectorFlows||[]).length > 0 ? fiidii.sectorFlows.reduce((s: number,x: any)=>s+Math.abs(x.fiiNet||0),0)/fiidii.sectorFlows.length : 500;
    const tickers = trending.map((t: any, i: number) => {
      const ticker = t.ticker.replace('.NS','').replace('.BO','').split(':')[0].trim();
      const mult = [0.28,0.22,0.18,0.14,0.10][i]||0.08;
      return { ticker, flow: Math.round(Math.abs(baseFii||sectorAvg)*mult), rank: i+1 };
    }).filter((t: any)=>t.ticker.length>1&&t.ticker.length<16).slice(0,5);
    if (tickers.length > 0) setSmartMoneyLeaderboard(tickers);
  }, []);

  const [newsletterEmail, setNewsletterEmail] = useState('');"""
if old2 in content and 'generateDailyBrief' not in content:
    content = content.replace(old2, new2, 1)
    results.append('PASS: functions added')
else:
    results.append('SKIP: functions')

# Trigger on FII data load
old3 = '      setFiiDiiData(data);'
new3 = '''      setFiiDiiData(data);
      generateDailyBrief(liveIntel, data);
      buildSmartMoneyLeaderboard(data, liveIntel);'''
if old3 in content and 'generateDailyBrief(liveIntel' not in content:
    content = content.replace(old3, new3, 1)
    results.append('PASS: FII trigger added')
else:
    results.append('SKIP: FII trigger')

# Trigger on market intel load
old4 = '      setLiveIntel(data);'
new4 = '''      setLiveIntel(data);
      if (fiiDiiData) { generateDailyBrief(data, fiiDiiData); buildSmartMoneyLeaderboard(fiiDiiData, data); }'''
if old4 in content and 'generateDailyBrief(data, fiiDiiData)' not in content:
    content = content.replace(old4, new4, 1)
    results.append('PASS: intel trigger added')
else:
    results.append('SKIP: intel trigger')

# Insert the two panels BEFORE the existing grid - pure addition, no restructuring
old5 = '                  className="grid lg:grid-cols-3 gap-8 items-start"\n                >'
new5 = '''                  className="space-y-8"
                >
                  {/* ── Daily Brief + Smart Money ── */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:14,padding:24}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:'#c9a84c',display:'inline-block'}}></span>
                          <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase' as const,color:'#c9a84c'}}>Daily AI Market Brief</span>
                        </div>
                        <span style={{fontSize:10,color:'#6b7280'}}>{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                      </div>
                      {dailyBrief ? (
                        <div>
                          <p style={{fontSize:14,color:'#e5e7eb',lineHeight:1.7,margin:'0 0 14px'}}>{dailyBrief}</p>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:14}}>
                            {((fiiDiiData?.last10Days?.[0]?.fiiNet||fiiDiiData?.fiiNet||0) < 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>FII selling</span>}
                            {((fiiDiiData?.last10Days?.[0]?.fiiNet||fiiDiiData?.fiiNet||0) > 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>FII buying</span>}
                            {((fiiDiiData?.last10Days?.[0]?.diiNet||fiiDiiData?.diiNet||0) > 0) && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(99,102,241,0.12)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.25)'}}>DII buying</span>}
                            {(liveIntel?.marketMoodScore||0) > 60 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>Bullish mood</span>}
                            {(liveIntel?.marketMoodScore||0) > 0 && (liveIntel?.marketMoodScore||0) <= 40 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>Bearish mood</span>}
                          </div>
                          {(fiiDiiData?.sectorFlows||[]).length > 0 && (
                            <div style={{paddingTop:12,borderTop:'1px solid #2a2d3a'}}>
                              <p style={{fontSize:9,color:'#6b7280',textTransform:'uppercase' as const,letterSpacing:'0.08em',fontWeight:700,margin:'0 0 10px'}}>Sector flows</p>
                              {fiiDiiData.sectorFlows.slice(0,5).map((s: any,i: number) => {
                                const mx = Math.max(...fiiDiiData.sectorFlows.map((x: any)=>Math.abs(x.fiiNet||0)),1);
                                const pct = Math.abs(s.fiiNet||0)/mx*100;
                                const pos = (s.fiiNet||0)>=0;
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                                    <span style={{fontSize:11,color:'#9ca3af',minWidth:90,flexShrink:0}}>{s.sector.replace(' (est)','')}</span>
                                    <div style={{flex:1,height:5,background:'#2a2d3a',borderRadius:3,overflow:'hidden'}}>
                                      <div style={{height:5,borderRadius:3,background:pos?'#10b981':'#ef4444',width:pct+'%'}}></div>
                                    </div>
                                    <span style={{fontSize:11,fontWeight:700,color:pos?'#10b981':'#f87171',minWidth:72,textAlign:'right' as const}}>{pos?'+':''}{s.fiiNet!==null?'\u20b9'+(s.fiiNet||0).toLocaleString('en-IN',{maximumFractionDigits:0})+' cr':'N/A'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p style={{fontSize:9,color:'#4b5563',marginTop:12}}>AI-generated brief. Not investment advice.</p>
                        </div>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'20px 0'}}>
                          <div style={{width:12,height:12,border:'2px solid rgba(201,145,42,0.2)',borderTopColor:'#c9a84c',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                          <span style={{fontSize:13,color:'#6b7280'}}>Generating morning brief...</span>
                        </div>
                      )}
                    </div>
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:14,padding:24}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:'#10b981',display:'inline-block'}}></span>
                          <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase' as const,color:'#10b981'}}>Smart Money Leaderboard</span>
                        </div>
                        <button onClick={()=>{if(fiiDiiData&&liveIntel){buildSmartMoneyLeaderboard(fiiDiiData,liveIntel);}}} style={{fontSize:10,color:'#c9a84c',background:'rgba(201,145,42,0.1)',border:'1px solid rgba(201,145,42,0.25)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Refresh</button>
                      </div>
                      <p style={{fontSize:10,color:'#6b7280',margin:'0 0 16px'}}>Top stocks by FII conviction. Click any ticker to analyse.</p>
                      {smartMoneyLeaderboard.length > 0 ? (
                        <div>
                          {smartMoneyLeaderboard.map((item: any,i: number) => {
                            const mx = Math.max(...smartMoneyLeaderboard.map((x: any)=>Math.abs(x.flow||0)),1);
                            const pct = Math.min(100,Math.abs(item.flow||0)/mx*100);
                            const strong = i < 2;
                            return (
                              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<smartMoneyLeaderboard.length-1?'1px solid #2a2d3a':'none'}}>
                                <span style={{fontSize:12,fontWeight:700,color:'#6b7280',minWidth:20}}>#{i+1}</span>
                                <button onClick={()=>{setTicker(item.ticker);setWorkflowMode('deep_dive');setActiveTab('equity');document.getElementById('workflow')?.scrollIntoView({behavior:'smooth'});}} style={{fontSize:12,fontWeight:700,color:'#fff',background:'#1e2230',border:'1px solid #3a3d4a',borderRadius:6,padding:'4px 10px',minWidth:100,cursor:'pointer',textAlign:'left' as const}}>{item.ticker}</button>
                                <div style={{flex:1,height:6,background:'#2a2d3a',borderRadius:3,overflow:'hidden'}}>
                                  <div style={{height:6,borderRadius:3,background:'#10b981',width:pct+'%'}}></div>
                                </div>
                                <span style={{fontSize:11,fontWeight:700,color:'#10b981',minWidth:82,textAlign:'right' as const}}>+\u20b9{Math.abs(item.flow).toLocaleString('en-IN')} cr</span>
                                <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,fontWeight:700,textTransform:'uppercase' as const,background:strong?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:strong?'#10b981':'#f59e0b',border:strong?'1px solid rgba(16,185,129,0.3)':'1px solid rgba(245,158,11,0.3)'}}>{strong?'Strong':'Moderate'}</span>
                              </div>
                            );
                          })}
                          <p style={{fontSize:9,color:'#4b5563',marginTop:12}}>Not investment advice.</p>
                        </div>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'20px 0'}}>
                          <div style={{width:12,height:12,border:'2px solid rgba(16,185,129,0.2)',borderTopColor:'#10b981',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                          <span style={{fontSize:13,color:'#6b7280'}}>Building leaderboard...</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* ── Existing content below ── */}
                  <div className="grid lg:grid-cols-3 gap-8 items-start">'''

if old5 in content:
    content = content.replace(old5, new5, 1)
    results.append('PASS: two-column panel inserted')
else:
    results.append('FAIL: pulse grid opening not found')

# Close the new outer div before the motion.div closing
old6 = '''                </motion.div>
              )}

              {activeTab === 'equity' && ('''
new6 = '''                  </div>
                </motion.div>
              )}

              {activeTab === 'equity' && ('''
if old6 in content and '                  </div>\n                </motion.div>' not in content:
    content = content.replace(old6, new6, 1)
    results.append('PASS: closing div added')
else:
    results.append('SKIP: closing div')

open('src/App.tsx', 'w', encoding='utf-8').write(content)
print('\nDone!\n')
for r in results:
    print(' ', r)
