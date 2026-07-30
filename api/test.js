// Minimal diagnostic endpoint - no imports from server/
module.exports = (req, res) => {
  const results = {};
  const modules = ['express', 'cors', 'axios', 'cheerio', 'pngjs', 'pixelmatch', 'string-similarity', 'tldts'];
  for (const mod of modules) {
    try {
      require(mod);
      results[mod] = 'OK';
    } catch (e) {
      results[mod] = 'FAIL: ' + e.message;
    }
  }
  res.json({ env: process.env.VERCEL ? 'vercel' : 'local', modules: results });
};
