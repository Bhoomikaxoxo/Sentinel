const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

app.post('/render', async (req, res) => {
  const { url, userAgent, timeout } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  let browser;
  try {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
      (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome-stable');

    browser = await puppeteer.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set custom User-Agent if provided, otherwise default to realistic desktop UA
    const targetUserAgent = userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await page.setUserAgent(targetUserAgent);
    
    // Request English content so screenshots look uniform and clean
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    
    // Try waiting for networkidle2 to ensure all assets/icons/styles load. 
    // If it times out due to analytics trackers or infinite streams, proceed with current state.
    const navTimeout = timeout ? parseInt(timeout) : 10000;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: navTimeout });
    } catch (e) {
      console.log(`Navigation to ${url} reached timeout, proceeding with current DOM state: ${e.message}`);
    }
    
    // Give dynamic JS, animations, and icons a final 2 seconds to settle before screenshotting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const html = await page.content();
    const screenshot = await page.screenshot({ encoding: 'base64' });
    
    res.json({ html, screenshot });
  } catch (err) {
    res.status(500).json({ error: 'Failed to render page', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(4000, () => {
  console.log('Puppeteer worker listening on port 4000');
});
