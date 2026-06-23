f = open('src/App.tsx', 'r', encoding='utf-8')
c = f.read()
f.close()
results = []

# FIX 1: Leaderboard not populating — build it from FII data directly after it loads
old1 = '      generateDailyBrief(data, intelForBrief);\n      if (intelForBrief) buildSmartMoneyLeaderboard(data, intelForBrief);'
new1 = '      generateDailyBrief(data, intelForBrief);\n      if (intelForBrief) buildSmartMoneyLeaderboard(data, intelForBrief);\n      else if (liveIntel) buildSmartMoneyLeaderboard(data, liveIntel);'
if old1 in c:
    c = c.replace(old1, new1, 1)
    results.append('PASS Fix 1: leaderboard fallback added')
else:
    results.append('FAIL Fix 1')

# FIX 2: Remove sector flows from Daily Brief card to avoid duplication
old2 = '''                          {(fiiDiiData?.sectorFlows||[]).length > 0 && (
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
                          )}'''
new2 = ''
if old2 in c:
    c = c.replace(old2, new2, 1)
    results.append('PASS Fix 2: duplicate sector flows removed from brief')
else:
    results.append('FAIL Fix 2: sector flows pattern not found')

# FIX 3: Fix Bullish Mood badge — only show when mood score genuinely above 60
old3 = '''                            {(liveIntel?.marketMoodScore||0) > 60 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>Bullish mood</span>}
                            {(liveIntel?.marketMoodScore||0) > 0 && (liveIntel?.marketMoodScore||0) <= 40 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>Bearish mood</span>}'''
new3 = '''                            {liveIntel?.marketMoodScore !== null && liveIntel?.marketMoodScore !== undefined && liveIntel.marketMoodScore > 60 && (fiiDiiData?.last10Days?.[0]?.fiiNet||fiiDiiData?.fiiNet||0) > 0 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(16,185,129,0.12)',color:'#10b981',border:'1px solid rgba(16,185,129,0.25)'}}>Bullish mood</span>}
                            {liveIntel?.marketMoodScore !== null && liveIntel?.marketMoodScore !== undefined && liveIntel.marketMoodScore <= 45 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.25)'}}>Bearish mood</span>}
                            {liveIntel?.marketMoodScore !== null && liveIntel?.marketMoodScore !== undefined && liveIntel.marketMoodScore > 45 && liveIntel.marketMoodScore <= 60 && <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'rgba(245,158,11,0.12)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.25)'}}>Neutral mood</span>}'''
if old3 in c:
    c = c.replace(old3, new3, 1)
    results.append('PASS Fix 3: mood badge logic corrected')
else:
    results.append('FAIL Fix 3: mood badge not found')

open('src/App.tsx', 'w', encoding='utf-8').write(c)
print('\nDone!\n')
for r in results:
    print(' ', r)
