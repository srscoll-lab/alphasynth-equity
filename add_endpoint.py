f = open('server.ts', 'r', encoding='utf-8')
content = f.read()
f.close()

old = '  app.post("/api/pipeline/scrape", async (req, res) => {'
new = '''  app.post("/api/explain-metric", async (req, res) => {
    try {
      const { ticker, metricName, metricValue, companyName } = req.body;
      if (!metricName) { res.status(400).json({ error: 'metricName required' }); return; }
      const ai = getGenAI();
      const prompt = `You are a plain-English financial educator for Indian retail investors. Explain what the following metric score means for ${companyName || ticker} specifically. Write 2-3 sentences maximum for someone with no financial background. Be specific to this company. Do not start with the metric name. Maximum 60 words.

Metric: ${metricName}
Score: ${metricValue}
Company: ${companyName || ticker}`;
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 800 }
      });
      const explanation = (result.text || "").trim();
      res.json({ explanation });
    } catch (err: any) {
      console.error("explain-metric error:", err);
      res.status(500).json({ explanation: "Unable to generate explanation at this time." });
    }
  });

  app.post("/api/pipeline/scrape", async (req, res) => {'''

if old in content:
    content = content.replace(old, new, 1)
    open('server.ts', 'w', encoding='utf-8').write(content)
    print('PASS: /api/explain-metric endpoint added')
else:
    print('SKIP: endpoint already exists or scrape route not found')
