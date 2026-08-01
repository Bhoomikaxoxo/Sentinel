const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'cases.json')
  : path.join(__dirname, 'cases.json');

// In-memory cache of case records
let casesCache = null;

function loadCache() {
  if (casesCache !== null) return casesCache;

  if (!fs.existsSync(DB_PATH)) {
    try {
      const seedPath = path.join(__dirname, 'cases.json');
      if (fs.existsSync(seedPath)) {
        const seedData = fs.readFileSync(seedPath, 'utf-8');
        fs.writeFileSync(DB_PATH, seedData);
      } else {
        fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
      }
    } catch (err) {
      console.error('Failed to initialize cases.json database file:', err.message);
    }
  }

  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    casesCache = JSON.parse(data) || [];
  } catch (err) {
    console.error('Failed to read cases from database:', err.message);
    casesCache = [];
  }
  return casesCache;
}

// Asynchronous non-blocking background disk flush
function flushToDisk() {
  const data = JSON.stringify(casesCache || [], null, 2);
  fsPromises.writeFile(DB_PATH, data).catch(err => {
    console.error('Failed to persist cases to disk:', err.message);
  });
}

function getCases(clientId) {
  const cases = loadCache();
  if (clientId) {
    return cases.filter(c => !c.clientId || c.clientId === clientId || c.clientId === 'anonymous');
  }
  return cases;
}

function getCaseById(id) {
  const cases = loadCache();
  return cases.find(c => c.id === id) || null;
}

function addCase(caseFile) {
  const cases = loadCache();
  // Exclude duplicates of the same URL or ID
  const filtered = cases.filter(c => !(c.id === caseFile.id || (c.url && caseFile.url && c.url.toLowerCase() === caseFile.url.toLowerCase())));
  filtered.unshift(caseFile); // Prepend new case
  casesCache = filtered;
  flushToDisk();
  return true;
}

function clearCases(clientId) {
  const cases = loadCache();
  if (clientId) {
    casesCache = cases.filter(c => c.clientId && c.clientId !== clientId && c.clientId !== 'anonymous');
  } else {
    casesCache = [];
  }
  flushToDisk();
  return true;
}

function updateCase(id, updates) {
  const cases = loadCache();
  const idx = cases.findIndex(c => c.id === id);
  if (idx !== -1) {
    cases[idx] = { ...cases[idx], ...updates };
    casesCache = cases;
    flushToDisk();
    return true;
  }
  return false;
}

function getLatestCaseByHostname(hostname) {
  const cases = loadCache();
  return cases.find(c => {
    try {
      const u = new URL(c.url);
      return u.hostname.toLowerCase() === hostname.toLowerCase();
    } catch (e) {
      return false;
    }
  }) || null;
}

module.exports = {
  getCases,
  getCaseById,
  addCase,
  clearCases,
  updateCase,
  getLatestCaseByHostname
};

