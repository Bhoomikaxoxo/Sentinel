const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FEED_DIR = path.join(__dirname, '../db/threat-feeds');
const PATH_URLHAUS = path.join(FEED_DIR, 'urlhaus.csv');
const PATH_PHISHTANK = path.join(FEED_DIR, 'phishtank.csv');
const PATH_OPENPHISH = path.join(FEED_DIR, 'openphish.txt');
const PATH_METADATA = path.join(FEED_DIR, 'last-updated.json');

// In-memory lookup structures
let urlhausUrls = new Set();
let urlhausDomains = new Set();
let phishtankUrls = new Set();
let phishtankDomains = new Set();
let openphishUrls = new Set();
let openphishDomains = new Set();

let lastUpdated = { urlhaus: null, phishtank: null, openphish: null };

// Ensure database directory exists
if (!fs.existsSync(FEED_DIR)) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
}

// Simple CSV parser supporting quotes and commas
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(s => s.trim().replace(/^"|"$/g, ''));
}

// Parse URLhaus CSV file
function loadUrlhaus() {
  urlhausUrls.clear();
  urlhausDomains.clear();
  if (!fs.existsSync(PATH_URLHAUS)) return;

  const content = fs.readFileSync(PATH_URLHAUS, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = parseCsvLine(trimmed);
    if (parts.length > 2) {
      const urlStr = parts[2].toLowerCase();
      urlhausUrls.add(urlStr);
      try {
        const u = new URL(urlStr);
        urlhausDomains.add(u.hostname);
      } catch (e) {}
    }
  }
}

// Parse PhishTank CSV file
function loadPhishTank() {
  phishtankUrls.clear();
  phishtankDomains.clear();
  if (!fs.existsSync(PATH_PHISHTANK)) return;

  const content = fs.readFileSync(PATH_PHISHTANK, 'utf-8');
  const lines = content.split('\n');
  let isHeader = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const parts = parseCsvLine(trimmed);
    if (parts.length > 1) {
      const urlStr = parts[1].toLowerCase();
      phishtankUrls.add(urlStr);
      try {
        const u = new URL(urlStr);
        phishtankDomains.add(u.hostname);
      } catch (e) {}
    }
  }
}

// Parse OpenPhish file
function loadOpenPhish() {
  openphishUrls.clear();
  openphishDomains.clear();
  if (!fs.existsSync(PATH_OPENPHISH)) return;

  const content = fs.readFileSync(PATH_OPENPHISH, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed) continue;
    openphishUrls.add(trimmed);
    try {
      const u = new URL(trimmed);
      openphishDomains.add(u.hostname);
    } catch (e) {}
  }
}

// Load metadata timestamps
function loadMetadata() {
  if (fs.existsSync(PATH_METADATA)) {
    try {
      lastUpdated = JSON.parse(fs.readFileSync(PATH_METADATA, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse threat feeds last-updated metadata:', e);
    }
  }
}

// Save metadata timestamps
function saveMetadata() {
  fs.writeFileSync(PATH_METADATA, JSON.stringify(lastUpdated, null, 2));
}

// Load all cached feeds into memory Sets
exports.initFeeds = () => {
  loadMetadata();
  loadUrlhaus();
  loadPhishTank();
  loadOpenPhish();
  console.log(`Threat Feeds loaded in memory: URLhaus (${urlhausUrls.size} URLs), PhishTank (${phishtankUrls.size} URLs), OpenPhish (${openphishUrls.size} URLs)`);
};

// Download single threat feed
async function downloadFeed(name, url, destPath, options = {}) {
  try {
    const response = await axios.get(url, {
      ...options,
      timeout: 30000,
      responseType: 'text'
    });
    fs.writeFileSync(destPath, response.data);
    lastUpdated[name] = new Date().toISOString();
    saveMetadata();
    console.log(`Threat feed ${name} successfully downloaded and cached.`);
    return true;
  } catch (err) {
    console.error(`Failed to download threat feed ${name}:`, err.message);
    return false;
  }
}

// Download/refresh all feeds
exports.refreshFeeds = async () => {
  console.log('Refreshing threat-intelligence community feeds in parallel...');
  
  await Promise.allSettled([
    downloadFeed('urlhaus', 'https://urlhaus.abuse.ch/downloads/csv_recent/', PATH_URLHAUS, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }),
    downloadFeed('phishtank', 'https://data.phishtank.com/data/online-valid.csv', PATH_PHISHTANK, {
      headers: { 'User-Agent': 'phishtank/sentinel-threat-scanner' }
    }),
    downloadFeed('openphish', 'https://openphish.com/feed.txt', PATH_OPENPHISH, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
  ]);

  loadUrlhaus();
  loadPhishTank();
  loadOpenPhish();
};

// Periodic Cron Update Scheduler (every 12 hours)
exports.startScheduler = () => {
  // First update check on startup
  exports.refreshFeeds();

  // 12-hour interval check
  setInterval(() => {
    exports.refreshFeeds();
  }, 12 * 60 * 60 * 1000);
};

// Scan check against all feeds
exports.checkAgainstFeeds = (urlString, hostname) => {
  const urlLower = urlString.toLowerCase().trim();
  const hostLower = hostname.toLowerCase().trim();
  const matchedFeeds = [];

  // Check URLhaus
  if (urlhausUrls.has(urlLower) || urlhausUrls.has(urlLower + '/') || urlhausDomains.has(hostLower)) {
    matchedFeeds.push('urlhaus');
  }

  // Check PhishTank
  if (phishtankUrls.has(urlLower) || phishtankUrls.has(urlLower + '/') || phishtankDomains.has(hostLower)) {
    matchedFeeds.push('phishtank');
  }

  // Check OpenPhish
  if (openphishUrls.has(urlLower) || openphishUrls.has(urlLower + '/') || openphishDomains.has(hostLower)) {
    matchedFeeds.push('openphish');
  }

  // Compute feed status messages (freshness check)
  const feedStatus = {};
  const now = new Date();
  ['urlhaus', 'phishtank', 'openphish'].forEach(feed => {
    if (lastUpdated[feed]) {
      const diffHrs = Math.floor((now - new Date(lastUpdated[feed])) / (1000 * 60 * 60));
      if (diffHrs >= 12) {
        feedStatus[feed] = `stale (fetched ${diffHrs}h ago)`;
      } else {
        feedStatus[feed] = `active (fetched ${diffHrs}h ago)`;
      }
    } else {
      feedStatus[feed] = 'unavailable';
    }
  });

  return {
    matched: matchedFeeds.length > 0,
    sources: matchedFeeds,
    checkedAt: new Date().toISOString(),
    feedStatus
  };
};
