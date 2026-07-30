const axios = require('axios');

exports.analyzeHeaders = async (urlString) => {
  const factors = [];
  const redirectChain = [];
  let finalUrl = urlString;

  try {
    const response = await axios.get(urlString, {
      maxRedirects: 5,
      validateStatus: () => true, // resolve all status codes
      timeout: 5000,
    });

    finalUrl = response.request.res.responseUrl || response.config.url;

    // Axios doesn't give us the full chain of URLs easily, so we just check if it was redirected
    const domainUtils = require('./domainUtils');

    if (finalUrl !== urlString) {
      redirectChain.push(urlString);
      redirectChain.push(finalUrl);
      
      let origHost = '', finalHost = '';
      try { origHost = new URL(urlString).hostname; } catch(e) {}
      try { finalHost = new URL(finalUrl).hostname; } catch(e) {}
      
      const origApex = domainUtils.isEstablishedDomain ? (reputationService = require('./reputationService'), reputationService.getApexDomain(origHost)) : origHost;
      const finalApex = domainUtils.isEstablishedDomain ? (reputationService = require('./reputationService'), reputationService.getApexDomain(finalHost)) : finalHost;

      // Only flag as suspicious redirect if jumping across different domain apexes
      if (origApex && finalApex && origApex.toLowerCase() !== finalApex.toLowerCase()) {
        factors.push({ id: 'redirect_occurred', detail: finalUrl });
      }
    }

    const headers = response.headers || {};
    
    // Check security headers
    if (!headers['strict-transport-security']) factors.push({ id: 'missing_hsts' });
    if (!headers['content-security-policy']) factors.push({ id: 'missing_csp' });
    if (!headers['x-frame-options']) factors.push({ id: 'missing_x_frame_options' });
    if (!headers['x-content-type-options']) factors.push({ id: 'missing_x_content_type_options' });

    const securityHeadersAudit = {
      hsts: {
        name: 'HSTS',
        fullName: 'Strict-Transport-Security',
        present: !!headers['strict-transport-security'],
        value: headers['strict-transport-security'] || null,
        desc: 'Enforces HTTPS encryption'
      },
      csp: {
        name: 'CSP',
        fullName: 'Content-Security-Policy',
        present: !!headers['content-security-policy'],
        value: headers['content-security-policy'] || null,
        desc: 'Prevents XSS & data injection'
      },
      xFrameOptions: {
        name: 'X-Frame-Options',
        fullName: 'X-Frame-Options',
        present: !!headers['x-frame-options'],
        value: headers['x-frame-options'] || null,
        desc: 'Clickjacking protection'
      },
      xContentTypeOptions: {
        name: 'X-Content-Type',
        fullName: 'X-Content-Type-Options',
        present: !!headers['x-content-type-options'],
        value: headers['x-content-type-options'] || null,
        desc: 'MIME-sniffing prevention'
      }
    };

    return { factors, redirectChain, finalUrl, securityHeadersAudit };
  } catch (error) {
    factors.push({ id: 'connection_failed', detail: error.message });
    return { factors, redirectChain, finalUrl, securityHeadersAudit: null };
  }
};
