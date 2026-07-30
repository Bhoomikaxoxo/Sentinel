const cache = require('../db/cache');
const axios = require('axios');

// Helper: Extract apex domain (e.g. sub.example.co.uk -> example.co.uk)
function getApexDomain(hostname) {
  if (!hostname) return '';
  let host = hostname.toLowerCase().trim();
  if (host.startsWith('www.')) host = host.slice(4);
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  
  const twoPartTlds = ['co.uk', 'org.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'ne.jp', 'com.br', 'co.in', 'net.in', 'org.in'];
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}
exports.getApexDomain = getApexDomain;

// Helper: Query Cloudflare DoH endpoint for a specific record type
exports.getDnsRecords = async (hostname, type = 'A') => {
  try {
    const fetchRecords = async (name) => {
      const response = await axios.get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
        headers: { 'accept': 'application/dns-json' },
        timeout: 4000
      });
      const answer = response.data.Answer || [];
      return answer.map(ans => {
        let data = (ans.data || '').trim();
        // Clean trailing dots on FQDN DNS entries (e.g. ns1.example.com. -> ns1.example.com)
        if (type !== 'TXT' && data.endsWith('.')) {
          data = data.slice(0, -1);
        }
        return data;
      }).filter(Boolean);
    };

    let records = await fetchRecords(hostname);
    if (records.length === 0 && hostname.includes('.')) {
      const apex = getApexDomain(hostname);
      if (apex && apex !== hostname) {
        records = await fetchRecords(apex);
      }
    }
    return records;
  } catch (err) {
    return [];
  }
};

// Helper: Query RDAP registries and parse created/expires dates, registrar, and GDPR status
exports.getRdapRecord = async (hostname) => {
  const targetHost = getApexDomain(hostname) || hostname;
  const cacheKey = `rdap_${targetHost}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const fetchRdapForDomain = async (domain) => {
    const rdapResponse = await axios.get(`https://rdap.org/domain/${domain}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: process.env.VERCEL ? 3000 : 6000
    });

    const data = rdapResponse.data;
    const events = data.events || [];
    
    const registrationEvent = events.find(e => e.eventAction === 'registration' || e.eventAction === 'submission');
    const expirationEvent = events.find(e => e.eventAction === 'expiration');
    
    const createdDate = registrationEvent ? registrationEvent.eventDate : null;
    const expiryDate = expirationEvent ? expirationEvent.eventDate : null;

    // Parse registrar entity details
    let registrar = null;
    const entities = data.entities || [];
    const registrarEntity = entities.find(ent => ent.roles && ent.roles.includes('registrar'));
    if (registrarEntity) {
      if (registrarEntity.vcardArray && registrarEntity.vcardArray[1]) {
        const fnField = registrarEntity.vcardArray[1].find(field => field[0] === 'fn');
        const orgField = registrarEntity.vcardArray[1].find(field => field[0] === 'org');
        if (fnField && fnField[3]) registrar = fnField[3];
        else if (orgField && orgField[3]) registrar = orgField[3];
      }
      if (!registrar && registrarEntity.handle) {
        registrar = registrarEntity.handle;
      }
    }

    // Parse registrant details and assess GDPR redaction
    let registrantOrg = null;
    let registrantCountry = null;
    let redacted = false;

    const registrantEntity = entities.find(ent => ent.roles && ent.roles.includes('registrant'));
    if (registrantEntity && registrantEntity.vcardArray && registrantEntity.vcardArray[1]) {
      const fnField = registrantEntity.vcardArray[1].find(field => field[0] === 'fn');
      const orgField = registrantEntity.vcardArray[1].find(field => field[0] === 'org');
      const adrField = registrantEntity.vcardArray[1].find(field => field[0] === 'adr');
      
      if (orgField && orgField[3]) registrantOrg = orgField[3];
      else if (fnField && fnField[3]) registrantOrg = fnField[3];
      
      if (adrField && adrField[3]) {
        registrantCountry = adrField[3][6] || adrField[3][5] || null;
      }
    } else {
      redacted = true;
    }

    if (!registrantOrg || registrantOrg.toLowerCase().includes('redact') || registrantOrg.toLowerCase().includes('privacy')) {
      registrantOrg = '[REDACTED BY REGISTRAR]';
    }
    if (!registrantCountry || registrantCountry.toLowerCase().includes('redact') || registrantCountry.toLowerCase().includes('privacy')) {
      registrantCountry = '[REDACTED BY REGISTRAR]';
    }

    const statusCodes = data.status || [];

    return {
      registrar: registrar || 'Known Domain Registrar',
      createdDate,
      expiryDate,
      statusCodes,
      registrantOrg,
      registrantCountry,
      redacted
    };
  };

  try {
    let record = await fetchRdapForDomain(targetHost);
    if (!record.createdDate && hostname !== targetHost) {
      try {
        const fallbackRecord = await fetchRdapForDomain(hostname);
        if (fallbackRecord.createdDate) record = fallbackRecord;
      } catch(e) {}
    }
    cache.set(cacheKey, record);
    return record;
  } catch (err) {
    const fallback = {
      registrar: null,
      createdDate: null,
      expiryDate: null,
      statusCodes: [],
      registrantOrg: '[REDACTED BY REGISTRAR]',
      registrantCountry: '[REDACTED BY REGISTRAR]',
      redacted: true
    };
    return fallback;
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

    const apex = getApexDomain(hostname) || hostname;
    const [dnsRecords, txtRecords, dmarcRecords] = await Promise.all([
      exports.getDnsRecords(hostname, 'A'),
      exports.getDnsRecords(apex, 'TXT'),
      exports.getDnsRecords(`_dmarc.${apex}`, 'TXT')
    ]);

    if (dnsRecords.length === 0) {
      factors.push({ id: 'dns_resolution_failure' });
    }

    const hasSpf = txtRecords.some(r => r.toLowerCase().includes('v=spf1'));
    const hasDmarc = dmarcRecords.some(r => r.toLowerCase().includes('v=dmarc1')) || 
                     txtRecords.some(r => r.toLowerCase().includes('v=dmarc1'));

    if (!hasSpf) {
      factors.push({ id: 'missing_spf' });
    }
    if (!hasDmarc) {
      factors.push({ id: 'missing_dmarc' });
    }

    const emailSecurity = {
      apexDomain: apex,
      hasSpf,
      hasDmarc,
      spfRecord: txtRecords.find(r => r.toLowerCase().includes('v=spf1')) || null,
      dmarcRecord: dmarcRecords.find(r => r.toLowerCase().includes('v=dmarc1')) || null
    };

    const result = { factors, domainAgeDays, registrarName, emailSecurity };
    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    return { factors, domainAgeDays, registrarName, emailSecurity: { hasSpf: false, hasDmarc: false } };
  }
};
