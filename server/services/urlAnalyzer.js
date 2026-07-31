const tldts = require('tldts');

exports.analyzeUrl = (urlString) => {
  const factors = [];
  try {
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'https://' + urlString;
    }
    const url = new URL(urlString);
    
    if (url.protocol !== 'https:') factors.push({ id: 'insecure_protocol' });
    
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname);
    if (isIp) factors.push({ id: 'ip_hostname' });
    
    const parsedTarget = tldts.parse(url.hostname);
    const subdomains = parsedTarget.subdomain ? parsedTarget.subdomain.split('.') : [];
    if (subdomains.length >= 3 && !isIp) factors.push({ id: 'excessive_subdomains' });
    
    if (url.hostname.length > 30) factors.push({ id: 'long_hostname' });
    
    const alphanum = url.hostname.replace(/[^a-zA-Z0-9]/g, '');
    let numCount = 0;
    for (let c of alphanum) {
      if (c >= '0' && c <= '9') numCount++;
    }
    if (numCount > 5 && !isIp) factors.push({ id: 'many_numbers_in_domain' });
    
    if (url.hostname.includes('xn--')) factors.push({ id: 'punycode_domain' });

    const SUSPICIOUS_KEYWORDS = ['login', 'secure', 'account', 'verify', 'update', 'banking', 'billing'];
    for (let kw of SUSPICIOUS_KEYWORDS) {
      if (url.hostname.includes(kw) || url.pathname.includes(kw)) {
        factors.push({ id: 'suspicious_keyword', detail: kw });
      }
    }

    const BRAND_KEYWORDS = ['amazon', 'paypal', 'apple', 'google', 'microsoft'];
    for (let kw of BRAND_KEYWORDS) {
      // If the brand is in the hostname but it's not the exact brand domain
      if (url.hostname.includes(kw) && !url.hostname.endsWith(`${kw}.com`)) {
        factors.push({ id: 'fake_brand_keyword', detail: kw });
      }
    }

  } catch (e) {
    factors.push({ id: 'invalid_url' });
  }
  return factors;
};
