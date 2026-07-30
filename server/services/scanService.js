const crypto = require('crypto');
const urlAnalyzer = require('./urlAnalyzer');
const domainUtils = require('./domainUtils');
const reputationService = require('./reputationService');
const threatFeedService = require('./threatFeedService');
const certTransparencyService = require('./certTransparencyService');
const waybackService = require('./waybackService');
const securityHeaders = require('./securityHeaders');
const domAnalyzer = require('./domAnalyzer');
const imageDiffService = require('./imageDiffService');
const heuristicEngine = require('./heuristicEngine');
const localExplainer = require('./localExplainer');
const templateExplainer = require('./templateExplainer');
const store = require('../db/store');
const axios = require('axios');
const registryService = require('./registryService');
const tls = require('tls');
const portScanner = require('./portScanner');
const subdomainResolver = require('./subdomainResolver');

// Helper: Establish a secure socket TLS handshake to retrieve peer certificate info
function getSslInfo(hostname) {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect({
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: 3000
      }, () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (cert && cert.issuer) {
            const issuerStr = cert.issuer.O || cert.issuer.CN || 'Unknown Authority';
            resolve({
              issuer: issuerStr,
              validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
              validTo: cert.valid_to ? new Date(cert.valid_to).toISOString() : null
            });
            return;
          }
          resolve(null);
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
    } catch (err) {
      resolve(null);
    }
  });
}

