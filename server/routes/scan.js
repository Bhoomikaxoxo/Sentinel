const express = require('express');
const router = express.Router();
const scanService = require('../services/scanService');

// Single Scan API
router.post('/', async (req, res) => {
  const { url, userAgent, timeout } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const caseFile = await scanService.scanUrl(url, { userAgent, timeout });
    res.json(caseFile);
  } catch (error) {
    res.status(500).json({ error: 'Investigation failed: ' + error.message });
  }
});

// Batch Scan API
router.post('/batch', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'URLs array is required' });
  }

  // Cap at 20 URLs to avoid resource exhaustion
  const targets = urls.slice(0, 20);
  const results = [];

  console.log(`Starting batch scan of ${targets.length} targets...`);

  // Process sequentially to protect Puppeteer render worker
  for (const targetUrl of targets) {
    if (!targetUrl || typeof targetUrl !== 'string') continue;
    try {
      const caseFile = await scanService.scanUrl(targetUrl, { timeout: 10000 });
      // Store lightweight summary object for batch results table
      results.push({
        id: caseFile.id,
        url: caseFile.url,
        score: caseFile.score,
        priority: caseFile.priority,
        reasons: caseFile.reasons,
        timestamp: caseFile.timestamp
      });
    } catch (err) {
      results.push({
        url: targetUrl,
        error: err.message,
        score: 0,
        priority: 'ERROR'
      });
    }
  }

  res.json({ results });
});

module.exports = router;
