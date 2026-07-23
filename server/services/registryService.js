const fs = require('fs');
const path = require('path');
const axios = require('axios');
const tls = require('tls');
const reputationService = require('./reputationService');

const CACHE_DIR = path.join(__dirname, '../db/cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Helper: Perform direct TLS handshake to extract active live SSL certificate
function getLiveSslCertificate(hostname) {
  return new Promise((resolve) => {
    let cleanHost = (hostname || '').toLowerCase().trim();
    if (cleanHost.startsWith('https://')) cleanHost = cleanHost.slice(8);
    if (cleanHost.startsWith('http://')) cleanHost = cleanHost.slice(7);
    cleanHost = cleanHost.split('/')[0].split(':')[0];

    if (!cleanHost) return resolve(null);

    const socket = tls.connect({
      host: cleanHost,
      port: 443,
      servername: cleanHost,
      rejectUnauthorized: false,
      timeout: 4000
    }, () => {
      try {
        const cert = socket.getPeerCertificate(true);
        socket.end();
        if (!cert || !Object.keys(cert).length) return resolve(null);

        let issuerStr = 'Unknown Certificate Authority';
        if (cert.issuer) {
          const org = cert.issuer.O;
          const cn = cert.issuer.CN;
          if (org && cn && org !== cn) issuerStr = `${org} (${cn})`;
          else if (org) issuerStr = org;
          else if (cn) issuerStr = cn;
        }

        resolve({
          issuer: issuerStr,
          issuedAt: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          notBefore: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
          totalCertsFound: 1
        });
      } catch (e) {
        socket.end();
        resolve(null);
      }
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function parseCertIssuer(issuerStr) {
  if (!issuerStr) return 'Unknown Certificate Authority';
  const orgMatch = issuerStr.match(/O=([^,]+)/);
  const cnMatch = issuerStr.match(/CN=([^,]+)/);
  const org = orgMatch ? orgMatch[1].trim() : null;
  const cn = cnMatch ? cnMatch[1].trim() : null;

  if (org && cn && org !== cn) return `${org} (${cn})`;
  if (org) return org;
  if (cn) return cn;
  return issuerStr;
}

async function getCertHistory(hostname) {
  // 1. Perform live TLS handshake directly to target domain on port 443
  const liveCert = await getLiveSslCertificate(hostname);

  // 2. Query crt.sh Certificate Transparency logs in parallel for certificate history
  let ctCert = null;
  try {
    const fetchCerts = async (domain) => {
      const response = await axios.get(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      return response.data;
    };

    let entries = await fetchCerts(hostname).catch(() => []);
    if (!Array.isArray(entries) || entries.length === 0) {
      const apex = reputationService.getApexDomain(hostname);
      if (apex && apex !== hostname) {
        entries = await fetchCerts(apex).catch(() => []);
      }
    }

    if (Array.isArray(entries) && entries.length > 0) {
      const sorted = entries.sort((a, b) => {
        const dateA = new Date(a.entry_timestamp || a.not_before);
        const dateB = new Date(b.entry_timestamp || b.not_before);
        return dateB - dateA;
      });
      const mostRecent = sorted[0];
      ctCert = {
        issuer: parseCertIssuer(mostRecent.issuer_name),
        issuedAt: mostRecent.entry_timestamp || mostRecent.not_before || null,
        notBefore: mostRecent.not_before || null,
        notAfter: mostRecent.not_after || null,
        totalCertsFound: entries.length
      };
    }
  } catch (err) {}

  // Merge results: prefer live active SSL certificate with ctCert count
  if (liveCert) {
    if (ctCert && ctCert.totalCertsFound) {
      liveCert.totalCertsFound = ctCert.totalCertsFound;
    }
    return liveCert;
  }

  // Fallback to CT logs certificate if TLS handshake failed
  return ctCert || null;
}

function getCachedRecord(hostname) {
  const cachePath = path.join(CACHE_DIR, `registry-${hostname}.json`);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const cached = JSON.parse(raw);
    // 24 hours TTL
    if (Date.now() - cached.cachedAt < 24 * 60 * 60 * 1000) {
      return cached.data;
    }
  } catch (e) {}
  return null;
}

function setCachedRecord(hostname, data) {
  const cachePath = path.join(CACHE_DIR, `registry-${hostname}.json`);
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      data,
      cachedAt: Date.now()
    }, null, 2), 'utf8');
  } catch (e) {}
}

exports.buildRegistryRecord = async (hostname) => {
  // Check local 24h file cache first
  const cached = getCachedRecord(hostname);
  if (cached) {
    console.log(`[Registry Service] Cache hit for ${hostname}`);
    return cached;
  }

  console.log(`[Registry Service] Cache miss. Fetching public records for ${hostname}...`);
  const [rdap, dnsA, dnsMX, dnsNS, dnsTXT, ipInfo, certInfo] = await Promise.allSettled([
    reputationService.getRdapRecord(hostname),
    reputationService.getDnsRecords(hostname, 'A'),
    reputationService.getDnsRecords(hostname, 'MX'),
    reputationService.getDnsRecords(hostname, 'NS'),
    reputationService.getDnsRecords(hostname, 'TXT'),
    getIpInfo(hostname),
    getCertHistory(hostname)
  ]);

  const record = {
    registration: rdap.status === 'fulfilled' ? rdap.value : {
      registrar: null, createdDate: null, expiryDate: null,
      statusCodes: [], registrantOrg: null, registrantCountry: null,
      redacted: true
    },
    dns: {
      a: dnsA.status === 'fulfilled' ? dnsA.value : [],
      mx: dnsMX.status === 'fulfilled' ? dnsMX.value : [],
      ns: dnsNS.status === 'fulfilled' ? dnsNS.value : [],
      txt: dnsTXT.status === 'fulfilled' ? dnsTXT.value : []
    },
    ip: ipInfo.status === 'fulfilled' ? ipInfo.value : null,
    certificate: certInfo.status === 'fulfilled' ? certInfo.value : null,
    fetchedAt: new Date().toISOString()
  };

  // Persist to cache
  setCachedRecord(hostname, record);

  return record;
};
