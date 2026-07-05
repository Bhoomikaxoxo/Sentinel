const store = require('../db/store');
const scanService = require('./scanService');

async function checkWatchedDomains() {
  console.log('Running background watchlist rescan check...');
  const cases = store.getCases();
  // Filter cases that are watched
  const watchedCases = cases.filter(c => c.watched === true);
  
  for (const watched of watchedCases) {
    try {
      let hostname = '';
      try {
        hostname = new URL(watched.url).hostname;
      } catch (e) {
        continue;
      }
      
      const prevScore = watched.score;
      console.log(`Rescanning watched domain: ${watched.url} (Previous score: ${prevScore})`);
      
      // Execute the scan (automatically diffs visuals and saves)
      const newCase = await scanService.scanUrl(watched.url, { timeout: 15000 });
      
      const scoreDropped = (prevScore - newCase.score) > 15;
      const hasVisualAlert = newCase.visualDiffPercent > 30;
      
      if (scoreDropped || hasVisualAlert) {
        store.updateCase(newCase.id, { alert: true });
        console.log(`Watchlist alert triggered for ${watched.url}! Visual diff: ${newCase.visualDiffPercent}%, Score drop: ${prevScore - newCase.score}`);
      }
    } catch (err) {
      console.error(`Failed to background-check watched domain ${watched.url}:`, err.message);
    }
  }
}

exports.startMonitoring = () => {
  // Run initial scan 1 minute after startup
  setTimeout(checkWatchedDomains, 60 * 1000);
  
  // Interval check every 6 hours
  setInterval(checkWatchedDomains, 6 * 60 * 60 * 1000);
};
