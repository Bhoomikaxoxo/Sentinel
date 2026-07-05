const axios = require('axios');

exports.checkCertTransparency = async (hostname) => {
  try {
    const response = await axios.get(`https://crt.sh/?q=${hostname}&output=json`, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const certs = response.data;
    if (!Array.isArray(certs) || certs.length === 0) {
      return { newCert: false, unavailable: true };
    }

    let newestNotBefore = null;
    for (const cert of certs) {
      if (cert.not_before) {
        const date = new Date(cert.not_before);
        if (!isNaN(date.getTime())) {
          if (!newestNotBefore || date > newestNotBefore) {
            newestNotBefore = date;
          }
        }
      }
    }

    if (newestNotBefore) {
      const ageDays = (Date.now() - newestNotBefore.getTime()) / (1000 * 60 * 60 * 24);
      return {
        newCert: ageDays >= 0 && ageDays <= 7,
        ageDays: Math.max(0, ageDays),
        newestCertDate: newestNotBefore.toISOString()
      };
    }

    return { newCert: false, unavailable: true };
  } catch (err) {
    return { newCert: false, unavailable: true };
  }
};
