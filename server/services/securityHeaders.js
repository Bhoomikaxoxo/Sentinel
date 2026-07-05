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
    if (finalUrl !== urlString) {
      redirectChain.push(urlString);
      redirectChain.push(finalUrl);
      factors.push({ id: 'redirect_occurred', detail: finalUrl });
    }

    const headers = response.headers || {};
    
    // Check security headers
    if (!headers['strict-transport-security']) factors.push({ id: 'missing_hsts' });
    if (!headers['content-security-policy']) factors.push({ id: 'missing_csp' });
    if (!headers['x-frame-options']) factors.push({ id: 'missing_x_frame_options' });
    if (!headers['x-content-type-options']) factors.push({ id: 'missing_x_content_type_options' });

    return { factors, redirectChain, finalUrl };
  } catch (error) {
    factors.push({ id: 'connection_failed', detail: error.message });
    return { factors, redirectChain, finalUrl };
  }
};
