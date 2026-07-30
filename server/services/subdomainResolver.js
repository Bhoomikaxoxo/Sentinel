const axios = require('axios');

// ── Brute-force wordlist (common subdomain prefixes) ──────────────────────────
// Kept as a supplementary list; crt.sh is the primary discovery source.
const WORDLIST = [
  'www', 'api', 'dev', 'mail', 'admin', 'portal', 'shop', 'app', 'cdn',
  'static', 'assets', 'img', 'images', 'media', 'blog', 'docs', 'help',
  'support', 'status', 'auth', 'login', 'secure', 'vpn', 'remote',
  'ftp', 'ssh', 'smtp', 'pop', 'imap', 'mx', 'ns', 'ns1', 'ns2',
  'dns', 'webmail', 'cpanel', 'whm', 'panel', 'dashboard', 'monitor',
  'staging', 'stage', 'test', 'qa', 'beta', 'preview', 'preprod',
  'internal', 'intranet', 'corp', 'office', 'erp', 'crm', 'jira',
  'confluence', 'git', 'gitlab', 'github', 'jenkins', 'ci', 'build',
  'chat', 'slack', 'meet', 'video', 'call', 'sip', 'voip',
  'db', 'database', 'mysql', 'postgres', 'redis', 'elastic', 'search',
  'files', 'cloud', 'backup', 'archive', 'download', 'upload',
  'api2', 'api3', 'v1', 'v2', 'v3', 'mobile', 'wap', 'm',
  'pay', 'payments', 'billing', 'store', 'ecommerce', 'cart',
  'news', 'events', 'calendar', 'forms', 'survey', 'feedback',
  'library', 'lms', 'moodle', 'campus', 'student', 'staff', 'faculty',
  'alumni', 'admission', 'placement', 'results', 'exam', 'hostel',
  'register', 'registry', 'id', 'sso', 'saml', 'oauth',
  'reports', 'analytics', 'metrics', 'grafana', 'kibana', 'logs',
  'wiki', 'kb', 'helpdesk', 'ticket', 'forum', 'community',
  'iot', 'api-gateway', 'gateway', 'proxy', 'edge', 'lb', 'balancer',
  'bims', 'wims', 'dsc', 'ncrtit', 'hostel', 'innovation', 'projects',
  'legacy', 'old', 'archive', 'mirror', 'bak'
];

// ── In-memory cache (per-process run) ────────────────────────────────────────
const cache = new Map();

/**
 * Query crt.sh certificate transparency logs for all known subdomains.
 * Returns a Set of unique FQDN strings (already includes the base domain).
 */
async function fetchCrtshSubdomains(rootDomain) {
  try {
    const response = await axios.get(
      `https://crt.sh/?q=%.${encodeURIComponent(rootDomain)}&output=json`,
      {
        timeout: process.env.VERCEL ? 2500 : 12000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SentinelAI/1.0)'
        }
      }
    );

    const certs = response.data;
    if (!Array.isArray(certs)) return new Set();

    const names = new Set();
    for (const cert of certs) {
      // name_value can be a newline-separated list of SANs
      const raw = cert.name_value || '';
      raw.split('\n').forEach(name => {
        const clean = name.trim().toLowerCase().replace(/^\*\./, '');
        // Only include real subdomains of this root domain, not the root itself
        if (
          clean.endsWith(`.${rootDomain}`) &&
          clean !== rootDomain &&
          !clean.startsWith('*')
        ) {
          names.add(clean);
        }
      });
    }

    return names; // Set of FQDNs like "student.bmsit.ac.in"
  } catch (err) {
    console.error('[subdomainResolver] crt.sh query failed:', err.message);
    return new Set();
  }
}

/**
 * DNS-resolve one FQDN via Cloudflare DoH. Returns { subdomain, fqdn, resolved, ip }.
 * `subdomain` is the prefix label (e.g. "student"), `fqdn` is the full name.
 */
