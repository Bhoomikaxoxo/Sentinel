const cheerio = require('cheerio');
const stringSimilarity = require('string-similarity');
const tldts = require('tldts');

// Common CDN/library hostnames
const KNOWN_CDN_DOMAINS = [
  'googleapis.com',
  'gstatic.com',
  'cloudflare.com',
  'jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'jquery.com',
  'bootstrapcdn.com'
];

// Major brand keywords
const BRAND_KEYWORDS = [
  'amazon',
  'paypal',
  'apple',
  'google',
  'microsoft',
  'chase',
  'bank of america',
  'steam',
  'netflix'
];

exports.KNOWN_CDN_DOMAINS = KNOWN_CDN_DOMAINS;
exports.BRAND_KEYWORDS = BRAND_KEYWORDS;

exports.analyzeDom = (html, targetUrl) => {
  const brandFlags = [];
  const dependencies = {
    scripts: [],
    stylesheets: [],
    iframes: []
  };
  const factors = [];

  try {
    const $ = cheerio.load(html);
    const targetParsed = new URL(targetUrl);
    const targetHostname = targetParsed.hostname;
    const targetDomain = tldts.getDomain(targetUrl) || targetHostname;

    // A. Parse <title> and visible text (h1, h2, form labels, button text)
    const textSegments = [
      $('title').text(),
      $('h1').map((i, el) => $(el).text()).get().join(' '),
      $('h2').map((i, el) => $(el).text()).get().join(' '),
      $('label').map((i, el) => $(el).text()).get().join(' '),
      $('button').map((i, el) => $(el).text()).get().join(' ')
    ];
    const scannedText = textSegments.join(' ').toLowerCase();

    // Check for each brand keyword match
    for (const brand of BRAND_KEYWORDS) {
      if (scannedText.includes(brand)) {
        const cleanBrand = brand.toLowerCase().replace(/\s/g, '');
        const cleanHostname = targetHostname.toLowerCase().replace(/\s/g, '');
        
        // Exact domain or substring check
        const isLegitExact = cleanHostname.includes(cleanBrand);
        
        if (!isLegitExact) {
          // Fuzzy comparison
          const parsedTarget = tldts.parse(targetHostname);
          const domainLabel = parsedTarget.domainWithoutSuffix || targetHostname;
          const similarity = stringSimilarity.compareTwoStrings(cleanBrand, domainLabel);
          
          // If similarity is low, or it's a typosquat match but not legit
          if (similarity < 0.7) {
            brandFlags.push({
              type: 'brand_mismatch_dom',
              brand: brand,
              hostname: targetHostname
            });
            factors.push({ id: 'brand_mismatch_dom', detail: brand });
          }
        }
      }
    }

    // B. Check for invisible forms or inputs (existing heuristic logic)
    let hasInvisibleForm = false;
    $('form, input').each((i, el) => {
      const style = $(el).attr('style') || '';
      const classAttr = $(el).attr('class') || '';
      if (style.includes('display: none') || style.includes('opacity: 0') || classAttr.includes('hidden')) {
        if ($(el).is('form') || $(el).attr('type') === 'password') {
          hasInvisibleForm = true;
        }
      }
    });
    if (hasInvisibleForm) {
      factors.push({ id: 'invisible_credential_fields' });
    }

    // C. Check for urgency language (existing heuristic logic)
    const pageText = $('body').text().toLowerCase();
    const urgencyKeywords = ['urgent', 'account suspended', 'verify your account', 'immediate action required', 'unauthorized access'];
    for (const kw of urgencyKeywords) {
      if (pageText.includes(kw)) {
        factors.push({ id: 'urgency_language' });
        break;
      }
    }

    // D. Helper to resolve resource URL and classify dependency
    const resolveAndClassify = (srcAttr) => {
      if (!srcAttr) return null;
      try {
        const resolvedUrl = new URL(srcAttr, targetUrl).href;
        const resParsed = new URL(resolvedUrl);
        const resHostname = resParsed.hostname;
        const resDomain = tldts.getDomain(resolvedUrl) || resHostname;
        
        let category = 'external';
        if (resDomain === targetDomain) {
          category = 'internal';
        } else {
          const isCommon = KNOWN_CDN_DOMAINS.some(cdn => resHostname === cdn || resHostname.endsWith('.' + cdn));
          if (isCommon) {
            category = 'common';
          }
        }

        const mixedContent = targetUrl.startsWith('https://') && resolvedUrl.startsWith('http://');

        return {
          url: resolvedUrl,
          domain: resDomain,
          category,
          mixedContent
        };
      } catch (e) {
        return null;
      }
    };

    // E. Parse Script tags
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        const dep = resolveAndClassify(src);
        if (dep) dependencies.scripts.push(dep);
      }
    });

    // F. Parse Stylesheet links
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const dep = resolveAndClassify(href);
        if (dep) dependencies.stylesheets.push(dep);
      }
    });

    // G. Parse Iframes
    $('iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        const dep = resolveAndClassify(src);
        if (dep) dependencies.iframes.push(dep);
      }
    });

  } catch (err) {
    console.error('[domAnalyzer] DOM Parsing failed:', err);
  }

  return {
    dependencies,
    brandFlags,
    factors
  };
};
