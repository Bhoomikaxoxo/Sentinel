const axios = require('axios');

exports.explain = async (scanResult) => {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const rules = (scanResult.triggeredRules || []).map(r => `${r.id}: ${r.desc}`);
  
  const prompt = `
You are an expert security investigator. Analyze the following site forensic threat scan results and write a concise, professional summary (investigator notes).

Scan Details:
- Security Score: ${scanResult.score}/100
- Target URL: ${scanResult.url}
- Triggered Risk Indicators: ${JSON.stringify(rules)}
- Redirect Hops: ${(scanResult.redirectChain || []).length}
- HTTPS Enabled: ${scanResult.url.startsWith('https')}

Instructions:
1. Summarize the triggered risk indicators in plain English.
2. If any check is marked unavailable, offline, or unverified, describe it as unverified — never as clean or safe.
3. Do not conclude the site is safe if any check could not be completed or if a threat feed match was found.
4. Write a concise, paragraph-style summary suitable for a case file. Keep it under 100 words. Do not make up facts.
`;

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2:1b',
      prompt: prompt.trim(),
      stream: false
    }, { timeout: 5000 }); // 5 second timeout
    
    if (response.data && response.data.response) {
      return response.data.response.trim();
    }
    return null;
  } catch (err) {
    // Fail silently to trigger the template explainer fallback
    return null;
  }
};