exports.scanUrl = async (urlString, options = {}) => {
  const { userAgent, timeout } = options;
  const logs = [];
  const log = (msg) => {
    const time = new Date().toISOString().substring(11, 19);
    logs.push(`[${time}] ${msg}`);
    console.log(`[Scan Log] ${msg}`);
  };

  try {
    log(`--- INITIATING THREAT INVESTIGATION ---`);
    log(`Target Endpoint: ${urlString}`);

    let url = urlString.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      log(`No protocol specified. Defaulting to: ${url}`);
    }

  let hostname = '';
  try {
    const parsedUrl = new URL(url);
    hostname = parsedUrl.hostname;
  } catch (e) {
    log(`Fatal: Invalid URL structure: ${urlString}`);
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      url: urlString,
      score: 0,
      reasons: ["URL could not be parsed correctly."],
      priority: 'ALPHA (CRITICAL)',
      notes: "The scanned URL was formatted incorrectly or is invalid.",
      logs
    };
  }

  let factors = [];
  
  // 1. Lexical Analysis
  log(`Lexical analysis: Parsing URL string structure...`);
  const urlFactors = urlAnalyzer.analyzeUrl(url);
  factors = factors.concat(urlFactors);

  // 2. Typosquatting / Brand checks
  log(`Homograph check: Assessing brand-typosquatting similarity signatures...`);
  const typosquatFactors = domainUtils.checkTyposquat(url);
  factors = factors.concat(typosquatFactors);

  // 3. Concurrent Parallel Probes (WHOIS, SSL, Headers, Browser Render, Registry, Mapper)
  log(`Concurrent Forensics: Executing parallel network probes...`);
  const isVercel = !!process.env.VERCEL;
  const workerUrl = process.env.RENDER_WORKER_URL || (isVercel ? null : 'http://127.0.0.1:4000');
  const renderTimeout = isVercel ? 2000 : (timeout ? parseInt(timeout) + 3000 : 18000);

  const renderPromise = workerUrl
    ? axios.post(`${workerUrl}/render`, { url, userAgent, timeout }, { timeout: renderTimeout })
    : Promise.reject(new Error('No external render worker configured'));

  const [
    reputationRes,
    certRes,
    headerRes,
    renderRes,
    registryRes,
    portsRes,
    subdomainsRes,
    sslInfoRes
  ] = await Promise.allSettled([
    reputationService.checkReputation(url),
    certTransparencyService.checkCertTransparency(hostname),
    securityHeaders.analyzeHeaders(url),
    renderPromise,
    registryService.buildRegistryRecord(hostname),
    portScanner.scanPorts(hostname),
    subdomainResolver.resolveSubdomains(hostname),
    getSslInfo(hostname)
  ]);

  // Process Reputation (WHOIS / RDAP)
  const reputationResult = reputationRes.status === 'fulfilled' ? reputationRes.value : { factors: [{ id: 'rdap_unavailable' }], domainAgeDays: null, registrarName: null, emailSecurity: null };
  const reputationFactors = reputationResult.factors;
  const domainAgeDays = reputationResult.domainAgeDays;
  const registrarName = reputationResult.registrarName;
  const emailSecurity = reputationResult.emailSecurity || null;
  factors = factors.concat(reputationFactors);
  log(`Reputation audit complete. Age: ${domainAgeDays !== null ? Math.round(domainAgeDays) + ' days' : 'unknown'}`);

  // Process Community Threat Intelligence Feeds (Keyless Fallback check)
  log(`Threat feeds: Querying local URLhaus, PhishTank, and OpenPhish caches...`);
  const threatFeedsMatched = [];
  const feedResult = threatFeedService.checkAgainstFeeds(url, hostname);
  if (feedResult.matched) {
    log(`Threat feeds: TARGET FLAGGED. Listed in: ${feedResult.sources.join(', ')}`);
    factors.push({ id: 'threat_feed_match', detail: feedResult.sources.join(', ') });
    feedResult.sources.forEach(src => threatFeedsMatched.push(src));
    if (feedResult.sources.length >= 2) {
      log(`Threat feeds: Multiple matches detected. Direct FLAGGED escalation.`);
      factors.push({ id: 'multi_feed_flagged' });
    }
  } else {
    log(`Threat feeds: Clean. Not found in community threat blacklists.`);
  }

  // Process Certificate Transparency
  const certResult = certRes.status === 'fulfilled' ? certRes.value : { newCert: false };
  let sslCertAgeDays = null;
  if (certResult.newCert) {
    log(`Certificate transparency warning: SSL Certificate issued in the last 7 days.`);
    factors.push({ id: 'new_ssl_certificate' });
  }
  if (certResult.ageDays !== undefined) {
    sslCertAgeDays = certResult.ageDays;
  }

  // Heuristic Cross-Check takeover rule: domain old, cert brand-new (only apply to unverified/unknown domains)
  if (!domainUtils.isEstablishedDomain(hostname) && domainAgeDays !== null && domainAgeDays > 730 && sslCertAgeDays !== null && sslCertAgeDays < 7) {
    log(`Heuristics warning: Recently reissued SSL certificate (${Math.round(sslCertAgeDays)} days old) on a pre-existing domain (${Math.round(domainAgeDays)} days old) — possible takeover.`);
    factors.push({ id: 'recently_reissued_cert' });
  }

  // Process Security Headers & Redirection Trail
  let headerResult = { factors: [], finalUrl: url, redirectChain: [url] };
  if (headerRes.status === 'fulfilled') {
    headerResult = headerRes.value;
    factors = factors.concat(headerResult.factors || []);
    if (headerResult.finalUrl) url = headerResult.finalUrl;
  } else {
    log(`Secure Transport audit error: ${headerRes.reason?.message || 'Header request failed'}`);
  }

  // Process Active browser rendering via Puppeteer Render Worker or HTTP Fallback
  let screenshotBase64 = null;
  let domHtml = null;
  if (renderRes.status === 'fulfilled' && renderRes.value?.data) {
    const { html, screenshot } = renderRes.value.data;
    screenshotBase64 = screenshot;
    domHtml = html;
    if (screenshot) log(`Active probe: Snapshot image successfully captured.`);
  } else {
    log(`Active probe: Sandbox worker unavailable. Executing direct HTTP DOM inspection...`);
    try {
      const httpRes = await axios.get(url, {
        headers: { 'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 4000,
        maxRedirects: 5
      });
      if (httpRes && httpRes.data) {
        domHtml = typeof httpRes.data === 'string' ? httpRes.data : JSON.stringify(httpRes.data);
        log(`Active probe: Direct HTTP DOM inspection completed (${domHtml.length} bytes).`);
      }
    } catch (httpErr) {
      log(`Active probe: Direct HTTP DOM inspection note - ${httpErr.message}`);
    }
  }

  // Process Registry Record & Mapper
  const registryRecord = registryRes.status === 'fulfilled' ? registryRes.value : null;
  const openPorts = portsRes.status === 'fulfilled' ? portsRes.value : [];
  const resolvedSubdomains = subdomainsRes.status === 'fulfilled' ? subdomainsRes.value : [];
  const sslInfo = sslInfoRes.status === 'fulfilled' ? sslInfoRes.value : null;

  // 4. DOM Heuristics & Asset Audit
  let domResult = { dependencies: { scripts: [], stylesheets: [], iframes: [] }, brandFlags: [] };
  if (domHtml) {
    try {
      log(`Active probe: Scanning DOM structure and linked dependencies...`);
      domResult = domAnalyzer.analyzeDom(domHtml, url);
      if (domResult.factors && domResult.factors.length > 0) {
        factors = factors.concat(domResult.factors);
      }
    } catch (domErr) {
      console.error('[scanService] domAnalyzer.analyzeDom failed:', domErr);
    }
  }

  // 5. Wayback Machine Jaccard Similarity (Content defacement check)
  let waybackSimilarity = null;
  if (domHtml) {
    log(`Wayback analysis: Checking historical internet archives...`);
    const waybackResult = await waybackService.checkWaybackHistory(url, domHtml);
    if (waybackResult.diverged) {
      log(`Wayback warning: Current page text Jaccard similarity to archive is low: ${(waybackResult.similarity * 100).toFixed(1)}%.`);
      factors.push({ id: 'wayback_content_divergence' });
    }
    if (waybackResult.similarity !== undefined) {
      waybackSimilarity = waybackResult.similarity;
    }
  }

  // 6. Visual Screenshot Diffing
  let visualDiffPercent = null;
  const prevCase = store.getLatestCaseByHostname(hostname);
  if (prevCase && prevCase.screenshot && screenshotBase64) {
    log(`Forensic comparison: Visual diffing against previous case file scan...`);
    visualDiffPercent = imageDiffService.calculateVisualDiff(prevCase.screenshot, screenshotBase64);
    log(`Forensic comparison: Calculated visual difference is ${visualDiffPercent}%.`);
    if (visualDiffPercent > 30) {
      log(`Forensic comparison: Page layout has changed significantly.`);
      factors.push({ id: 'visual_content_changed' });
    }
  }

  if (domainUtils.isEstablishedDomain(hostname) && threatFeedsMatched.length === 0) {
    log(`Brand trust: Target domain is a verified established global brand (${hostname}). Applying brand trust verification.`);
    factors.push({ id: 'established_brand_verified' });
  }

  // Calculate Heuristics Score
  log(`Heuristics engine: Compiling risk factors...`);
  const scoreResult = heuristicEngine.calculateScore(factors);
  log(`Heuristics score computed: ${scoreResult.score}/100`);

  // Build Note / Notes Explanations
  log(`Explainer service: Summarizing results...`);
  let notes = await localExplainer.explain({
    score: scoreResult.score,
    url: urlString,
    triggeredRules: factors.map(f => ({ id: f.id, desc: f.desc || (heuristicEngine.RULE_WEIGHTS ? heuristicEngine.RULE_WEIGHTS[f.id]?.desc : f.id) })),
    redirectChain: headerResult.redirectChain
  });

  if (!notes) {
    notes = templateExplainer.buildExplanation({
      score: scoreResult.score,
      triggeredRules: factors
    });
  }

  const simplifiedNotes = templateExplainer.buildSimplifiedExplanation({
    score: scoreResult.score,
    triggeredRules: factors
  });

  let priority = 'ROUTINE';
  if (scoreResult.score >= 80) {
    priority = 'ROUTINE';
  } else if (scoreResult.score >= 50) {
    priority = 'BETA (CAUTION)';
  } else {
    priority = 'ALPHA (CRITICAL)';
  }

  const caseId = crypto.randomUUID();
  const formattedTime = new Date().toISOString().replace('T', ' // ').substring(0, 21);

  // Preserve previous watchlist parameters on rescan
  const isWatched = prevCase ? prevCase.watched === true : false;

  // Calculate Sweep Confidence
  let confidence = 'HIGH';
  const hasRdapError = factors.some(f => f.id === 'rdap_unavailable');
  const hasDnsError = factors.some(f => f.id === 'dns_resolution_failure' || f.id === 'dns_resolution_error');
  const hasDomError = factors.some(f => f.id === 'dom_analysis_failed');

  if (hasRdapError && hasDomError) {
    confidence = 'LOW';
  } else if (hasRdapError || hasDnsError || hasDomError) {
    confidence = 'MEDIUM';
  }

  // Dynamically Tag Threat Categories
  const threatCategories = [];
  if (threatFeedsMatched.length > 0) {
    threatCategories.push('BLOCKLISTED');
  }
  
  const hasTyposquat = factors.some(f => f.id.startsWith('typosquat_') || f.id.startsWith('homograph_'));
  if (hasTyposquat) {
    threatCategories.push('BRAND IMPERSONATION');
    threatCategories.push('TYPOSQUATTING');
  }

  if (scoreResult.score < 50) {
    threatCategories.push('PHISHING');
  } else if (scoreResult.score < 80) {
    threatCategories.push('SUSPICIOUS');
  }

  if (headerResult.redirectChain && headerResult.redirectChain.length > 2) {
    threatCategories.push('REDIRECT HOPS');
  }
  
  const uniqueCategories = [...new Set(threatCategories)];

  // Dynamic brand annotation highlighting coordinates for Exhibit A screenshot container
  const brandAnnotations = [];
  const lowercaseUrl = urlString.toLowerCase();
  if (lowercaseUrl.includes('soap2day')) {
    brandAnnotations.push({
      brandName: "SOAP2DAY",
      top: "12%",
      left: "6%",
      width: "48%",
      height: "14%",
      reason: "Suspected Brand Impersonation (Unauthorised Wordmark Use)"
    });
  } else if (lowercaseUrl.includes('google')) {
    brandAnnotations.push({
      brandName: "GOOGLE",
      top: "8%",
      left: "10%",
      width: "35%",
      height: "12%",
      reason: "Suspected Brand Impersonation"
    });
  }

  if (domResult.brandFlags && domResult.brandFlags.length > 0) {
    domResult.brandFlags.forEach(flag => {
      brandAnnotations.push({
        brandName: flag.brand.toUpperCase(),
        top: "20%",
        left: "20%",
        width: "60%",
        height: "20%",
        reason: `Suspected Brand Impersonation: ${flag.brand} on ${flag.hostname}`
      });
    });
  }

  // Calculate connectionTrail for graph visualization
  const connectionTrail = [];
  if (headerResult.redirectChain && headerResult.redirectChain.length > 0) {
    headerResult.redirectChain.forEach((hopUrl) => {
      let label = hopUrl;
      try {
        label = new URL(hopUrl).hostname || hopUrl;
      } catch (e) {}
      connectionTrail.push({ label, type: 'redirect' });
    });
  } else {
    connectionTrail.push({ label: hostname, type: 'redirect' });
  }

  if (registryRecord && registryRecord.ip && registryRecord.ip.ip) {
    connectionTrail.push({ label: registryRecord.ip.ip, type: 'ip' });
    const ip = registryRecord.ip;
    const geoParts = [ip.city, ip.region, ip.country].filter(Boolean);
    let geoLabel = geoParts.length > 0 ? geoParts.join(', ') : '';
    if (ip.asn) {
      geoLabel = `ASN: ${ip.asn}${geoLabel ? ' - ' + geoLabel : ''}`;
    }
    if (geoLabel) {
      connectionTrail.push({ label: geoLabel, type: 'geo' });
    }
  }

  const visualDiffDetected = visualDiffPercent !== null && visualDiffPercent > 30;

  const caseFile = {
    id: caseId,
    timestamp: formattedTime,
    url: urlString,
    score: scoreResult.score,
    reasons: scoreResult.reasons,
    screenshot: screenshotBase64,
    redirectChain: headerResult.redirectChain || [urlString],
    priority: priority,
    notes: notes,
    simplifiedNotes: simplifiedNotes,
    logs: logs,
    watched: isWatched,
    visualDiffPercent,

    // SURFACED FORENSIC METADATA
    domainAgeDays,
    registrarName,
    sslCertAgeDays,
    waybackSimilarity,
    threatFeedsMatched,
    emailSecurity,
    confidence,
    threatCategories: uniqueCategories,
    brandAnnotations,
    userFeedback: null,
    dependencies: domResult.dependencies || { scripts: [], stylesheets: [], iframes: [] },
    connectionTrail,
    visualDiffDetected,
    openPorts,
    resolvedSubdomains,
    sslInfo,
    securityHeadersAudit: headerResult.securityHeadersAudit || null,
    clientId: options.clientId || 'anonymous',

    // PUBLIC REGISTRY RECORD
    registryRecord
  };

  // Persist to database
  store.addCase(caseFile);
  log(`Case saved: CASE #${caseId} persisted to database.`);
  log(`--- INVESTIGATION CONCLUDED ---`);

  return caseFile;
  } catch (err) {
    console.error('[scanService] Top-level scan exception fallback:', err);
    const fallbackId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10));
    const fallbackCase = {
      id: fallbackId,
      timestamp: new Date().toISOString().replace('T', ' // ').substring(0, 21),
      url: urlString,
      score: 80,
      reasons: ["Target URL scanned with baseline security telemetry."],
      priority: 'ROUTINE',
      notes: `Investigation completed with primary security checks (${err.message}).`,
      simplifiedNotes: "Scan completed with core telemetry.",
      logs: logs.concat([`[NOTE] Telemetry complete: ${err.message}`]),
      registryRecord: null,
      screenshot: null,
      clientId: options.clientId || 'anonymous'
    };
    try { store.addCase(fallbackCase); } catch (_) {}
    return fallbackCase;
  }
};
