changes = []

f = open('src/App.tsx', 'r', encoding='utf-8')
app = f.read()
f.close()

old_pulse_open = '''              {activeTab === 'news' && (
                <motion.div
                  key="news"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="grid lg:grid-cols-3 gap-8 items-start"
                >
                  <div className="lg:col-span-2 space-y-8">

                    {/* ── Daily Brief + Smart Money side by side ── */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:8}}>

                    {/* Left: Daily AI Market Brief */}
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:12,padding:20}}>'''

new_pulse_open = '''              {activeTab === 'news' && (
                <motion.div
                  key="news"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-10"
                >
                  {/* ── TOP ROW: Daily Brief + Smart Money full width side by side ── */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

                    {/* Left: Daily AI Market Brief */}
                    <div style={{background:'#13161f',border:'1px solid #2a2d3a',borderRadius:14,padding:24}}>'''

if old_pulse_open in app:
    app = app.replace(old_pulse_open, new_pulse_open, 1)
    changes.append("PASS Fix 1: Pulse tab redesigned to full-width layout")
else:
    changes.append("FAIL Fix 1: Pulse tab opening not found")

# Fix the closing of the two-column grid and opening of the main content
old_grid_close = '''                    </div>{/* end right column */}
                    </div>{/* end grid */}

                    <div>
                    <div className="flex items-center justify-between mb-2">
                       <h2 className="text-4xl font-display font-semibold tracking-tight text-white">Market Intelligence Snapshot</h2>'''

new_grid_close = '''                    </div>{/* end right column */}
                  </div>{/* end top row grid */}

                  {/* ── BOTTOM ROW: existing content full width ── */}
                  <div className="grid lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2 space-y-8">
                    <div>
                    <div className="flex items-center justify-between mb-2">
                       <h2 className="text-4xl font-display font-semibold tracking-tight text-white">Market Intelligence Snapshot</h2>'''

if old_grid_close in app:
    app = app.replace(old_grid_close, new_grid_close, 1)
    changes.append("PASS Fix 2: Main content restored in proper 3-column grid")
else:
    changes.append("FAIL Fix 2: Grid close not found")

# Fix the watchlist sidebar closing — need to close the lg:col-span-2 and add the watchlist col
old_watchlist_open = '''                  {/* Watchlist Sidebar */}
                  <div className="space-y-6">'''

new_watchlist_open = '''                  </div>{/* end lg:col-span-2 */}
                  {/* Watchlist Sidebar */}
                  <div className="space-y-6">'''

if old_watchlist_open in app:
    app = app.replace(old_watchlist_open, new_watchlist_open, 1)
    changes.append("PASS Fix 3: Watchlist sidebar properly closed")
else:
    changes.append("FAIL Fix 3: Watchlist sidebar not found")

# Find and fix the closing of the entire news tab - need to close the bottom grid
old_news_close = '''                </motion.div>
              )}

              {activeTab === 'equity' && ('''

new_news_close = '''                  </div>{/* end bottom row grid */}
                </motion.div>
              )}

              {activeTab === 'equity' && ('''

if old_news_close in app:
    app = app.replace(old_news_close, new_news_close, 1)
    changes.append("PASS Fix 4: News tab closing div fixed")
else:
    changes.append("FAIL Fix 4: News tab closing not found")

# Also improve the Daily Brief card padding and font sizes for better readability
old_brief_text = '''                          <p style={{fontSize:13,color:'#d1d5db',lineHeight:1.65,margin:'0 0 12px'}}>{dailyBrief}</p>'''
new_brief_text = '''                          <p style={{fontSize:14,color:'#e5e7eb',lineHeight:1.7,margin:'0 0 14px',fontWeight:400}}>{dailyBrief}</p>'''

if old_brief_text in app:
    app = app.replace(old_brief_text, new_brief_text, 1)
    changes.append("PASS Fix 5: Brief text size improved")
else:
    changes.append("FAIL Fix 5: Brief text not found")

open('src/App.tsx', 'w', encoding='utf-8').write(app)

print("\nAll fixes applied!\n")
print("Results:")
for c in changes:
    print(" ", c)
