const cheerio = require('cheerio');

exports.analyzeDom = (html, urlString) => {
  const factors = [];
  try {
    const $ = cheerio.load(html);
    const url = new URL(urlString);
    
    // 1. Check for invisible forms or inputs (common in credential harvesting)
    let hasInvisibleForm = false;
    $('form, input').each((i, el) => {
      const style = $(el).attr('style') || '';
      const classAttr = $(el).attr('class') || '';
      // Simple heuristic for visibility
      if (style.includes('display: none') || style.includes('opacity: 0') || classAttr.includes('hidden')) {
        if ($(el).is('form') || $(el).attr('type') === 'password') {
          hasInvisibleForm = true;
        }
      }
    });
    if (hasInvisibleForm) factors.push({ id: 'invisible_credential_fields' });

    // 2. Check for urgency language often used in social engineering
    const pageText = $('body').text().toLowerCase();
    const urgencyKeywords = ['urgent', 'account suspended', 'verify your account', 'immediate action required', 'unauthorized access'];
    for (let kw of urgencyKeywords) {
      if (pageText.includes(kw)) {
        factors.push({ id: 'urgency_language' });
        break; // Only push once
      }
    }

    // 3. Brand mismatch in title/content vs domain
    const title = $('title').text().toLowerCase();
    const BRAND_KEYWORDS = ['amazon', 'paypal', 'apple', 'google', 'microsoft', 'chase', 'bank of america'];
    for (let brand of BRAND_KEYWORDS) {
      // If the page claims to be the brand but the domain is not the brand
      if (title.includes(brand) && !url.hostname.includes(brand.replace(/\s/g, ''))) {
        factors.push({ id: 'brand_mismatch_dom', detail: brand });
      }
    }

    return factors;
  } catch (e) {
    factors.push({ id: 'dom_analysis_failed' });
    return factors;
  }
};
