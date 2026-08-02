const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {}

exports.explain = async (scanResult) => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const rules = (scanResult.triggeredRules || []).map(r => `${r.id}: ${r.desc || r.id}`);
  
  const prompt = `
You are a senior cybersecurity threat intelligence investigator analyzing a scanned website target.
Write a concise, professional threat analysis summary for a forensic case file.

Scan Target Details:
- Target URL: ${scanResult.url}
- Threat Risk Score: ${scanResult.score}/100 (0 = Extreme Risk/Malicious, 100 = Clean/Safe)
- Triggered Risk Indicators: ${JSON.stringify(rules)}
- Redirect Hops: ${(scanResult.redirectChain || []).length}
- HTTPS Security: ${scanResult.url.startsWith('https') ? 'Enabled' : 'Disabled (Insecure HTTP)'}

Instructions:
1. Summarize the overall security posture and key risk factors in plain English.
2. Highlight any critical vulnerabilities, domain issues, or threat feed hits.
3. Only classify a finding as 'risk' if it indicates suspicious, vulnerable, or anomalous behavior. Findings that are reassuring or indicate legitimacy (verified domain age, established brand, valid SSL, etc.) must be classified as 'positive', never 'risk'.
4. Keep the summary under 120 words. Write in a clear, authoritative, forensic tone suitable for security teams.
`;

  // 1. Try Gemini API first if key is available
  if (apiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await axios.post(geminiUrl, {
        contents: [
          {
            parts: [{ text: prompt.trim() }]
          }
        ]
      }, { timeout: 8000 });

      if (response.data && response.data.candidates && response.data.candidates[0]?.content?.parts[0]?.text) {
        console.log('[Explainer Service] Forensic summary generated via Gemini AI.');
        return response.data.candidates[0].content.parts[0].text.trim();
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        console.warn('[Explainer Service] WARNING: GEMINI_API_KEY in server/.env is invalid or unauthenticated (HTTP 401). Please update GEMINI_API_KEY with a valid Google AI Studio key.');
      } else {
        console.log(`[Explainer Service] Gemini API request failed (${err.message}). Falling back to template explainer...`);
      }
    }
  }

  // 2. Try Local Ollama fallback if available
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2:1b',
      prompt: prompt.trim(),
      stream: false
    }, { timeout: 4000 });
    
    if (response.data && response.data.response) {
      return response.data.response.trim();
    }
  } catch (err) {
    // Fail silently to trigger the template explainer fallback
  }

  return null;
};
