f = open('src/App.tsx', 'r', encoding='utf-8')
c = f.read()
f.close()
results = []

# FIX 1: Build leaderboard directly from FII data when it loads, using offline fallback tickers
old1 = '      generateDailyBrief(data, intelForBrief);\n      if (liveIntel?.trending?.length) buildSmartMoneyLeaderboard(data, liveIntel);\n      else if (intelForBrief?.trending?.length) buildSmartMoneyLeaderboard(data, intelForBrief);'
new1 = '''      generateDailyBrief(data, intelForBrief);
      const intelForLeaderboard = liveIntel || intelForBrief;
      if (intelForLeaderboard?.trending?.length) {
        buildSmartMoneyLeaderboard(data, intelForLeaderboard);
      } else {
        const fallbackTrending = { trending: [
          { ticker: 'RELIANCE', reason: 'Large cap anchor' },
          { ticker: 'HDFCBANK', reason: 'Banking sector leader' },
          { ticker: 'INFY', reason: 'IT sector bellwether' },
          { ticker: 'TCS', reason: 'Top IT company' },
          { ticker: 'ICICIBANK', reason: 'Private bank leader' }
        ]};
        buildSmartMoneyLeaderboard(data, fallbackTrending);
      }'''
if old1 in c:
    c = c.replace(old1, new1, 1)
    results.append('PASS Fix 1: leaderboard now always populates')
else:
    results.append('FAIL Fix 1')

# Also fix the market intel trigger to always build leaderboard
old1b = '      generateDailyBrief(null, data);\n      if (liveIntel?.trending?.length) buildSmartMoneyLeaderboard(fiiDiiData, data);'
new1b = '''      generateDailyBrief(fiiDiiData, data);
      if (data?.trending?.length) buildSmartMoneyLeaderboard(fiiDiiData || {}, data);'''
if old1b in c:
    c = c.replace(old1b, new1b, 1)
    results.append('PASS Fix 1b: market intel trigger fixed')
else:
    results.append('FAIL Fix 1b')

# FIX 2: Fix "Good morning" to time-appropriate greeting with timestamp
old2 = "Good morning. FIIs turned"
new2 = "Market Update. FIIs turned"
if old2 in c:
    c = c.replace(old2, new2, 1)
    results.append('PASS Fix 2a: Good morning removed')
else:
    results.append('SKIP Fix 2a')

# Fix in generateDailyBrief function - replace hardcoded greeting
old2b = "    let brief = dataDate ? 'As of '+dataDate+': ' : '';"
new2b = """    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const greeting = hour < 12 ? 'Pre-market update' : hour < 16 ? 'Intraday update' : 'Post-market update';
    let brief = greeting + ' (' + timeStr + ' IST)' + (dataDate ? ', as of ' + dataDate : '') + ': ';"""
if old2b in c:
    c = c.replace(old2b, new2b, 1)
    results.append('PASS Fix 2b: time-appropriate greeting added')
else:
    results.append('FAIL Fix 2b')

# FIX 3: Fear & Greed - use FII data to override misleading score colour
old3 = "                            {liveIntel.marketMoodScore > 80 ? 'Exuberance' : liveIntel.marketMoodScore > 60 ? 'Greed' : liveIntel.marketMoodScore > 40 ? 'Neutral' : liveIntel.marketMoodScore > 20 ? 'Fear' : 'Panic'}"
new3 = "                            {(() => { const score = liveIntel.marketMoodScore; const fiiBias = fiiDiiData?.last10Days?.slice(0,3).filter((d:any)=>d.fiiNet<0).length >= 2; if (fiiBias && score > 60) return 'Caution'; return score > 80 ? 'Exuberance' : score > 60 ? 'Greed' : score > 40 ? 'Neutral' : score > 20 ? 'Fear' : 'Panic'; })()}"
if old3 in c:
    c = c.replace(old3, new3, 1)
    results.append('PASS Fix 3: Fear & Greed label adjusted for FII bias')
else:
    results.append('FAIL Fix 3')

open('src/App.tsx', 'w', encoding='utf-8').write(c)
print('\nDone!\n')
for r in results:
    print(' ', r)
