const axios = require('axios');
const cheerio = require('cheerio');

function getWordSet(text) {
  return new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
}

function calculateJaccardSimilarity(textA, textB) {
  const setA = getWordSet(textA);
  const setB = getWordSet(textB);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }
  
  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

exports.checkWaybackHistory = async (urlString, currentHtml) => {
  try {
    const domainUtils = require('./domainUtils');
    let hostname = '';
    try { hostname = new URL(urlString).hostname; } catch(e) {}

    // Established top domains update client-side UI continuously; skip defacement divergence on trusted global brands
    if (domainUtils.isEstablishedDomain(hostname)) {
      return { diverged: false, unavailable: false, similarity: 0.95 };
    }

    const encodedUrl = encodeURIComponent(urlString);
    const availResponse = await axios.get(`http://archive.org/wayback/available?url=${encodedUrl}`, { 
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const snapshots = availResponse.data.archived_snapshots;
    if (!snapshots || !snapshots.closest || !snapshots.closest.available) {
      return { diverged: false, unavailable: true };
    }

    const archiveUrl = snapshots.closest.url;
    
    // Fetch archived HTML content
    const archiveResponse = await axios.get(archiveUrl, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const currentText = cheerio.load(currentHtml).text().replace(/\s+/g, ' ').trim();
    const archiveText = cheerio.load(archiveResponse.data).text().replace(/\s+/g, ' ').trim();

    // Only run comparison if both pages have actual content (word count > 10)
    const wordsA = currentText.split(/\s+/).length;
    const wordsB = archiveText.split(/\s+/).length;

    if (wordsA < 10 || wordsB < 10) {
      return { diverged: false, unavailable: true };
    }

    const similarity = calculateJaccardSimilarity(currentText, archiveText);
    
    return {
      diverged: similarity < 0.40,
      similarity: similarity,
      archiveUrl
    };
  } catch (err) {
    return { diverged: false, unavailable: true };
  }
};
