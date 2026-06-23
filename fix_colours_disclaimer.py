changes = []

# ── FIX 1: Add permanent SEBI disclaimer bar to landing-concept2.html ──
f = open('landing-concept2.html', 'r', encoding='utf-8')
landing = f.read()
f.close()

old_nav = '    <nav class="nav" id="nav">'
new_nav = '''    <div style="width:100%;background:rgba(201,145,42,0.08);border-bottom:1px solid rgba(201,145,42,0.25);padding:7px 24px;text-align:center;position:relative;z-index:100;">
      <p style="margin:0;font-size:11px;color:#9ca3af;letter-spacing:0.03em;">
        <span style="color:#c9a84c;font-weight:700;">Alphasynth Intelligence</span> provides AI-generated market data analysis only. Not a SEBI-registered Research Analyst. This is not investment advice or a recommendation to buy, sell, or hold any security. &nbsp;|&nbsp; Consult a SEBI-registered advisor before investing.
      </p>
    </div>
    <nav class="nav" id="nav">'''

if old_nav in landing:
    landing = landing.replace(old_nav, new_nav, 1)
    open('landing-concept2.html', 'w', encoding='utf-8').write(landing)
    changes.append("PASS Fix 1: SEBI disclaimer added to landing-concept2.html")
else:
    changes.append("FAIL Fix 1: nav element not found in landing-concept2.html")

# ── FIX 2: Add permanent SEBI disclaimer bar to App.tsx (app landing page) ──
f = open('src/App.tsx', 'r', encoding='utf-8')
app = f.read()
f.close()

old_hero = '      {/* Hero Section */}\n      <section className="pt-32 pb-20 px-6 relative overflow-hidden">'
new_hero = '''      {/* Permanent SEBI Disclaimer Bar */}
      <div style={{width:'100%',background:'rgba(201,145,42,0.06)',borderBottom:'1px solid rgba(201,145,42,0.2)',padding:'7px 24px',textAlign:'center' as const}}>
        <p style={{margin:0,fontSize:11,color:'#9ca3af',letterSpacing:'0.03em'}}>
          <span style={{color:'#c9a84c',fontWeight:700}}>Alphasynth Intelligence</span> provides AI-generated market data analysis only. Not a SEBI-registered Research Analyst. This is not investment advice or a recommendation to buy, sell, or hold any security. &nbsp;|&nbsp; Consult a SEBI-registered advisor before investing.
        </p>
      </div>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">'''

if old_hero in app:
    app = app.replace(old_hero, new_hero, 1)
    changes.append("PASS Fix 2: Permanent SEBI disclaimer added to app landing page")
else:
    changes.append("FAIL Fix 2: Hero section not found in App.tsx")

# ── FIX 3: Enhance conviction score bars with Optionomics colour system ──
old_bar = '''          className={`h-full ${score !== null && score !== undefined ? (score > 7 ? 'bg-gold' : score > 4 ? 'bg-zinc-400' : 'bg-negative') : 'bg-zinc-700'}`}'''
new_bar = '''          style={{
            background: score !== null && score !== undefined
              ? score > 7 ? '#10b981'
              : score > 5 ? '#f59e0b'
              : '#ef4444'
              : '#3f3f46'
          }}'''

if old_bar in app:
    app = app.replace(old_bar, new_bar, 1)
    changes.append("PASS Fix 3: Conviction score bars updated with Optionomics colours")
else:
    changes.append("FAIL Fix 3: Score bar className not found")

# ── FIX 4: Enhance AI insight popup with full Optionomics colour treatment ──
old_popup = '''        <div style={{background:'#1a1d2e',border:'1px solid #6366f1',borderRadius:8,padding:'10px 12px',marginTop:6}}>
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
        </div>'''

new_popup = '''        <div style={{background:'#13161f',border:'1px solid #6366f1',borderRadius:10,padding:'12px 14px',marginTop:8,boxShadow:'0 0 20px rgba(99,102,241,0.15)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#6366f1',display:'inline-block'}}></span>
              <span style={{fontSize:10,color:'#6366f1',fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>AI Insight</span>
              <span style={{fontSize:10,color:'#4b5563',fontWeight:500,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>— {label}</span>
            </div>
            <button onClick={function(e){e.stopPropagation();setOpen(false);}} style={{color:'#6366f1',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:4,cursor:'pointer',fontSize:11,lineHeight:1,padding:'2px 6px',fontWeight:700}}>✕</button>
          </div>
          <div style={{height:'1px',background:'rgba(99,102,241,0.2)',marginBottom:8}}></div>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#6366f1',padding:'4px 0'}}>
              <div style={{width:12,height:12,border:'2px solid rgba(99,102,241,0.2)',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}} />
              <span>Generating explanation...</span>
            </div>
          ) : (
            <p style={{fontSize:12,color:'#d1d5db',lineHeight:1.65,margin:0,fontWeight:400}}>{explanation}</p>
          )}
          <div style={{marginTop:8,paddingTop:6,borderTop:'1px solid rgba(99,102,241,0.1)',fontSize:9,color:'#4b5563',letterSpacing:'0.05em',textTransform:'uppercase' as const}}>
            Alphasynth AI · Informational only · Not financial advice
          </div>
        </div>'''

if old_popup in app:
    app = app.replace(old_popup, new_popup, 1)
    changes.append("PASS Fix 4: AI insight popup enhanced with full Optionomics colours")
else:
    changes.append("FAIL Fix 4: AI insight popup not found")

# ── FIX 5: Update score value colour to match bar colour ──
old_score_val = '''        <span className="text-zinc-200">{score !== null && score !== undefined ? score + '/10' : 'N/A'}</span>'''
new_score_val = '''        <span style={{color: score !== null && score !== undefined ? score > 7 ? '#10b981' : score > 5 ? '#f59e0b' : '#ef4444' : '#71717a', fontWeight: 700}}>{score !== null && score !== undefined ? score + '/10' : 'N/A'}</span>'''

if old_score_val in app:
    app = app.replace(old_score_val, new_score_val, 1)
    changes.append("PASS Fix 5: Score value colour matches bar colour")
else:
    changes.append("FAIL Fix 5: Score value span not found")

open('src/App.tsx', 'w', encoding='utf-8').write(app)

print("\nAll fixes applied!\n")
print("Results:")
for c in changes:
    print(" ", c)
