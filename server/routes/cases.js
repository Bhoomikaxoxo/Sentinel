const express = require('express');
const router = express.Router();
const store = require('../db/store');
const registryService = require('../services/registryService');

// GET /api/cases - List all cases
router.get('/', (req, res) => {
  try {
    const cases = store.getCases();
    res.json(cases);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve cases' });
  }
});

// GET /api/cases/:id/registry-refresh - Fetch or refresh live WHOIS/RDAP/DNS/SSL registry data for a case
router.get('/:id/registry-refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const caseFile = store.getCaseById(id);
    if (!caseFile) {
      return res.status(404).json({ error: 'Case not found' });
    }

    let hostname = caseFile.url;
    try {
      if (!hostname.startsWith('http://') && !hostname.startsWith('https://')) {
        hostname = 'https://' + hostname;
      }
      hostname = new URL(hostname).hostname;
    } catch(e) {}

    const freshRecord = await registryService.buildRegistryRecord(hostname);
    store.updateCase(id, { registryRecord: freshRecord });
    res.json({ success: true, registryRecord: freshRecord });
  } catch (error) {
    console.error('Error refreshing registry record:', error);
    res.status(500).json({ error: 'Failed to refresh registry record' });
  }
});

// GET /api/cases/:id - Retrieve specific case details
router.get('/:id', (req, res) => {
  try {
    const caseFile = store.getCaseById(req.params.id);
    if (!caseFile) {
      return res.status(404).json({ error: 'Case file not found' });
    }
    res.json(caseFile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve case details' });
  }
});

// POST /api/cases/:id/watch - Toggle domain watchlist monitoring status
router.post('/:id/watch', (req, res) => {
  try {
    const { id } = req.params;
    const { watched } = req.body;
    const success = store.updateCase(id, { watched: watched === true });
    if (success) {
      res.json({ success: true, watched: watched === true });
    } else {
      res.status(404).json({ error: 'Case not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update watch status' });
  }
});

// POST /api/cases/:id/feedback - Handle human-in-the-loop audit accuracy feedback
router.post('/:id/feedback', (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body; // e.g. "inaccurate" or null
    const success = store.updateCase(id, { userFeedback: feedback });
    if (success) {
      res.json({ success: true, userFeedback: feedback });
    } else {
      res.status(404).json({ error: 'Case not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to register feedback' });
  }
});

// DELETE /api/cases - Clear all cases
router.delete('/', (req, res) => {
  try {
    const success = store.clearCases();
    if (success) {
      res.json({ status: 'success', message: 'Case database cleared' });
    } else {
      res.status(500).json({ error: 'Failed to clear database' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

// GET /api/cases/report/:id - Render standalone shareable HTML report
router.get('/report/:id', (req, res) => {
  try {
    const caseFile = store.getCaseById(req.params.id);
    if (!caseFile) {
      return res.status(404).send('<h1>Case File Not Found</h1>');
    }

    let stampColor = 'border-green-700 text-green-700';
    let stampText = 'CLEARED';
    if (caseFile.score < 50) {
      stampColor = 'border-red-700 text-red-700';
      stampText = 'FLAGGED';
    } else if (caseFile.score < 80) {
      stampColor = 'border-amber-700 text-amber-700';
      stampText = 'CAUTION';
    }

    const reasonsHtml = caseFile.reasons.length === 0
      ? '<div class="bg-amber-50/50 p-3 shadow-inner italic text-amber-900/60 font-mono text-sm border border-amber-900/10 rounded">No risk indicators flagged during audit.</div>'
      : caseFile.reasons.map(r => `
          <div class="bg-amber-50/50 p-3 shadow-sm border border-amber-800/10 font-mono text-sm relative mb-3 rounded">
            <div class="text-amber-950">${r}</div>
          </div>
        `).join('');

    const compactRedirectChain = (caseFile.redirectChain || [caseFile.url]).map(url => {
      try { return new URL(url).hostname || url; } catch(e) { return url; }
    }).join(' → ');

    // Surfaced matched feeds banner
    const feedsMatchedBadge = (caseFile.threatFeedsMatched && caseFile.threatFeedsMatched.length > 0)
      ? `<div class="bg-red-800 text-red-50 px-3 py-2 border border-red-900 font-mono text-xs rounded mb-4 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] flex items-center gap-2">
           <span>MATCHED THREAT FEEDS:</span> 
           <span class="bg-red-950 text-white px-2 py-0.5 rounded uppercase tracking-wider">${caseFile.threatFeedsMatched.join(', ')}</span>
         </div>`
      : '';

    // Category chips
    const categoriesHtml = (caseFile.threatCategories || []).map(cat => `
      <span class="bg-red-900/10 text-red-800 border border-red-900/20 text-[10px] uppercase font-mono px-2.5 py-1 rounded-full font-bold mr-2 mb-2 inline-block">${cat}</span>
    `).join('');

    // Confidence badge
    const confidenceBadgeHtml = `
      <span class="ml-2 px-2 py-0.5 text-[10px] uppercase font-mono rounded font-bold ${
        caseFile.confidence === 'HIGH' ? 'bg-green-100 text-green-800 border border-green-300' :
        caseFile.confidence === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
        'bg-red-100 text-red-800 border border-red-300'
      }">CONFIDENCE: ${caseFile.confidence || 'HIGH'}</span>
    `;

    // Highlight annotation overlays over screenshot box
    const screenshotAnnotationsHtml = (caseFile.brandAnnotations || []).map(ann => `
      <div class="absolute border-2 border-red-600 bg-red-600/15 pointer-events-auto group/tooltip cursor-help" style="top: ${ann.top}; left: ${ann.left}; width: ${ann.width}; height: ${ann.height};">
        <div class="hidden group-hover/tooltip:block absolute bottom-full left-1/2 -translate-x-1/2 bg-red-950 text-white font-mono text-[9px] p-2 rounded whitespace-nowrap shadow-lg border border-red-600 z-50 mb-2">
          ⚠️ ${ann.reason} (${ann.brandName})
        </div>
      </div>
    `).join('');

    const forensicSummaryHtml = '';

    // Inaccuracy feedback alert badge
    const feedbackAlertHtml = caseFile.userFeedback === 'inaccurate'
      ? `<div class="bg-red-100 text-red-800 border border-red-400 px-4 py-2 font-mono text-xs rounded mb-6 font-bold text-center">
           ⚠️ REPORT NOTED AS INACCURATE BY AUDITOR — UNDER ACTIVE INVESTIGATION
         </div>`
      : '';

    let registryRecordHtml = '';
    if (caseFile.registryRecord) {
      const rec = caseFile.registryRecord;
      const reg = rec.registration || {};
      const dns = rec.dns || { a: [], mx: [], ns: [], txt: [] };
      const ip = rec.ip || {};
      const cert = rec.certificate || {};

      const createdStr = reg.createdDate ? `${reg.createdDate.substring(0, 10)} (${Math.round((Date.now() - new Date(reg.createdDate).getTime()) / (1000 * 60 * 60 * 24))} days ago)` : '(unavailable)';
      const expiryStr = reg.expiryDate ? reg.expiryDate.substring(0, 10) : '(unavailable)';
      const statusStr = reg.statusCodes && reg.statusCodes.length > 0 ? reg.statusCodes.join(', ') : '(unavailable)';

      const aStr = dns.a && dns.a.length > 0 ? dns.a.join(', ') : '(none found)';
      const mxStr = dns.mx && dns.mx.length > 0 ? dns.mx.join(', ') : '(none found)';
      const nsStr = dns.ns && dns.ns.length > 0 ? dns.ns.join(', ') : '(none found)';
      const txtStr = dns.txt && dns.txt.length > 0 ? dns.txt.join(', ') : '(none found)';

      const certIssuedStr = cert.issuedAt ? `${new Date(cert.issuedAt).toISOString().substring(0, 10)} (${Math.round((Date.now() - new Date(cert.issuedAt).getTime()) / (1000 * 60 * 60 * 24))} days ago)` : '(unavailable)';
      const certExpiryStr = cert.notAfter ? new Date(cert.notAfter).toISOString().substring(0, 10) : '(unavailable)';

      function formatDotRowHtml(label, val) {
        const dotsCount = Math.max(3, 40 - label.length);
        const dots = '.'.repeat(dotsCount);
        return `
          <div class="flex justify-between font-mono text-xs whitespace-pre my-1 border-b border-dashed border-gray-100 pb-0.5">
            <span class="text-gray-500 uppercase font-bold">${label} ${dots}</span>
            <span class="font-bold text-black text-right break-all max-w-md">${val || '(unavailable)'}</span>
          </div>
        `;
      }

      registryRecordHtml = `
        <div class="mt-8 border-t border-amber-900/20 pt-8">
          <h3 class="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 mb-4">REGISTRY RECORD (OFFICIAL LOOKUP PRINTOUT)</h3>
          <div class="bg-white text-black border border-gray-300 p-6 shadow-sm relative min-h-[300px] font-mono text-sm leading-relaxed rounded overflow-hidden">
            <!-- Low opacity CERTIFIED RECORD watermark -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden opacity-[0.04]">
              <span class="font-bold text-4xl tracking-widest uppercase rotate-[-28deg] border-4 border-black px-4 py-2 whitespace-nowrap">CERTIFIED RECORD</span>
            </div>

            <!-- Header -->
            <div class="border-b border-black pb-2 mb-4">
              <div class="flex justify-between items-start font-bold">
                <span class="text-sm">DOMAIN REGISTRY LOOKUP</span>
                <span class="text-[10px]">RECORD #<span>${caseFile.id.substring(0, 8)}</span></span>
              </div>
            </div>

            <div class="space-y-4 relative z-10">
              <!-- Registration -->
              <div>
                <h4 class="font-bold border-b border-black pb-0.5 mb-2 text-xs text-gray-800 uppercase tracking-wide">REGISTRATION</h4>
                ${formatDotRowHtml('Registrar', reg.registrar)}
                ${formatDotRowHtml('Created', createdStr)}
                ${formatDotRowHtml('Expires', expiryStr)}
                ${formatDotRowHtml('Status', statusStr)}
                ${formatDotRowHtml('Registrant Org', reg.registrantOrg)}
                ${formatDotRowHtml('Registrant Country', reg.registrantCountry)}
              </div>

              <!-- DNS Records -->
              <div>
                <h4 class="font-bold border-b border-black pb-0.5 mb-2 text-xs text-gray-800 uppercase tracking-wide">DNS RECORDS</h4>
                ${formatDotRowHtml('A', aStr)}
                ${formatDotRowHtml('MX', mxStr)}
                ${formatDotRowHtml('NS', nsStr)}
                ${formatDotRowHtml('TXT', txtStr)}
              </div>

              <!-- Network Geolocation -->
              <div>
                <h4 class="font-bold border-b border-black pb-0.5 mb-2 text-xs text-gray-800 uppercase tracking-wide">NETWORK GEOLOCATION</h4>
                ${formatDotRowHtml('IP Address', ip.ip)}
                ${formatDotRowHtml('Hosting Org', ip.org)}
                ${formatDotRowHtml('ISP Operator', ip.isp)}
                ${formatDotRowHtml('ASN', ip.asn)}
                ${formatDotRowHtml('Location', ip.ip ? `${ip.city}, ${ip.region}, ${ip.country}` : null)}
              </div>

              <!-- SSL Certificate -->
              <div>
                <h4 class="font-bold border-b border-black pb-0.5 mb-2 text-xs text-gray-800 uppercase tracking-wide">SSL CERTIFICATE</h4>
                ${formatDotRowHtml('Issuer', cert.issuer)}
                ${formatDotRowHtml('Issued', certIssuedStr)}
                ${formatDotRowHtml('Valid Until', certExpiryStr)}
                ${formatDotRowHtml('Certificates on Record', cert.totalCertsFound !== undefined ? cert.totalCertsFound.toString() : null)}
              </div>
            </div>

            <!-- Footer -->
            <div class="border-t border-gray-200 mt-6 pt-2 flex justify-between items-center text-[8px] text-gray-500 font-bold">
              <span>Data sourced via RDAP, DoH, IP-API, and crt.sh</span>
              <span>fetchedAt: ${rec.fetchedAt ? rec.fetchedAt.replace('T', ' // ').substring(0, 19) : caseFile.timestamp}</span>
            </div>
          </div>
        </div>
      `;
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>SENTINEL AI | SHAREABLE REPORT #${caseFile.id}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;700&family=Newsreader:opsz,wght@6..72,400;500&display=swap" rel="stylesheet"/>
  <style>
    body {
      background-color: #12181d;
      font-family: 'Newsreader', serif;
    }
    .folder-texture {
      background-color: #dfd1b3;
      background-image: radial-gradient(rgba(0,0,0,0.03) 1px, transparent 0),
                        radial-gradient(rgba(0,0,0,0.03) 1px, transparent 0);
      background-size: 8px 8px;
      background-position: 0 0, 4px 4px;
    }
    .stamped-effect {
      text-shadow: 1px 1px 1px rgba(0,0,0,0.05);
      letter-spacing: 0.1em;
      transform: rotate(-3deg);
    }
  </style>
</head>
<body class="p-4 md:p-8 flex justify-center items-center min-h-screen">
  <div class="max-w-4xl w-full folder-texture border border-amber-900/30 shadow-2xl p-6 md:p-12 relative rounded-lg mt-8">
    <!-- Top Folder tab -->
    <div class="absolute -top-7 left-8 bg-[#dfd1b3] px-6 py-1 border-t border-l border-r border-amber-900/30 font-mono text-xs font-bold text-amber-950 rounded-t">
      CASE_${caseFile.id.substring(0, 8)}
    </div>

    <!-- Feedback banner -->
    ${feedbackAlertHtml}

    <!-- Header metadata -->
    <div class="flex flex-col md:flex-row justify-between items-start border-b border-amber-900/20 pb-6 mb-8 gap-4">
      <div>
        <h1 class="font-mono text-2xl font-bold text-amber-950 flex items-center flex-wrap gap-2">
          <span>SENTINEL AI // THREAT REPORT</span>
          ${confidenceBadgeHtml}
        </h1>
        <p class="font-mono text-sm text-amber-900/70 mt-1">TARGET URL: <span class="break-all font-bold text-amber-950">${caseFile.url}</span></p>
        <p class="font-mono text-xs text-amber-900/60 mt-0.5">OPENED: ${caseFile.timestamp} // VERDICT: ${caseFile.priority}</p>
        <div class="mt-4 flex flex-wrap">
          ${categoriesHtml}
        </div>
      </div>
      
      <!-- Verdict Stamp -->
      <div class="stamped-effect ${stampColor} border-4 px-6 py-2 rounded text-2xl font-bold uppercase">
        ${stampText} (${caseFile.score}/100)
      </div>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left side: Screenshot & Redirects -->
      <div class="space-y-6">
        <h3 class="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-900/20 pb-1">EXHIBIT A: PROBE CAPTURE</h3>
        
        <!-- Compact redirect path inline -->
        <div class="bg-[#ecdcb7] border border-amber-900/10 p-3 rounded font-mono text-xs text-amber-950 break-all shadow-inner">
          <span class="font-bold text-amber-900 uppercase block mb-1">Inline Redirect Pathway</span>
          ${compactRedirectChain}
        </div>

        ${caseFile.screenshot ? `
          <div class="bg-white p-4 border border-amber-900/20 shadow-md transform rotate-1 rounded relative overflow-hidden">
            <div class="relative w-full h-auto">
              <img class="w-full h-auto object-cover grayscale-[0.1] border border-gray-200" src="data:image/png;base64,${caseFile.screenshot}"/>
              <!-- Brand highlights visual overlays -->
              ${screenshotAnnotationsHtml}
            </div>
            <div class="font-mono text-[10px] text-gray-500 mt-2 text-center">CAPTURE_SCR_${caseFile.id.substring(0, 8)}.JPG</div>
          </div>
        ` : `
          <div class="bg-amber-50/50 p-8 border border-dashed border-amber-900/20 text-center font-mono text-sm text-amber-900/60">
            NO CAPTURE ATTACHED
          </div>
        `}
      </div>

      <!-- Right side: Evidence, Forensic Summary & Notes -->
      <div class="space-y-6">
        <!-- Matched feeds banner -->
        ${feedsMatchedBadge}

        <div>
          <h3 class="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-900/20 pb-1 mb-4">EVIDENCE LOG (RISK FACTORS)</h3>
          ${reasonsHtml}
        </div>



        <div class="bg-[#f0e4cc] p-6 border border-amber-900/10 rounded shadow-inner">
          <h3 class="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-900/20 pb-1 mb-3">INVESTIGATOR NOTES</h3>
          <p class="text-amber-950 leading-relaxed text-lg italic">
            "${caseFile.notes}"
          </p>
        </div>
      </div>
    </div>

    ${registryRecordHtml}

    <!-- Footer label -->
    <div class="mt-12 border-t border-amber-900/20 pt-4 flex justify-between items-center text-xs font-mono text-amber-900/60">
      <span>SENTINEL THREAT SWEEP // PUBLIC ACCESS</span>
      <span>SCORE: ${caseFile.score}/100</span>
    </div>
  </div>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error generating report</h1>');
  }
});

module.exports = router;
