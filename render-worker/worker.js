const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
      (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome-stable');

    console.log('[Worker] Launching persistent Chromium instance...');
    browserInstance = await puppeteer.launch({
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-zygote',
        '--mute-audio'
      ]
    });
  }
  return browserInstance;
}

app.post('/render', async (req, res) => {
  const { url, userAgent, timeout } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Enable request interception to block heavy assets (videos, fonts) and speed up rendering dramatically
    await page.setRequestInterception(true);
    page.on('request', (interceptedReq) => {
      const resourceType = interceptedReq.resourceType();
      if (['media', 'font', 'other'].includes(resourceType)) {
        interceptedReq.abort();
      } else {
        interceptedReq.continue();
      }
    });
    
    // Set custom User-Agent if provided, otherwise default to realistic desktop UA
    const targetUserAgent = userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await page.setUserAgent(targetUserAgent);
    
    // Request English content so screenshots look uniform and clean
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    
    // Try waiting for domcontentloaded/networkidle2
    const navTimeout = timeout ? parseInt(timeout) : 8000;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
    } catch (e) {
      console.log(`Navigation to ${url} reached timeout, proceeding with current DOM state: ${e.message}`);
    }
    
    // Fast 500ms settle time before screenshotting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const html = await page.content();
    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    
    res.json({ html, screenshot });
  } catch (err) {
    res.status(500).json({ error: 'Failed to render page', details: err.message });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
});

app.listen(4000, () => {
  console.log('Puppeteer worker listening on port 4000 (browser pooling enabled)');
});

