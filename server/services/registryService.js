const fs = require('fs');
const path = require('path');
const axios = require('axios');
const reputationService = require('./reputationService');

const CACHE_DIR = path.join(__dirname, '../db/cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Singleton throttle controller to enforce the ~45 req/min rate limit (1.5s delay)
let lastIpLookupTime = 0;
async function throttleIpLookup() {
  const now = Date.now();
  const elapsed = now - lastIpLookupTime;
  const delay = 1500 - elapsed;
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastIpLookupTime = Date.now();
}

async function getIpInfo(hostname) {
  try {
    // Resolve hostname to IP first using Cloudflare DNS A record helper
    const ips = await reputationService.getDnsRecords(hostname, 'A');
    if (!ips || ips.length === 0) return null;
    const ip = ips[0];

    // Enforce API throttling
    await throttleIpLookup();

    // Query IP-API.com free tier via HTTP (HTTP only for free tier)
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,as`, {
      timeout: 5000
    });
    
    const data = response.data;
    if (data.status !== 'success') return null;

    return {
      ip,
      country: data.country || 'Unknown',
      region: data.regionName || 'Unknown',
      city: data.city || 'Unknown',
      isp: data.isp || 'Unknown',
      org: data.org || 'Unknown',
      asn: data.as || 'Unknown'
    };
  } catch (err) {
    console.error(`IP lookup error for ${hostname}:`, err.message);
    return null;
  }
}

async function getCertHistory(hostname) {
  try {
    const response = await axios.get(`https://crt.sh/?q=${encodeURIComponent(hostname)}&output=json`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const entries = response.data;
    if (!Array.isArray(entries) || entries.length === 0) return null;

    // Sort to retrieve the most recent certificate entry
    const sorted = entries.sort((a, b) => {
      const dateA = new Date(a.entry_timestamp || a.not_before);
      const dateB = new Date(b.entry_timestamp || b.not_before);
      return dateB - dateA;
    });

    const mostRecent = sorted[0];
    return {
      issuer: mostRecent.issuer_name || 'Unknown',
      issuedAt: mostRecent.entry_timestamp || mostRecent.not_before || null,
      notBefore: mostRecent.not_before || null,
      notAfter: mostRecent.not_after || null,
      totalCertsFound: entries.length
    };
  } catch (err) {
    console.error(`Cert history error for ${hostname}:`, err.message);
    return null;
  }
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
