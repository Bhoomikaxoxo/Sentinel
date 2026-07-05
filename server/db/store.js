const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'cases.json');

function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
  }
}

function getCases() {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('Failed to read cases from database:', err.message);
    return [];
  }
}

function getCaseById(id) {
  const cases = getCases();
  return cases.find(c => c.id === id) || null;
}

function addCase(caseFile) {
  initDb();
  try {
    const cases = getCases();
    // Exclude duplicates of the same URL to keep the archive clean
    const filtered = cases.filter(c => c.url !== caseFile.url);
    filtered.unshift(caseFile); // Prepend new case
    fs.writeFileSync(DB_PATH, JSON.stringify(filtered, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to save case to database:', err.message);
    return false;
  }
}

function clearCases() {
  initDb();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
    return true;
  } catch (err) {
    console.error('Failed to clear database cases:', err.message);
    return false;
  }
}

function updateCase(id, updates) {
  initDb();
  try {
    const cases = getCases();
    const idx = cases.findIndex(c => c.id === id);
    if (idx !== -1) {
      cases[idx] = { ...cases[idx], ...updates };
      fs.writeFileSync(DB_PATH, JSON.stringify(cases, null, 2));
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to update case in database:', err.message);
    return false;
  }
}

function getLatestCaseByHostname(hostname) {
  const cases = getCases();
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