async function resolveOne(fqdn, rootDomain) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);
  const sub = fqdn.endsWith(`.${rootDomain}`)
    ? fqdn.slice(0, -(rootDomain.length + 1))
    : fqdn;

  try {
    const response = await axios.get(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=A`,
      {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    const data = response.data;
    if (data && Array.isArray(data.Answer) && data.Answer.length > 0) {
      const aRecord = data.Answer.find(ans => ans.type === 1);
      if (aRecord && aRecord.data) {
        return { subdomain: sub, fqdn, resolved: true, ip: aRecord.data.trim() };
      }
    }
    return { subdomain: sub, fqdn, resolved: false };
  } catch (_) {
    clearTimeout(timeoutId);
    return { subdomain: sub, fqdn, resolved: false };
  }
}

/**
 * Run an array of FQDNs through resolveOne in parallel chunks.
 */
async function resolveInBatches(fqdnList, rootDomain, batchSize = 25) {
  const results = [];
  for (let i = 0; i < fqdnList.length; i += batchSize) {
    const chunk = fqdnList.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map(fqdn => resolveOne(fqdn, rootDomain)));
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        results.push(res.value);
      } else {
        const fqdn = chunk[idx];
        const sub = fqdn.endsWith(`.${rootDomain}`) ? fqdn.slice(0, -(rootDomain.length + 1)) : fqdn;
        results.push({ subdomain: sub, fqdn, resolved: false });
      }
    });
  }
  return results;
}

async function resolveSubdomains(rootDomain) {
  const cleanDomain = (rootDomain || '').toLowerCase().trim();
  if (!cleanDomain) return [];

  if (cache.has(cleanDomain)) return cache.get(cleanDomain);

  // 1. Passive: crt.sh certificate transparency logs
  const crtshFqdns = await fetchCrtshSubdomains(cleanDomain);

  // 2. Active: build FQDN list (use top 25 if crt.sh has no logs, otherwise check top candidates)
  const targetWordlist = crtshFqdns.size > 0 ? WORDLIST.slice(0, 30) : WORDLIST.slice(0, 25);
  const wordlistFqdns = new Set(targetWordlist.map(sub => `${sub}.${cleanDomain}`));

  // 3. Merge (crt.sh first; wordlist only adds names not already found)
  const allFqdns = new Set([...crtshFqdns, ...wordlistFqdns]);
  const fqdnList = Array.from(allFqdns);

  console.log(`[subdomainResolver] Probing ${fqdnList.length} candidates for ${cleanDomain} (${crtshFqdns.size} from crt.sh, ${wordlistFqdns.size} from wordlist)`);

  // 4. DNS-resolve in batches of 25 concurrently
  const allResults = await resolveInBatches(fqdnList, cleanDomain, 25);

  // 5. Return resolved ones first, then a handful of notable unresolved ones
  let resolved = allResults.filter(r => r.resolved);

  // Wildcard DNS detection: if we have a lot of subdomains, check if they map to the same IP
  if (resolved.length > 20) {
    const ipCounts = {};
    resolved.forEach(r => {
      if (r.ip) {
        ipCounts[r.ip] = (ipCounts[r.ip] || 0) + 1;
      }
    });
    const maxCount = Math.max(...Object.values(ipCounts), 0);
    if (maxCount > resolved.length * 0.7) {
      console.log(`[subdomainResolver] Wildcard DNS detected for ${cleanDomain}. Capping resolved subdomains to prevent UI lag.`);
      resolved = resolved.slice(0, 20);
    }
  }

  const unresolved = allResults.filter(r => !r.resolved).slice(0, 10);
  const final = resolved.length > 0 ? resolved : [...resolved, ...unresolved];

  cache.set(cleanDomain, final);
  console.log(`[subdomainResolver] Found ${resolved.length} live subdomains for ${cleanDomain}`);
  return final;
}

exports.resolveSubdomains = resolveSubdomains;
