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
  if (!clientId || clientId === 'anonymous') return [];
  const cases = loadCache();
  return cases.filter(c => c.clientId === clientId);
}

function getCaseById(id, clientId) {
  if (!id) return null;
  const cases = loadCache();
  return cases.find(c => c.id === id && (!clientId || c.clientId === clientId)) || null;
}

function addCase(caseFile) {
  if (!caseFile || !caseFile.clientId || caseFile.clientId === 'anonymous') {
    return false;
  }
  const cases = loadCache();
  // Deduplicate strictly per client ID
  const filtered = cases.filter(c => {
    if (c.clientId !== caseFile.clientId) return true;
    const sameId = c.id === caseFile.id;
    const sameUrl = c.url && caseFile.url && c.url.toLowerCase() === caseFile.url.toLowerCase();
    return !(sameId || sameUrl);
  });
  filtered.unshift(caseFile); // Prepend new case
  casesCache = filtered;
  flushToDisk();
  return true;
}

function clearCases(clientId) {
  if (!clientId || clientId === 'anonymous') return false;
  const cases = loadCache();
  casesCache = cases.filter(c => c.clientId !== clientId);
  flushToDisk();
  return true;
}

function updateCase(id, updates, clientId) {
  const cases = loadCache();
  const idx = cases.findIndex(c => c.id === id && (!clientId || c.clientId === clientId));
  if (idx !== -1) {
    cases[idx] = { ...cases[idx], ...updates };
    casesCache = cases;
    flushToDisk();
    return true;
  }
  return false;
}

function getLatestCaseByHostname(hostname, clientId) {
  const cases = loadCache();
  return cases.find(c => {
    if (clientId && c.clientId !== clientId) return false;
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

