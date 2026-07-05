const axios = require('axios');
const cache = require('../db/cache');

// Helper: Query Cloudflare DoH endpoint for a specific record type
exports.getDnsRecords = async (hostname, type = 'A') => {
  try {
    const response = await axios.get(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=${type}`, {
      headers: { 'accept': 'application/dns-json' },
      timeout: 3000
    });
    
    const answer = response.data.Answer || [];
    return answer.map(ans => ans.data);
  } catch (err) {
    return [];
  }
};

// Helper: Query RDAP registries and parse created/expires dates, registrar, and GDPR status
exports.getRdapRecord = async (hostname) => {
  const cacheKey = `rdap_${hostname}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const rdapResponse = await axios.get(`https://rdap.org/domain/${hostname}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });

    const data = rdapResponse.data;
    const events = data.events || [];
    
    const registrationEvent = events.find(e => e.eventAction === 'registration');
    const expirationEvent = events.find(e => e.eventAction === 'expiration');
    
    const createdDate = registrationEvent ? registrationEvent.eventDate : null;
    const expiryDate = expirationEvent ? expirationEvent.eventDate : null;

    // Parse registrar entity details
    let registrar = null;
    const entities = data.entities || [];
    const registrarEntity = entities.find(ent => ent.roles && ent.roles.includes('registrar'));
    if (registrarEntity && registrarEntity.vcardArray && registrarEntity.vcardArray[1]) {
      const fnField = registrarEntity.vcardArray[1].find(field => field[0] === 'fn');
      if (fnField) registrar = fnField[3];
    }

    // Parse registrant details and assess GDPR redaction
    let registrantOrg = null;
    let registrantCountry = null;
    let redacted = false;

    const registrantEntity = entities.find(ent => ent.roles && ent.roles.includes('registrant'));
    if (registrantEntity) {
      if (registrantEntity.vcardArray && registrantEntity.vcardArray[1]) {
        const fnField = registrantEntity.vcardArray[1].find(field => field[0] === 'fn');
        const orgField = registrantEntity.vcardArray[1].find(field => field[0] === 'org');
        const adrField = registrantEntity.vcardArray[1].find(field => field[0] === 'adr');
        
        if (orgField) registrantOrg = orgField[3];
        else if (fnField) registrantOrg = fnField[3];
        
        if (adrField && adrField[3]) {
          registrantCountry = adrField[3][6] || null;
        }
      }
    } else {
      redacted = true;
    }

    const statusCodes = data.status || [];

    const record = {
      registrar,
      createdDate,
      expiryDate,
      statusCodes,
      registrantOrg: redacted ? '[REDACTED BY REGISTRAR]' : registrantOrg,
      registrantCountry: redacted ? '[REDACTED BY REGISTRAR]' : registrantCountry,
      redacted
    };

    cache.set(cacheKey, record);
    return record;
  } catch (err) {
    return {
      registrar: null,
      createdDate: null,
      expiryDate: null,
      statusCodes: [],
      registrantOrg: null,
      registrantCountry: null,
      redacted: true
    };
  }
};

exports.checkReputation = async (urlString) => {
  const cacheKey = `rep_${urlString}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const factors = [];
  let domainAgeDays = null;
  let registrarName = null;

  try {
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'https://' + urlString;
    }
    const url = new URL(urlString);
    const hostname = url.hostname;

    // Reuse modular helper functions
    const rdapRecord = await exports.getRdapRecord(hostname);
    if (rdapRecord.createdDate) {
      const regDate = new Date(rdapRecord.createdDate);
      if (!isNaN(regDate.getTime())) {
        domainAgeDays = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24);
        if (domainAgeDays < 30) {
          factors.push({ id: 'newly_registered_domain' });
        }
      }
    } else {
      factors.push({ id: 'rdap_unavailable' });
    }
    
    registrarName = rdapRecord.registrar;

    const dnsRecords = await exports.getDnsRecords(hostname, 'A');
    if (dnsRecords.length === 0) {
      factors.push({ id: 'dns_resolution_failure' });
    }

    const result = { factors, domainAgeDays, registrarName };
    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    return { factors, domainAgeDays, registrarName };
  }
};
