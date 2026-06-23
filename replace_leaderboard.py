f = open('src/App.tsx', 'r', encoding='utf-8')
c = f.read()
f.close()

old = '''                    {/* RIGHT: Smart Money Leaderboard */}
                    <div style={{ background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 14, padding: 24}}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', flexShrink: 0 }} />
                        <span style={{ color: '#10b981', fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Smart Money Leaderboard</span>
                      </div>
                      {smartMoneyLeaderboard.length > 0 ? (
                        <div>
                          {(() => {
                            const maxFlow = Math.max(...smartMoneyLeaderboard.map((x: any) => x.flow || 0), 1);
                            return smartMoneyLeaderboard.slice(0, 5).map((item: any, i: number) => {
                              const strong = i < 2;
                              const pct = (item.flow / maxFlow) * 100;
                              return (
                                <div
                                  key={item.ticker}
                                  onClick={() => {
                                    setTicker(item.ticker);
                                    setWorkflowMode('deep_dive');
                                    setActiveTab('equity');
                                    document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', cursor: 'pointer', borderBottom: i < 4 ? '1px solid #20232e' : 'none' }}
                                >
                                  <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 800, width: 18, flexShrink: 0 }}>{i + 1}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                      <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>{item.ticker}</span>
                                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', background: strong ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: strong ? '#10b981' : '#f59e0b' }}>{strong ? 'Strong' : 'Moderate'}</span>
                                    </div>
                                    <div style={{ height: 8, background: '#0c0e15', borderRadius: 999, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: '#10b981' }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                          <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid #2a2d3a', borderTopColor: '#10b981', borderRadius: '50%' }} />
                        </div>
                      )}
                    </div>'''

new = '''                    {/* RIGHT: Sector Flow Snapshot */}
                    <div style={{ background: '#13161f', border: '1px solid #2a2d3a', borderRadius: 14, padding: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
                          <span style={{ color: '#c9a84c', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sector FII Flow Snapshot</span>
                        </div>
                        <span style={{ fontSize: 9, color: '#6b7280' }}>Source: NSE · {fiiDiiData?.date || 'Latest available'}</span>
                      </div>
                      <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 16px' }}>FII net buying/selling by sector — scroll down for full 10-day monitor</p>
                      {fiiDiiData?.sectorFlows?.length > 0 ? (
                        <div>
                          {(() => {
                            const flows = [...(fiiDiiData.sectorFlows)].sort((a: any, b: any) => (b.fiiNet || 0) - (a.fiiNet || 0));
                            const maxAbs = Math.max(...flows.map((x: any) => Math.abs(x.fiiNet || 0)), 1);
                            return flows.map((s: any, i: number) => {
                              const pos = (s.fiiNet || 0) >= 0;
                              const pct = Math.abs(s.fiiNet || 0) / maxAbs * 100;
                              return (
                                <div key={i} style={{ marginBottom: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 600 }}>{s.sector.replace(' (est)', '')}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: pos ? '#10b981' : '#f43f5e' }}>
                                      {pos ? '+' : ''}{'\u20b9'}{Math.abs(s.fiiNet || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} cr
                                      {s.sector.includes('est') && <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 3 }}>(est)</span>}
                                    </span>
                                  </div>
                                  <div style={{ height: 6, background: '#1e2230', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: 6, borderRadius: 3, background: pos ? '#10b981' : '#f43f5e', width: pct + '%', transition: 'width 0.8s ease' }} />
                                  </div>
                                </div>
                              );
                            });
                          })()}
                          <p style={{ fontSize: 9, color: '#4b5563', marginTop: 14, lineHeight: 1.5 }}>
                            Sector data sourced from NSE disclosures. Estimated values marked (est). Not investment advice.
                          </p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', gap: 10 }}>
                          <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid #2a2d3a', borderTopColor: '#c9a84c', borderRadius: '50%' }} />
                          <span style={{ fontSize: 12, color: '#6b7280' }}>Loading sector flows...</span>
                        </div>
                      )}
                    </div>'''

if old in c:
    c = c.replace(old, new, 1)
    open('src/App.tsx', 'w', encoding='utf-8').write(c)
    print('PASS: Leaderboard replaced with Sector Flow Snapshot card')
else:
    print('FAIL: Leaderboard card not found')
