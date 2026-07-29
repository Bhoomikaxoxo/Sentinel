const tabs = [
  { buttonId: 'nav-dashboard', sectionId: 'view-section-dashboard', title: 'CASE REPORT' },
  { buttonId: 'nav-archive', sectionId: 'view-section-archive', title: 'CASE ARCHIVE' },
  { buttonId: 'nav-registry', sectionId: 'view-section-registry', title: 'REGISTRY RECORD' },
  { buttonId: 'nav-logs', sectionId: 'view-section-logs', title: 'CASE AUDIT LOGS' },
  { buttonId: 'nav-mapper', sectionId: 'view-section-mapper', title: 'INTERNET MAPPER' },
  { buttonId: 'nav-settings', sectionId: 'view-section-settings', title: 'SYSTEM SETTINGS' }
];

let activeTab = 'nav-dashboard';
let currentCase = null; // Currently selected active case file
let serverCases = [];   // Local cache of server cases
let isSimplifiedNotesMode = false;
let isBatchMode = false;

function initTabs() {
  tabs.forEach(tab => {
    const btn = document.getElementById(tab.buttonId);
    btn.addEventListener('click', () => {
      switchTab(tab.buttonId);
    });
  });

  // "New Case File" sidebar shortcut
  document.getElementById('new-case-btn').addEventListener('click', () => {
    currentCase = null;
    document.getElementById('url-input').value = '';
    document.getElementById('batch-url-input').value = '';
    document.getElementById('reportView').classList.add('hidden');
    document.getElementById('scanner-placeholder').classList.remove('hidden');
    switchTab('nav-dashboard');
    if (isBatchMode) {
      document.getElementById('batch-url-input').focus();
    } else {
      document.getElementById('url-input').focus();
    }
  });

  // View full logbook dashboard button shortcut
  document.getElementById('view-logbook-btn').addEventListener('click', () => {
    switchTab('nav-archive');
  });

  // Toolbar shortcut to jump to Registry Record for current case
  const viewCaseRegistryBtn = document.getElementById('view-case-registry-btn');
  if (viewCaseRegistryBtn) {
    viewCaseRegistryBtn.addEventListener('click', () => {
      switchTab('nav-registry');
    });
  }

  // Registry section shortcut to jump to Full Report for active case
  const registryToReportBtn = document.getElementById('registry-to-report-btn');
  if (registryToReportBtn) {
    registryToReportBtn.addEventListener('click', () => {
      if (currentCase) {
        openCaseReport(currentCase);
      } else if (serverCases.length > 0) {
        openCaseReport(serverCases[0]);
      } else {
        switchTab('nav-dashboard');
      }
    });
  }

  // Registry section button to re-fetch live WHOIS / RDAP / DNS / SSL
  const registryRefreshBtn = document.getElementById('registry-refresh-btn');
  if (registryRefreshBtn) {
    registryRefreshBtn.addEventListener('click', async () => {
      const activeCaseFile = currentCase || serverCases[0];
      if (activeCaseFile) {
        await refreshRegistryRecordForCase(activeCaseFile);
      }
    });
  }

  // Simplify Notes Toggle Button
  const simplifyBtn = document.getElementById('notes-simplify-btn');
  if (simplifyBtn) {
    simplifyBtn.addEventListener('click', () => {
      isSimplifiedNotesMode = !isSimplifiedNotesMode;
      if (currentCase) {
        updateInvestigatorNotes(currentCase);
      }
    });
  }
}

async function switchTab(buttonId) {
  activeTab = buttonId;
  tabs.forEach(tab => {
    const btn = document.getElementById(tab.buttonId);
    const section = document.getElementById(tab.sectionId);

    if (tab.buttonId === buttonId) {
      // Active styling
      btn.className = 'sidebar-nav-active w-full flex items-center gap-3 px-4 py-3 font-data-mono text-[11px] uppercase tracking-wider transition-all';
      section.classList.remove('hidden');
      document.getElementById('view-title').textContent = tab.title;
    } else {
      // Inactive styling
      btn.className = 'sidebar-nav-inactive w-full flex items-center gap-3 px-4 py-3 font-data-mono text-[11px] uppercase tracking-wider transition-all';
      section.classList.add('hidden');
    }
  });

  if (buttonId === 'nav-dashboard') {
    updateDashboardStats();
    if (currentCase) {
      document.getElementById('reportView').classList.remove('hidden');
      document.getElementById('scanner-placeholder').classList.add('hidden');
    } else {
      document.getElementById('reportView').classList.add('hidden');
      document.getElementById('scanner-placeholder').classList.remove('hidden');
    }
  } else if (buttonId === 'nav-archive') {
    await fetchCasesFromServer();
    renderArchiveGrid();
  } else if (buttonId === 'nav-registry') {
    renderRegistryRecord();
  } else if (buttonId === 'nav-mapper') {
    renderInternetMap();
  }
}

// Server Database API integration
async function fetchCasesFromServer() {
  try {
    const response = await fetch('/api/cases');
    if (response.ok) {
      serverCases = await response.json();
    }
  } catch (err) {
    console.error('Failed to load cases from server database:', err);
  }
}

async function clearArchiveOnServer() {
  if (confirm("Are you sure you want to clear all archived case files from the server database?")) {
    try {
      const response = await fetch('/api/cases', { method: 'DELETE' });
      if (response.ok) {
        serverCases = [];
        renderArchiveGrid();
        currentCase = null;
        updateDashboardStats();
        document.getElementById('reportView').classList.add('hidden');
        document.getElementById('scanner-placeholder').classList.remove('hidden');
      } else {
        alert('Failed to clear case database.');
      }
    } catch (err) {
      alert('Network error connecting to server.');
      console.error(err);
    }
  }
}

document.getElementById('clear-archive-btn').addEventListener('click', clearArchiveOnServer);

// Local User Settings management
const DEFAULT_SETTINGS = {
  workerUrl: 'http://127.0.0.1:4000',
  timeout: '10',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function getSettings() {
  return {
    workerUrl: localStorage.getItem('sentinel_worker_url') || DEFAULT_SETTINGS.workerUrl,
    timeout: localStorage.getItem('sentinel_timeout') || DEFAULT_SETTINGS.timeout,
    userAgent: localStorage.getItem('sentinel_user_agent') || DEFAULT_SETTINGS.userAgent
  };
}

function initSettings() {
  const config = getSettings();

  // Populate UI inputs
  document.getElementById('setting-worker-url').value = config.workerUrl;
  document.getElementById('setting-timeout').value = config.timeout;
  document.getElementById('setting-timeout-val').textContent = `${config.timeout}s`;
  document.getElementById('setting-user-agent').value = config.userAgent;

  // Slider update event
  document.getElementById('setting-timeout').addEventListener('input', (e) => {
    document.getElementById('setting-timeout-val').textContent = `${e.target.value}s`;
  });

  // Save Settings
  document.getElementById('settings-save-btn').addEventListener('click', () => {
    localStorage.setItem('sentinel_worker_url', document.getElementById('setting-worker-url').value.trim());
    localStorage.setItem('sentinel_timeout', document.getElementById('setting-timeout').value);
    localStorage.setItem('sentinel_user_agent', document.getElementById('setting-user-agent').value.trim());
    alert('System Configuration Saved.');
  });

  // Reset Settings
  document.getElementById('settings-reset-btn').addEventListener('click', () => {
    if (confirm("Reset configuration settings to factory defaults?")) {
      localStorage.setItem('sentinel_worker_url', DEFAULT_SETTINGS.workerUrl);
      localStorage.setItem('sentinel_timeout', DEFAULT_SETTINGS.timeout);
      localStorage.setItem('sentinel_user_agent', DEFAULT_SETTINGS.userAgent);

      initSettings(); // Re-populate UI
    }
  });
}


// Case Log Console Printing (Animated Type-in Effect)
let logsPrintingInterval = null;

function renderLiveLogs(logsList) {
  // Clear any active typing animation
  if (logsPrintingInterval) {
    clearInterval(logsPrintingInterval);
  }

  const terminal = document.getElementById('log-terminal');
  terminal.innerHTML = '';
  let index = 0;

  function printLine() {
    if (index < logsList.length) {
      const line = logsList[index];
      const div = document.createElement('div');

      // Determine line styling based on log contents
      if (line.includes('ALERT:') || line.includes('failed') || line.includes('error') || line.includes('warning:')) {
        div.className = 'font-data-mono text-sm leading-6 py-0.5 text-error opacity-0 transition-opacity duration-200';
      } else if (line.includes('complete') || line.includes('persisted') || line.includes('CONCLUDED') || line.includes('successful') || line.includes('saved:')) {
        div.className = 'font-data-mono text-sm leading-6 py-0.5 text-green-400 opacity-0 transition-opacity duration-200';
      } else if (line.startsWith('---')) {
        div.className = 'font-data-mono text-sm leading-6 py-1 text-yellow-400 font-bold opacity-0 transition-opacity duration-200';
      } else {
        div.className = 'font-data-mono text-sm leading-6 py-0.5 text-[#38BDF8] opacity-0 transition-opacity duration-200';
      }

      div.textContent = line;
      terminal.appendChild(div);

      // Fade-in line
      setTimeout(() => div.classList.remove('opacity-0'), 10);

      // Scroll to bottom
      terminal.scrollTop = terminal.scrollHeight;
      index++;
    } else {
      clearInterval(logsPrintingInterval);
      logsPrintingInterval = null;
    }
  }

  // Print first line immediately, then queue the rest
  printLine();
  logsPrintingInterval = setInterval(printLine, 100);
}

// Toggle Input Modes (Single vs. Batch Scan)
function setBatchMode(active) {
  isBatchMode = active;
  const urlInput = document.getElementById('url-input');
  const batchInput = document.getElementById('batch-url-input');
  const toggleText = document.getElementById('batch-toggle-text');
  const toggleBtn = document.getElementById('batch-toggle-btn');
  const modeIcon = document.getElementById('input-mode-icon');

  if (active) {
    urlInput.classList.add('hidden');
    batchInput.classList.remove('hidden');
    toggleText.textContent = 'SINGLE';
    toggleBtn.classList.add('bg-primary-fixed', 'text-primary');
    modeIcon.textContent = 'lists';
    batchInput.focus();
  } else {
    urlInput.classList.remove('hidden');
    batchInput.classList.add('hidden');
    toggleText.textContent = 'BATCH';
    toggleBtn.classList.remove('bg-primary-fixed', 'text-primary');
    modeIcon.textContent = 'search';
    urlInput.focus();
  }
}

document.getElementById('batch-toggle-btn').addEventListener('click', () => {
  setBatchMode(!isBatchMode);
});

// Client-side QR Code File Upload Scanner
document.getElementById('qr-upload-btn').addEventListener('click', () => {
  document.getElementById('qr-file-input').click();
});

document.getElementById('qr-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    const img = new Image();
    img.onload = function () {
      // Create canvas context to decode raw pixels via jsQR
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);

      if (code && code.data) {
        document.getElementById('url-input').value = code.data;
        setBatchMode(false);
        alert(`QR Code successfully decoded: ${code.data}`);
        document.getElementById('scan-btn').click(); // Automatically trigger scan
      } else {
        alert("Failed to decode QR code. Ensure it has a clear QR matrix containing a URL.");
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // Reset file input
});

// Execute Scan Button Event Listener
document.getElementById('scan-btn').addEventListener('click', async () => {
  if (isBatchMode) {
    const text = document.getElementById('batch-url-input').value.trim();
    if (!text) return;
    const urls = text.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    await runBatchScan(urls);
  } else {
    const urlInput = document.getElementById('url-input').value.trim();
    if (!urlInput) return;
    await runSingleScan(urlInput);
  }
});

// Single Scan Pipeline
async function runSingleScan(urlInput) {
  const btn = document.getElementById('scan-btn');
  const originalText = btn.textContent;
  btn.textContent = '[PROCESSING...]';
  btn.disabled = true;
  btn.classList.add('opacity-50', 'pointer-events-none');

  // Pre-load Case Logs Console with initial status
  switchTab('nav-logs');
  const terminal = document.getElementById('log-terminal');
  terminal.innerHTML = `
    <div class="font-data-mono text-sm text-yellow-400 py-1 font-bold">[${new Date().toISOString().substring(11, 19)}] --- INITIATING DIAL CONNECTIONS ---</div>
    <div class="font-data-mono text-sm text-[#38BDF8] py-0.5">[${new Date().toISOString().substring(11, 19)}] Querying Sentinel threat matrix configuration...</div>
    <div class="font-data-mono text-sm text-[#38BDF8] py-0.5">[${new Date().toISOString().substring(11, 19)}] Contacting server API at /api/scan...</div>
  `;

  // Fetch scan options from settings
  const config = getSettings();
  const timeoutMs = parseInt(config.timeout) * 1000;

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: urlInput,
        userAgent: config.userAgent,
        timeout: timeoutMs
      })
    });

    if (!response.ok) throw new Error('API Error');
    const caseFile = await response.json();

    currentCase = caseFile;

    // Add to serverCases local cache array
    serverCases = serverCases.filter(c => c.url !== caseFile.url);
    serverCases.unshift(caseFile);
    updateDashboardStats();

    // Live print case logs in console tab
    renderLiveLogs(caseFile.logs || []);

    // Switch to Dashboard report view after brief delay to let user see logs start
    setTimeout(() => {
      displayCaseReport(caseFile);
      switchTab('nav-dashboard');
    }, 2000);

  } catch (error) {
    const errorMsg = `[${new Date().toISOString().substring(11, 19)}] ERROR: Threat sweep failed to complete. Server unavailable.`;
    const errDiv = document.createElement('div');
    errDiv.className = 'font-data-mono text-sm py-1 text-error';
    errDiv.textContent = errorMsg;
    terminal.appendChild(errDiv);

    alert("Investigation aborted. Verify that both the server and worker are running.");
    btn.textContent = originalText;
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'pointer-events-none');
    switchTab('nav-dashboard');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'pointer-events-none');
  }
}

// Batch Scan Pipeline
async function runBatchScan(urls) {
  const btn = document.getElementById('scan-btn');
  const originalText = btn.textContent;
  btn.textContent = '[BATCH RUN...]';
  btn.disabled = true;
  btn.classList.add('opacity-50', 'pointer-events-none');

  switchTab('nav-logs');
  const terminal = document.getElementById('log-terminal');
  terminal.innerHTML = `
    <div class="font-data-mono text-sm text-yellow-400 py-1 font-bold">[${new Date().toISOString().substring(11, 19)}] --- INITIATING BATCH WORKLOAD ---</div>
    <div class="font-data-mono text-sm text-[#38BDF8] py-0.5">[${new Date().toISOString().substring(11, 19)}] Enqueuing ${urls.length} target sites for analysis...</div>
  `;

  try {
    const response = await fetch('/api/scan/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });

    if (!response.ok) throw new Error('Batch API Error');
    const data = await response.json();

    terminal.innerHTML += `<div class="font-data-mono text-sm text-green-400 py-1 font-bold">[${new Date().toISOString().substring(11, 19)}] Batch sweep complete. Rendering results.</div>`;

    // Refresh cases and update stats
    await fetchCasesFromServer();
    updateDashboardStats();

    setTimeout(() => {
      renderBatchResults(data.results || []);
      switchTab('nav-dashboard');
    }, 1500);

  } catch (error) {
    const errorMsg = `[${new Date().toISOString().substring(11, 19)}] ERROR: Batch run aborted. Server connection lost.`;
    const errDiv = document.createElement('div');
    errDiv.className = 'font-data-mono text-sm py-1 text-error';
    errDiv.textContent = errorMsg;
    terminal.appendChild(errDiv);

    alert("Batch scan failed.");
    switchTab('nav-dashboard');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'pointer-events-none');
  }
}

// Render Batch Results Table
function renderBatchResults(results) {
  const tbody = document.getElementById('batch-results-tbody');
  tbody.innerHTML = '';

  results.forEach(res => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-primary-fixed/5 transition-colors border-b border-primary/10';

    let verdictColor = 'text-error';
    if (res.priority === 'ROUTINE') verdictColor = 'text-primary';
    else if (res.priority.includes('CAUTION')) verdictColor = 'text-verdict-caution';

    const risks = res.reasons && res.reasons.length > 0
      ? res.reasons.slice(0, 2).join(', ') + (res.reasons.length > 2 ? '...' : '')
      : 'Clean / Low Risk';

    tr.innerHTML = `
      <td class="p-3 font-semibold break-all text-ink">${res.url}</td>
      <td class="p-3 font-bold ${verdictColor}">${res.priority}</td>
      <td class="p-3 font-bold">${res.score}/100</td>
      <td class="p-3 text-on-surface-variant truncate max-w-xs">${risks}</td>
      <td class="p-3">
        ${res.id ? `
          <button class="bg-primary text-background font-data-mono text-[10px] px-3 py-1.5 shadow-sm hover:scale-105 active:scale-95 transition-all load-batch-case-btn" data-id="${res.id}">
            [VIEW]
          </button>
        ` : '<span class="text-error font-data-mono text-xs">FAILED</span>'}
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach buttons listeners to open reports
  tbody.querySelectorAll('.load-batch-case-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      try {
        const caseResponse = await fetch(`/api/cases/${id}`);
        if (caseResponse.ok) {
          const caseFile = await caseResponse.json();
          currentCase = caseFile;
          displayCaseReport(caseFile);
          switchTab('nav-dashboard');
          document.getElementById('batchResultsView').classList.add('hidden');
        }
      } catch (err) {
        console.error(err);
      }
    });
  });

  document.getElementById('batchResultsView').classList.remove('hidden');
}

document.getElementById('batch-close-btn').addEventListener('click', () => {
  document.getElementById('batchResultsView').classList.add('hidden');
});

// Star Monitor Watchlist event handler
document.getElementById('watch-case-btn').addEventListener('click', async () => {
  if (!currentCase) return;
  const isNowWatched = !(currentCase.watched === true);

  try {
    const response = await fetch(`/api/cases/${currentCase.id}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watched: isNowWatched })
    });

    if (response.ok) {
      currentCase.watched = isNowWatched;

      // Sync local cache
      const localIdx = serverCases.findIndex(c => c.id === currentCase.id);
      if (localIdx !== -1) {
        serverCases[localIdx].watched = isNowWatched;
      }

      displayCaseReport(currentCase);
    }
  } catch (err) {
    console.error('Failed to update watch status:', err);
  }
});

// Copy Shareable Link event handler
document.getElementById('share-report-btn').addEventListener('click', () => {
  if (!currentCase) return;
  const shareUrl = `${window.location.origin}/api/cases/report/${currentCase.id}`;
  navigator.clipboard.writeText(shareUrl)
    .then(() => {
      alert(`Standalone share link copied to clipboard:\n${shareUrl}`);
    })
    .catch(err => {
      alert('Failed to copy link. Clipboard access blocked.');
      console.error(err);
    });
});

// Accuracy Feedback event handler
document.getElementById('report-feedback-btn').addEventListener('click', async () => {
  if (!currentCase) return;
  const isNowInaccurate = currentCase.userFeedback === 'inaccurate' ? null : 'inaccurate';

  try {
    const response = await fetch(`/api/cases/${currentCase.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: isNowInaccurate })
    });

    if (response.ok) {
      currentCase.userFeedback = isNowInaccurate;

      // Sync local cache
      const localIdx = serverCases.findIndex(c => c.id === currentCase.id);
      if (localIdx !== -1) {
        serverCases[localIdx].userFeedback = isNowInaccurate;
      }

      displayCaseReport(currentCase);
      renderArchiveGrid();
    }
  } catch (err) {
    console.error('Failed to update feedback status:', err);
  }
});

// Render Manila Folder Case Report
function displayCaseReport(caseFile) {
  // Hide placeholder and show report
  document.getElementById('scanner-placeholder').classList.add('hidden');
  const reportView = document.getElementById('reportView');
  reportView.classList.remove('hidden');

  // Fill in case metadata
  document.getElementById('case-id-display').textContent = `CASE #${caseFile.id.substring(0, 8)}`;
  document.getElementById('folder-tab-id').textContent = `CASE_${caseFile.id.substring(0, 8)}`;
  document.getElementById('case-timestamp-display').textContent = `OPENED: ${caseFile.timestamp}`;
  document.getElementById('case-priority-display').textContent = `PRIORITY: ${caseFile.priority}`;

  // Set case review status based on accuracy feedback
  if (caseFile.userFeedback === 'inaccurate') {
    document.getElementById('case-status-display').textContent = 'STATUS: UNDER AUDIT (RE-REVIEW)';
    document.getElementById('case-status-display').className = 'font-data-mono text-label-sm text-error font-bold';
  } else {
    document.getElementById('case-status-display').textContent = 'STATUS: CONCLUDED';
    document.getElementById('case-status-display').className = 'font-data-mono text-label-sm text-ink-variant';
  }

  // Investigator Notes
  updateInvestigatorNotes(caseFile);

  // Star watch status UI updates
  const starIcon = document.getElementById('watch-star-icon');
  const watchText = document.getElementById('watch-btn-text');
  if (caseFile.watched === true) {
    starIcon.textContent = 'star';
    starIcon.classList.add('text-yellow-500');
    starIcon.classList.remove('text-on-surface-variant');
    watchText.textContent = 'WATCHED';
  } else {
    starIcon.textContent = 'star_border';
    starIcon.classList.remove('text-yellow-500');
    starIcon.classList.add('text-on-surface-variant');
    watchText.textContent = 'WATCH DOMAIN';
  }

  // Visual diff layout changes updates
  const diffAlert = document.getElementById('visual-diff-alert');
  if (caseFile.visualDiffPercent !== null && caseFile.visualDiffPercent !== undefined) {
    diffAlert.textContent = `WARNING: Page layout changed by ${caseFile.visualDiffPercent}% since last audit.`;
    diffAlert.classList.remove('hidden');
  } else {
    diffAlert.classList.add('hidden');
  }

  // Accuracy Feedback Button layout styling
  const feedbackBtn = document.getElementById('report-feedback-btn');
  const feedbackText = document.getElementById('feedback-btn-text');
  if (caseFile.userFeedback === 'inaccurate') {
    feedbackBtn.className = 'flex items-center gap-1 font-data-mono text-xs border border-error px-3 py-1.5 bg-error text-on-primary rounded hover:bg-error/90 hover:scale-105 active:scale-95 transition-all';
    feedbackText.textContent = 'REPORT INACCURATE';
  } else {
    feedbackBtn.className = 'flex items-center gap-1 font-data-mono text-xs border border-outline-variant px-3 py-1.5 bg-paper rounded hover:bg-[#e4d9be] hover:scale-105 active:scale-95 transition-all';
    feedbackText.textContent = 'MARK INACCURATE';
  }

  // Verdict Stamp Styling (Including inline score display)
  const stampContainer = document.getElementById('verdict-stamp-container');
  const stampText = document.getElementById('verdict-stamp-text');

  // Reset stamp animation
  stampContainer.classList.remove('animate-stamp');
  stampContainer.style.opacity = '0';
  void stampContainer.offsetWidth; // force reflow
  stampContainer.classList.add('animate-stamp');

  if (caseFile.score >= 80) {
    stampText.textContent = `CLEARED (${caseFile.score}/100)`;
    stampText.className = 'border-4 border-outline-variant text-primary px-6 py-2 font-display-lg text-display-lg stamped-effect flex items-center gap-2 uppercase tracking-wide';
  } else if (caseFile.score >= 50) {
    stampText.textContent = `CAUTION (${caseFile.score}/100)`;
    stampText.className = 'border-4 border-secondary text-verdict-caution px-6 py-2 font-display-lg text-display-lg stamped-effect flex items-center gap-2 uppercase tracking-wide';
  } else {
    stampText.textContent = `FLAGGED (${caseFile.score}/100)`;
    stampText.className = 'border-4 border-error text-error px-6 py-2 font-display-lg text-display-lg stamped-effect flex items-center gap-2 uppercase tracking-wide';
  }

  // Threat Category Badges
  const categoryContainer = document.getElementById('threat-category-container');
  categoryContainer.innerHTML = '';
  if (caseFile.threatCategories && caseFile.threatCategories.length > 0) {
    caseFile.threatCategories.forEach(cat => {
      const badge = document.createElement('span');
      badge.className = 'bg-error/10 text-error border border-error/25 text-[9px] uppercase font-data-mono px-2 py-0.5 rounded font-bold';
      badge.textContent = cat;
      categoryContainer.appendChild(badge);
    });
  }

  // Confidence Indicator Badge
  const confidenceDisplay = document.getElementById('case-confidence-display');
  confidenceDisplay.textContent = `CONFIDENCE: ${caseFile.confidence || 'HIGH'}`;
  if (caseFile.confidence === 'HIGH') {
    confidenceDisplay.className = 'font-data-mono text-[10px] text-green-600 mt-1 font-bold';
  } else if (caseFile.confidence === 'MEDIUM') {
    confidenceDisplay.className = 'font-data-mono text-[10px] text-yellow-600 mt-1 font-bold';
  } else {
    confidenceDisplay.className = 'font-data-mono text-[10px] text-error mt-1 font-bold';
  }

  // Inline redirects trail breadcrumbs
  const inlineTrail = document.getElementById('redirect-inline-trail');
  if (caseFile.redirectChain && caseFile.redirectChain.length > 0) {
    inlineTrail.classList.remove('hidden');
    const cleanChain = caseFile.redirectChain.map(url => {
      try { return new URL(url).hostname || url; } catch (e) { return url; }
    }).join(' → ');
    inlineTrail.innerHTML = `<span class="text-primary font-bold uppercase">REDIRECT PATHWAY:</span> ${cleanChain}`;
  } else {
    inlineTrail.classList.add('hidden');
  }

  // Render screenshot (Exhibit A)
  const screenshotImg = document.getElementById('screenshot-img');
  const screenshotPlaceholder = document.getElementById('screenshot-placeholder');
  const exhibitFrame = document.getElementById('exhibit-frame');
  const screenshotTs = document.getElementById('screenshot-timestamp');
  const overlayContainer = document.getElementById('screenshot-overlay-container');

  // Clear visual highlighter boxes
  overlayContainer.innerHTML = '';

  if (caseFile.screenshot) {
    screenshotImg.src = `data:image/png;base64,${caseFile.screenshot}`;
    screenshotImg.classList.remove('hidden');
    screenshotPlaceholder.classList.add('hidden');
    exhibitFrame.classList.remove('hidden');

    // Add paper frame styling
    exhibitFrame.className = 'bg-paper p-4 border border-outline-variant shadow-md transform rotate-2 relative transition-all duration-300';
    screenshotTs.textContent = `FILE: CAPTURE_SCR_${caseFile.id.substring(0, 8)}.JPG // SANDBOXED`;

    // Render brand annotations overlays dynamically over the screenshot
    if (caseFile.brandAnnotations && caseFile.brandAnnotations.length > 0) {
      caseFile.brandAnnotations.forEach(ann => {
        const overlay = document.createElement('div');
        overlay.className = 'absolute border-2 border-error bg-error/15 pointer-events-auto cursor-help group/tooltip';
        overlay.style.top = ann.top;
        overlay.style.left = ann.left;
        overlay.style.width = ann.width;
        overlay.style.height = ann.height;

        const tooltip = document.createElement('div');
        tooltip.className = 'hidden group-hover/tooltip:block absolute bottom-full left-1/2 -translate-x-1/2 bg-error text-on-primary font-data-mono text-[9px] p-2 rounded whitespace-nowrap shadow-lg border border-outline-variant z-50 mb-2';
        tooltip.innerHTML = `⚠️ ${ann.reason} (${ann.brandName})`;

        overlay.appendChild(tooltip);
        overlayContainer.appendChild(overlay);
      });
    }
  } else {
    screenshotImg.src = '';
    screenshotImg.classList.add('hidden');
    screenshotPlaceholder.classList.remove('hidden');
    exhibitFrame.className = 'bg-paper p-8 border border-dashed border-outline-variant relative text-center';
    screenshotTs.textContent = 'NO ATTACHMENT CAPTURED';
  }

  // Surfaced threat feeds matching banner
  const feedsBanner = document.getElementById('threat-feeds-banner');
  if (caseFile.threatFeedsMatched && caseFile.threatFeedsMatched.length > 0) {
    feedsBanner.classList.remove('hidden');
    document.getElementById('threat-feeds-banner-text').innerHTML = `
      MATCHED THREAT FEEDS: <span class="bg-red-950 text-white px-2 py-0.5 rounded font-bold">${caseFile.threatFeedsMatched.join(', ').toUpperCase()}</span>
    `;
  } else {
    feedsBanner.classList.add('hidden');
  }

  // Render Pinned Evidence Log Tags
  const reasonsList = document.getElementById('reasons-list');
  reasonsList.innerHTML = '';

  if (caseFile.reasons.length === 0) {
    const div = document.createElement('div');
    div.className = 'pin-tag bg-paper-container-lowest folder-texture p-3 pin-hole shadow-sm';
    div.innerHTML = `<div class="font-data-mono text-data-mono text-on-surface-variant italic">No risk indicators flagged during audit.</div>`;
    reasonsList.appendChild(div);
  } else {
    caseFile.reasons.forEach((reason, index) => {
      const div = document.createElement('div');
      div.className = 'pin-tag bg-paper-container-lowest folder-texture p-3 pin-hole shadow-sm opacity-0 translate-x-4 transition-all duration-500';
      div.style.transitionDelay = `${index * 80}ms`;
      div.innerHTML = `<div class="font-data-mono text-data-mono text-ink">${reason}</div>`;
      reasonsList.appendChild(div);

      // Trigger fade in
      setTimeout(() => {
        div.classList.remove('opacity-0', 'translate-x-4');
      }, 50);
    });
  }



  // Redirect chain trail display
  const redirectsCard = document.getElementById('redirects-card');
  const redirectsList = document.getElementById('redirects-list');
  redirectsList.innerHTML = '';

  if (caseFile.redirectChain && caseFile.redirectChain.length > 0) {
    redirectsCard.classList.remove('hidden');
    caseFile.redirectChain.forEach((url, i) => {
      const isTarget = (i === caseFile.redirectChain.length - 1);
      const div = document.createElement('div');

      if (isTarget) {
        div.className = 'bg-error text-on-primary border border-outline-variant px-4 py-2 font-data-mono text-label-sm z-10 font-bold';
      } else {
        div.className = 'bg-paper-container paper-texture border border-outline-variant px-4 py-2 font-data-mono text-label-sm z-10';
      }

      let label = url;
      try {
        label = new URL(url).hostname || url;
      } catch (e) { }

      div.textContent = `${i === 0 ? 'START: ' : '→ '} ${label}`;
      redirectsList.appendChild(div);
    });
  } else {
    redirectsCard.classList.add('hidden');
  }

  // Trigger advanced forensic visualizations
  try {
    renderConnectionMap(caseFile);
  } catch (err) {
    console.error('Failed connection map render:', err);
  }

  try {
    renderDependencyAudit(caseFile);
  } catch (err) {
    console.error('Failed dependency audit render:', err);
  }

  try {
    const prevCaseFile = serverCases.find(sc => sc.id !== caseFile.id && sc.url === caseFile.url && sc.screenshot);
    const prevUrl = prevCaseFile ? `data:image/png;base64,${prevCaseFile.screenshot}` : null;
    const currentUrl = caseFile.screenshot ? `data:image/png;base64,${caseFile.screenshot}` : null;

    const sliderContainer = document.getElementById('image-diff-slider');
    const mainImg = document.getElementById('screenshot-img');

    if (prevUrl && currentUrl && caseFile.visualDiffDetected) {
      mainImg.classList.add('hidden');
      sliderContainer.classList.remove('hidden');
      initImageDiffSlider(currentUrl, prevUrl);
    } else {
      sliderContainer.classList.add('hidden');
      if (caseFile.screenshot) {
        mainImg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Failed image diff slider init:', err);
  }

  // 3D paper hover tilt effect
  exhibitFrame.onmousemove = (e) => {
    const rect = exhibitFrame.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    exhibitFrame.style.transform = `rotate(${2 + x * 4}deg) translate(${x * 8}px, ${y * 8}px)`;
  };

  exhibitFrame.onmouseleave = () => {
    exhibitFrame.style.transform = 'rotate(2deg) translate(0px, 0px)';
  };
}

// Render Evidence Bin (Archive) Grid
function renderArchiveGrid() {
  const grid = document.getElementById('archive-grid');
  const emptyState = document.getElementById('archive-empty-state');
  grid.innerHTML = '';

  if (serverCases.length === 0) {
    emptyState.classList.remove('hidden');
    grid.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.classList.remove('hidden');

  serverCases.forEach((c) => {
    const entry = document.createElement('div');
    entry.className = 'relative group cursor-pointer';

    let verdictColor = 'text-error border-error';
    if (c.score >= 80) verdictColor = 'text-primary border-outline-variant';
    else if (c.score >= 50) verdictColor = 'text-verdict-caution border-secondary';

    const displayDomain = c.url.replace('https://', '').replace('http://', '').split('/')[0];

    // Star watch tab indicators and alert notifications
    const watchIconHtml = c.watched ? `<span class="material-symbols-outlined text-[15px] text-yellow-500 ml-2" title="Watched Domain">star</span>` : '';
    const alertBorderClass = c.alert ? 'border-2 border-red-500 animate-pulse shadow-[0px_0px_10px_rgba(239,68,68,0.5)]' : 'border-outline-variant';
    const feedbackWarningHtml = c.userFeedback === 'inaccurate' ? `<span class="bg-error text-on-primary text-[8px] font-data-mono px-1.5 py-0.5 rounded uppercase font-bold ml-2 animate-pulse" title="Flagged Inaccurate">AUDIT</span>` : '';

    entry.innerHTML = `
      <!-- Manila Folder Tab -->
      <div class="folder-tab bg-secondary-container w-48 h-10 border-t border-l border-r border-outline-variant flex items-center px-4 font-data-mono text-[11px] font-bold text-ink">
        CASE_ID: #${c.id.substring(0, 8)} ${watchIconHtml} ${feedbackWarningHtml}
      </div>
      <!-- The Page Surface -->
      <div class="paper-stack relative bg-paper-container-lowest border ${alertBorderClass} p-folder-padding shadow-[4px_4px_0px_0px_rgba(0,0,0,0.4)] transition-transform duration-300 group-hover:-translate-y-1 min-h-[300px] flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start mb-6">
            <div class="space-y-1 flex-grow truncate">
              <p class="font-data-mono text-label-sm text-on-surface-variant">TIMESTAMP: ${c.timestamp.split(' // ')[0]}</p>
              <p class="font-data-mono text-label-sm text-primary font-bold break-all">TARGET: ${displayDomain}</p>
            </div>
            <div class="verdict-stamp ${verdictColor} text-[16px] px-3 py-1 opacity-90 scale-90 flex-shrink-0">
              ${c.score >= 80 ? 'CLEARED' : (c.score >= 50 ? 'CAUTION' : 'FLAGGED')}
            </div>
          </div>
          <div class="border-t border-outline-variant pt-4 mb-6">
            <h3 class="font-display-lg text-primary mb-2 truncate">${c.url}</h3>
            <p class="font-body-md text-ink-variant line-clamp-3">
              ${c.notes}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 justify-between items-center mt-4">
          <span class="font-data-mono text-label-sm bg-primary-fixed text-primary px-2 py-0.5">SCORE: ${c.score}/100</span>
          <div class="flex items-center gap-2 mr-28">
            <button class="font-data-mono text-xs border border-outline-variant px-2.5 py-1 bg-paper hover:bg-secondary-container transition-all flex items-center gap-1 view-registry-btn font-bold" title="View WHOIS / RDAP Registry Record for this case">
              <span class="material-symbols-outlined text-[14px]">description</span>
              <span>REGISTRY</span>
            </button>
            <button class="font-data-mono text-xs border border-primary bg-primary text-white px-2.5 py-1 hover:bg-primary/90 transition-all flex items-center gap-1 view-report-btn font-bold" title="View Full Case Report">
              <span>REPORT</span>
              <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>
        
        <!-- Pinned attachment thumbnail preview -->
        ${c.screenshot ? `
          <div class="absolute -right-4 -bottom-4 w-28 h-28 border border-outline-variant bg-paper p-1 rotate-6 shadow-lg z-10 hidden sm:block">
            <div class="w-full h-full relative">
              <img class="w-full h-full object-cover grayscale-[0.2]" src="data:image/png;base64,${c.screenshot}"/>
              <!-- Taped cross on top-left corner -->
              <div class="absolute top-0 left-0 w-8 h-3 bg-white/60 backdrop-blur-[1px] border border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.1)] rotate-[-45deg] translate-x-[-10px] translate-y-[-4px] z-20"></div>
              <div class="absolute top-0 left-0 w-8 h-3 bg-white/60 backdrop-blur-[1px] border border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.1)] rotate-[45deg] translate-x-[-10px] translate-y-[-4px] z-30"></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    entry.querySelector('.view-registry-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      currentCase = c;
      switchTab('nav-registry');
    });

    entry.querySelector('.view-report-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openCaseReport(c);
    });
    entry.addEventListener('click', () => {
      openCaseReport(c);
    });

    grid.appendChild(entry);
  });
}

function openCaseReport(c) {
  currentCase = c;

  // Clear monitor alert if user reviews the case
  if (c.alert) {
    c.alert = false;
    fetch(`/api/cases/${c.id}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watched: c.watched === true }) // implicitly clears alert in store updates
    });

    // Silently update local store representation
    const localIdx = serverCases.findIndex(sc => sc.id === c.id);
    if (localIdx !== -1) {
      serverCases[localIdx].alert = false;
    }
  }

  displayCaseReport(c);
  switchTab('nav-dashboard');
}

let isRefreshingRegistry = false;

async function refreshRegistryRecordForCase(caseFile) {
  if (!caseFile || isRefreshingRegistry) return;
  isRefreshingRegistry = true;

  const btn = document.getElementById('registry-refresh-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin">sync</span><span>SWEEPING...</span>`;
  }

  try {
    const res = await fetch(`/api/cases/${caseFile.id}/registry-refresh`);
    const data = await res.json();
    if (data.success && data.registryRecord) {
      caseFile.registryRecord = data.registryRecord;
      const idx = serverCases.findIndex(sc => sc.id === caseFile.id);
      if (idx !== -1) {
        serverCases[idx].registryRecord = data.registryRecord;
      }
    }
  } catch (err) {
    console.error('Failed to refresh registry record:', err);
  } finally {
    isRefreshingRegistry = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">refresh</span><span>RE-SWEEP LIVE</span>`;
    }
    renderRegistryRecord();
  }
}

// Render Printed Official Public Registry Lookup Record Sheet
function renderRegistryRecord() {
  const emptyState = document.getElementById('registry-empty-state');
  const content = document.getElementById('registry-record-content');

  const activeCaseFile = currentCase || serverCases[0];

  // Populate active case selector dropdown in Registry Record view
  const caseSelect = document.getElementById('registry-case-select');
  if (caseSelect && serverCases.length > 0) {
    caseSelect.innerHTML = serverCases.map(sc => {
      const isSel = (activeCaseFile && sc.id === activeCaseFile.id) ? 'selected' : '';
      const domain = sc.url.replace('https://', '').replace('http://', '').split('/')[0];
      return `<option value="${sc.id}" ${isSel}>CASE #${sc.id.substring(0, 8)} (${domain})</option>`;
    }).join('');

    caseSelect.onchange = (e) => {
      const selectedId = e.target.value;
      const found = serverCases.find(sc => sc.id === selectedId);
      if (found) {
        currentCase = found;
        renderRegistryRecord();
      }
    };
  }

  if (!activeCaseFile || !activeCaseFile.registryRecord) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  const record = activeCaseFile.registryRecord;
  const regCheck = record.registration || {};
  const dnsCheck = record.dns || {};

  // Auto-trigger live registry sweep if current record has missing registration/WHOIS/cert data
  if (activeCaseFile && !isRefreshingRegistry && (!regCheck.createdDate || !regCheck.registrar || !record.certificate || ((!dnsCheck.mx || dnsCheck.mx.length === 0) && (!dnsCheck.ns || dnsCheck.ns.length === 0)))) {
    refreshRegistryRecordForCase(activeCaseFile);
  }

  document.getElementById('registry-case-id').textContent = activeCaseFile.id.substring(0, 8);
  document.getElementById('registry-fetched-at').textContent = `fetchedAt: ${record.fetchedAt ? record.fetchedAt.replace('T', ' // ').substring(0, 21) : activeCaseFile.timestamp}`;

  function formatDotRow(label, value) {
    const displayVal = value || '(unavailable)';
    return `
      <div class="flex items-baseline justify-between font-data-mono text-xs my-2.5 pb-1 border-b border-dashed border-gray-200/80 gap-2 min-w-0">
        <span class="text-gray-500 uppercase font-bold shrink-0 tracking-wider">${label}</span>
        <span class="flex-grow border-b border-dotted border-gray-400/60 mx-2 self-center shrink min-w-[16px]"></span>
        <span class="font-bold text-ink text-right break-all shrink max-w-[55%] min-w-0 leading-relaxed">${displayVal}</span>
      </div>
    `;
  }

  function formatDateWithDays(dateStr, isExpiry = false) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const isoDate = d.toISOString().substring(0, 10);
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (isExpiry) {
      const remainingDays = Math.abs(diffDays);
      return diffDays < 0 ? `${isoDate} (in ${remainingDays.toLocaleString()} days)` : `${isoDate} (expired ${diffDays.toLocaleString()} days ago)`;
    } else {
      return `${isoDate} (${Math.abs(diffDays).toLocaleString()} days ago)`;
    }
  }

  // 1. Registration
  const reg = record.registration || {};
  const createdStr = formatDateWithDays(reg.createdDate, false);
  const expiryStr = formatDateWithDays(reg.expiryDate, true);
  const statusStr = reg.statusCodes && reg.statusCodes.length > 0
    ? reg.statusCodes.map(s => typeof s === 'string' ? s.replace(/([A-Z])/g, ' $1').toLowerCase().trim() : s).join(', ')
    : null;

  let registrationHtml = `
    <div>
      <h3 class="font-bold border-b border-black pb-1 mb-3 text-xs text-gray-800 uppercase tracking-wide">REGISTRATION</h3>
      ${formatDotRow('Registrar', reg.registrar)}
      ${formatDotRow('Created', createdStr)}
      ${formatDotRow('Expires', expiryStr)}
      ${formatDotRow('Status', statusStr)}
      ${formatDotRow('Registrant Org', reg.registrantOrg)}
      ${formatDotRow('Registrant Country', reg.registrantCountry)}
    </div>
  `;

  // 2. DNS Records
  const dns = record.dns || { a: [], mx: [], ns: [], txt: [] };
  const aStr = dns.a && dns.a.length > 0 ? dns.a.join(', ') : null;
  const mxStr = dns.mx && dns.mx.length > 0 ? dns.mx.join(', ') : null;
  const nsStr = dns.ns && dns.ns.length > 0 ? dns.ns.join(', ') : null;
  const txtStr = dns.txt && dns.txt.length > 0 ? dns.txt.join(', ') : null;

  let dnsHtml = `
    <div class="mt-6">
      <h3 class="font-bold border-b border-black pb-1 mb-3 text-xs text-gray-800 uppercase tracking-wide">DNS RECORDS</h3>
      ${formatDotRow('A', aStr)}
      ${formatDotRow('MX', mxStr)}
      ${formatDotRow('NS', nsStr)}
      ${formatDotRow('TXT', txtStr)}
    </div>
  `;

  // 3. Network Geolocation
  const ip = record.ip || {};
  const locationStr = ip.ip && (ip.city || ip.region || ip.country)
    ? [ip.city, ip.region, ip.country].filter(Boolean).join(', ')
    : null;

  let networkHtml = `
    <div class="mt-6">
      <h3 class="font-bold border-b border-black pb-1 mb-3 text-xs text-gray-800 uppercase tracking-wide">NETWORK GEOLOCATION</h3>
      ${formatDotRow('IP Address', ip.ip)}
      ${formatDotRow('Hosting Org', ip.org)}
      ${formatDotRow('ISP Operator', ip.isp)}
      ${formatDotRow('ASN', ip.asn)}
      ${formatDotRow('Location', locationStr)}
    </div>
  `;

  // 4. SSL Certificate History
  const cert = record.certificate || null;
  const certIssuer = cert ? (cert.issuer || 'Unknown Certificate Authority') : 'HTTP Only (No SSL Certificate on Port 443)';
  const certIssuedStr = cert ? formatDateWithDays(cert.issuedAt || cert.notBefore, false) : '(none detected)';
  const certExpiryStr = cert ? formatDateWithDays(cert.notAfter, true) : '(none detected)';
  const certCountStr = cert ? (cert.totalCertsFound !== undefined ? cert.totalCertsFound.toLocaleString() : '1') : '0';

  let certHtml = `
    <div class="mt-6">
      <h3 class="font-bold border-b border-black pb-1 mb-3 text-xs text-gray-800 uppercase tracking-wide">SSL CERTIFICATE</h3>
      ${formatDotRow('Issuer', certIssuer)}
      ${formatDotRow('Issued', certIssuedStr)}
      ${formatDotRow('Valid Until', certExpiryStr)}
      ${formatDotRow('Certificates on Record', certCountStr)}
    </div>
  `;

  // 5. Redirect chain pathway listing
  const chain = activeCaseFile.redirectChain || [activeCaseFile.url];
  const redirectsListHtml = chain.map((url, i) => {
    let hostname = url;
    try { hostname = new URL(url).hostname || url; } catch (e) { }
    return `[Hop #${i + 1}] ${hostname}`;
  }).join(' → ');

  let redirectHtml = `
    <div class="bg-surface-variant border border-outline-variant p-4 rounded mt-6">
      <h3 class="font-bold text-xs text-gray-600 mb-2 uppercase tracking-wide">REDIRECT PATHWAY</h3>
      <div class="text-xs break-all leading-normal text-gray-700 font-data-mono">${redirectsListHtml}</div>
    </div>
  `;

  content.innerHTML = registrationHtml + dnsHtml + networkHtml + certHtml + redirectHtml;
}

// App Initialization
window.addEventListener('DOMContentLoaded', async () => {
  // Always enforce light mode — remove any stale dark mode pref from localStorage
  localStorage.removeItem('sentinel_dark_mode');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');

  initTabs();
  initSettings();

  // Load past cases from server
  await fetchCasesFromServer();

  // Always compute stats and list intake logs
  updateDashboardStats();

  // Start with morning briefing by default
  currentCase = null;
  document.getElementById('reportView').classList.add('hidden');
  document.getElementById('scanner-placeholder').classList.remove('hidden');
});

function updateDashboardStats() {
  // 1. Total Open Cases
  const openCasesCount = serverCases.length;
  document.getElementById('stats-open-cases').textContent = openCasesCount;

  // 2. Flagged Today
  // Count cases created today (local date matches current local date) with score < 50
  const todayStr = new Date().toDateString(); // e.g. "Mon Jul 06 2026"
  const flaggedToday = serverCases.filter(c => {
    if (!c.createdAt) return false;
    const caseDateStr = new Date(c.createdAt).toDateString();
    return caseDateStr === todayStr && c.score < 50;
  }).length;
  document.getElementById('stats-flagged-today').textContent = String(flaggedToday).padStart(2, '0');

  // 3. Average Score
  let avgScore = 0;
  if (serverCases.length > 0) {
    const totalScore = serverCases.reduce((sum, c) => sum + (c.score || 0), 0);
    avgScore = Math.round(totalScore / serverCases.length);
  }
  document.getElementById('stats-avg-score').textContent = avgScore;

  // 4. Verdict Tally (Malicious: < 50, Suspicious: 50-79, Benign: >= 80)
  let maliciousCount = 0;
  let suspiciousCount = 0;
  let benignCount = 0;

  serverCases.forEach(c => {
    const score = c.score || 0;
    if (score < 50) maliciousCount++;
    else if (score < 80) suspiciousCount++;
    else benignCount++;
  });

  const totalTally = serverCases.length || 1;
  const malPct = Math.round((maliciousCount / totalTally) * 100);
  const susPct = Math.round((suspiciousCount / totalTally) * 100);
  const benPct = Math.round((benignCount / totalTally) * 100);

  // Update percentages
  document.getElementById('tally-malicious-pct').textContent = `${malPct}%`;
  document.getElementById('tally-suspicious-pct').textContent = `${susPct}%`;
  document.getElementById('tally-benign-pct').textContent = `${benPct}%`;

  // Update progress bars
  document.getElementById('tally-malicious-bar').style.width = `${malPct}%`;
  document.getElementById('tally-suspicious-bar').style.width = `${susPct}%`;
  document.getElementById('tally-benign-bar').style.width = `${benPct}%`;

  // Update Briefing risk summary
  const summaryEl = document.getElementById('briefing-risk-summary');
  if (serverCases.length === 0) {
    summaryEl.textContent = "No scan history compiled yet. Initiate a scan to visualize risk distributions.";
  } else {
    summaryEl.textContent = `Intake analysis concludes: ${malPct}% of audited cases are flagged as high risk (MALICIOUS). Suspicious domains comprise ${susPct}%, with benign entities covering the remaining ${benPct}%.`;
  }

  // Update current session timestamp header
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} HRS // ENCRYPTED SESSION`;
  document.getElementById('briefing-time-display').textContent = timeStr;

  // Update log reference
  const logRefStr = `REF: LOG-${now.getFullYear()}-${now.toLocaleString('default', { month: 'short' }).toUpperCase()}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('briefing-log-ref').textContent = logRefStr;

  // Render the intake log items
  renderIntakeLog();
}

function renderIntakeLog() {
  const container = document.getElementById('intake-log-list');
  container.innerHTML = '';

  const recent = serverCases.slice(0, 6);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="h-12 flex items-center justify-center font-data-mono text-on-surface-variant text-xs italic">
        [NO ENTRIES IN CURRENT LEDGER]
      </div>
    `;
    return;
  }

  recent.forEach(c => {
    const dateObj = c.createdAt ? new Date(c.createdAt) : new Date();
    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

    // Determine priority badge and coloring
    let badgeText = 'BENIGN';
    let badgeClass = 'text-verdict-green border-verdict-green';
    if (c.score < 50) {
      badgeText = 'FLAGGED';
      badgeClass = 'text-verdict-red border-error';
    } else if (c.score < 80) {
      badgeText = 'SUSPICIOUS';
      badgeClass = 'text-verdict-amber border-verdict-amber';
    }

    const row = document.createElement('div');
    row.className = 'h-11 flex items-center justify-between px-2 group hover:bg-paper-container/40 transition-colors duration-150 border-t border-outline-variant/30';

    row.innerHTML = `
      <div class="flex items-center gap-6">
        <span class="font-data-mono text-label-sm text-on-surface-variant opacity-60">${timeStr}</span>
        <span class="font-data-mono text-data-mono font-bold text-ink truncate max-w-[200px] sm:max-w-xs md:max-w-md cursor-pointer hover:underline text-left block" title="${c.url}">${c.url}</span>
      </div>
      <div class="flex items-center gap-4">
        <span class="font-data-mono text-[10px] border px-2 py-0.5 tracking-wider ${badgeClass}">${badgeText}</span>
        <button class="material-symbols-outlined text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95 duration-100 view-case-link" data-id="${c.id}" title="Inspect Case File">
          open_in_new
        </button>
      </div>
    `;

    // Click triggers
    const loadReport = () => {
      currentCase = c;
      displayCaseReport(c);
      document.getElementById('scanner-placeholder').classList.add('hidden');
      document.getElementById('reportView').classList.remove('hidden');
      switchTab('nav-dashboard');
    };

    row.querySelector('.font-bold').addEventListener('click', loadReport);
    row.querySelector('.view-case-link').addEventListener('click', loadReport);

    container.appendChild(row);
  });
}

// ----------------------------------------------------
// ADVANCED FORENSIC VISUALIZATION HELPERS
// ----------------------------------------------------

function renderConnectionMap(caseFile) {
  const container = document.getElementById('connection-map');
  const section = document.getElementById('connection-map-section');
  if (!container || !section) return;

  if (!caseFile.connectionTrail || caseFile.connectionTrail.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = '';

  const trail = caseFile.connectionTrail;
  const nodeWidth = 160;
  const nodeHeight = 80;
  const gap = 60;
  const totalWidth = trail.length * nodeWidth + (trail.length - 1) * gap + 40;

  container.style.justifyContent = 'flex-start';
  container.style.position = 'relative';
  container.style.minHeight = '140px';
  container.style.overflowX = 'auto';

  const wrapper = document.createElement('div');
  wrapper.className = 'relative flex items-center py-6';
  wrapper.style.width = `${totalWidth}px`;
  wrapper.style.height = '120px';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'absolute inset-0 pointer-events-none');
  svg.setAttribute('width', String(totalWidth));
  svg.setAttribute('height', '120');

  for (let i = 0; i < trail.length - 1; i++) {
    const startX = 20 + i * (nodeWidth + gap) + nodeWidth;
    const endX = startX + gap;
    const y = 60;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(startX));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(endX));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#ba1a1a');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(line);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const midX = startX + gap / 2;
    arrow.setAttribute('points', `${midX - 4},${y - 4} ${midX + 4},${y} ${midX - 4},${y + 4}`);
    arrow.setAttribute('fill', '#ba1a1a');
    svg.appendChild(arrow);
  }
  wrapper.appendChild(svg);

  trail.forEach((node, i) => {
    const x = 20 + i * (nodeWidth + gap);
    const y = 60 - nodeHeight / 2;

    const div = document.createElement('div');
    div.className = 'absolute bg-paper border border-outline-variant shadow-sm rounded p-3 flex flex-col justify-center items-center text-center select-none hover:border-primary transition-all duration-200';
    div.style.width = `${nodeWidth}px`;
    div.style.height = `${nodeHeight}px`;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;

    let badgeClass = 'bg-gray-100 text-gray-700';
    if (node.type === 'redirect') badgeClass = 'bg-blue-100 text-blue-800';
    if (node.type === 'ip') badgeClass = 'bg-yellow-100 text-yellow-800';
    if (node.type === 'geo') badgeClass = 'bg-green-100 text-green-800';

    div.innerHTML = `
      <span class="font-data-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeClass} mb-1.5">${node.type}</span>
      <span class="font-data-mono text-[10px] font-bold text-ink truncate w-full" title="${node.label}">${node.label}</span>
    `;

    wrapper.appendChild(div);
  });

  container.appendChild(wrapper);
}

let currentDependencyFilter = 'all';

function renderDependencyAudit(caseFile) {
  const tableBody = document.getElementById('dependency-audit-table');
  const section = document.getElementById('dependency-audit-section');
  if (!tableBody || !section) return;

  if (!caseFile.dependencies) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  const filters = document.getElementById('dependency-filter-container');
  if (filters && !filters.dataset.bound) {
    filters.dataset.bound = 'true';
    filters.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        filters.querySelectorAll('button').forEach(b => {
          b.className = 'font-data-mono text-[10px] px-2.5 py-1 border border-outline-variant bg-paper rounded transition-all active:scale-95';
        });
        e.target.className = 'font-data-mono text-[10px] px-2.5 py-1 border border-primary bg-primary text-on-primary rounded transition-all active:scale-95';

        currentDependencyFilter = e.target.dataset.filter;
        renderDependencyAudit(currentCase);
      });
    });
  }

  tableBody.innerHTML = '';

  const deps = caseFile.dependencies;
  let items = [];

  if (currentDependencyFilter === 'all' || currentDependencyFilter === 'scripts') {
    items = items.concat((deps.scripts || []).map(i => ({ ...i, type: 'script' })));
  }
  if (currentDependencyFilter === 'all' || currentDependencyFilter === 'stylesheets') {
    items = items.concat((deps.stylesheets || []).map(i => ({ ...i, type: 'stylesheet' })));
  }
  if (currentDependencyFilter === 'all' || currentDependencyFilter === 'iframes') {
    items = items.concat((deps.iframes || []).map(i => ({ ...i, type: 'iframe' })));
  }

  if (items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-4 text-center font-data-mono text-xs text-gray-400 italic">No resources found for current filter.</td>
      </tr>
    `;
    return;
  }

  items.forEach(item => {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-100 hover:bg-paper-container/30 transition-colors duration-150';

    let catBadge = 'bg-gray-100 text-gray-700';
    if (item.category === 'common') catBadge = 'bg-green-100 text-green-700 border border-green-300';
    if (item.category === 'internal') catBadge = 'bg-gray-100 text-gray-700 border border-gray-300';
    if (item.category === 'external') catBadge = 'bg-amber-100 text-amber-700 border border-amber-300';

    let flagsHtml = '';
    if (item.mixedContent) {
      flagsHtml += `<span class="bg-error text-on-primary text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide">MIXED CONTENT</span>`;
    } else {
      flagsHtml += `<span class="text-gray-400 italic text-[10px]">-</span>`;
    }

    row.innerHTML = `
      <td class="py-3 px-4 font-bold text-ink max-w-xs truncate" title="${item.url}">${item.url}</td>
      <td class="py-3 px-4 text-gray-600">${item.domain}</td>
      <td class="py-3 px-4">
        <span class="text-[9px] uppercase font-bold px-2 py-0.5 rounded ${catBadge}">${item.category}</span>
        <span class="text-[9px] text-gray-400 font-normal ml-2">${item.type}</span>
      </td>
      <td class="py-3 px-4">${flagsHtml}</td>
    `;
    tableBody.appendChild(row);
  });
}

let isDraggingSlider = false;

function initImageDiffSlider(currentScreenshotUrl, previousScreenshotUrl) {
  const slider = document.getElementById('image-diff-slider');
  const handle = document.getElementById('diff-slider-handle');
  const afterWrapper = document.getElementById('diff-img-after-wrapper');
  const imgBefore = document.getElementById('diff-img-before');
  const imgAfter = document.getElementById('diff-img-after');

  if (!slider || !handle || !afterWrapper || !imgBefore || !imgAfter) return;

  imgBefore.src = previousScreenshotUrl;
  imgAfter.src = currentScreenshotUrl;

  const onDrag = (clientX) => {
    const rect = slider.getBoundingClientRect();
    let x = clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;
    const pct = (x / rect.width) * 100;

    afterWrapper.style.width = `${pct}%`;
    handle.style.left = `${pct}%`;
  };

  const startDrag = () => {
    isDraggingSlider = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  };

  const onMouseMove = (e) => {
    if (!isDraggingSlider) return;
    onDrag(e.clientX);
  };

  const onTouchMove = (e) => {
    if (!isDraggingSlider) return;
    if (e.touches && e.touches[0]) {
      onDrag(e.touches[0].clientX);
    }
  };

  const onMouseUp = () => {
    isDraggingSlider = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  const onTouchEnd = () => {
    isDraggingSlider = false;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  };

  handle.addEventListener('mousedown', startDrag);
  handle.addEventListener('touchstart', startDrag);
}

// ----------------------------------------------------
// INTERNET MAPPER TAB GRAPH RENDERING (D3 FORCE-DIRECTED)
// ----------------------------------------------------

function renderInternetMap() {
  const emptyState = document.getElementById('mapper-empty-state');
  const recordContent = document.getElementById('mapper-record-content');
  const caseSelect = document.getElementById('mapper-case-select');
  if (!emptyState || !recordContent || !caseSelect) return;

  const activeCaseFile = currentCase || serverCases[0];

  // Populate active case selector dropdown
  if (caseSelect && serverCases.length > 0) {
    caseSelect.innerHTML = serverCases.map(sc => {
      const isSel = (activeCaseFile && sc.id === activeCaseFile.id) ? 'selected' : '';
      const domain = sc.url.replace('https://', '').replace('http://', '').split('/')[0];
      return `<option value="${sc.id}" ${isSel}>CASE #${sc.id.substring(0, 8)} (${domain})</option>`;
    }).join('');

    if (!caseSelect.dataset.bound) {
      caseSelect.dataset.bound = 'true';
      caseSelect.onchange = (e) => {
        const selectedId = e.target.value;
        const found = serverCases.find(sc => sc.id === selectedId);
        if (found) {
          currentCase = found;
          renderInternetMap();
        }
      };
    }
  }

  if (!activeCaseFile) {
    emptyState.classList.remove('hidden');
    recordContent.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  recordContent.classList.remove('hidden');

  try {
    drawMapGraph(activeCaseFile);
  } catch (err) {
    console.error('Failed to draw map graph:', err);
  }
}

function drawMapGraph(caseFile) {
  const canvas = document.getElementById('mapper-canvas');
  if (!canvas) return;

  canvas.innerHTML = '';

  const width = canvas.clientWidth || 550;
  const height = canvas.clientHeight || 550;

  const hostname = caseFile.url.replace('https://', '').replace('http://', '').split('/')[0];

  const nodes = [];
  const links = [];

  try {
    // 1. Target Root Domain node
    nodes.push({ id: hostname, type: 'domain', label: hostname });

    // 2. Subdomains & IPs
    const uniqueIps = new Set();

    // Add main host IP if present
    if (caseFile.registryRecord && caseFile.registryRecord.ip && caseFile.registryRecord.ip.ip) {
      const mainIp = caseFile.registryRecord.ip.ip;
      uniqueIps.add(mainIp);
      links.push({ source: hostname, target: mainIp });
    }

    if (caseFile.resolvedSubdomains) {
      const subdomainsToRender = caseFile.resolvedSubdomains.slice(0, 25);
      subdomainsToRender.forEach(sub => {
        const fullSub = `${sub.subdomain}.${hostname}`;
        if (sub.resolved) {
          nodes.push({ id: fullSub, type: 'subdomain', label: fullSub });
          links.push({ source: hostname, target: fullSub });

          if (sub.ip) {
            uniqueIps.add(sub.ip);
            links.push({ source: fullSub, target: sub.ip });
          }
        }
      });
    }

    // Add unique IPs to nodes list
    uniqueIps.forEach(ip => {
      nodes.push({ id: ip, type: 'ip', label: ip });
    });

    // 3. Technologies (unique dependency domains)
    if (caseFile.dependencies) {
      const uniqueTech = new Set();
      ['scripts', 'stylesheets', 'iframes'].forEach(key => {
        (caseFile.dependencies[key] || []).forEach(dep => {
          if (dep.domain && dep.domain !== hostname) {
            uniqueTech.add(dep.domain);
          }
        });
      });
      uniqueTech.forEach(tech => {
        nodes.push({ id: tech, type: 'technology', label: tech });
        links.push({ source: hostname, target: tech });
      });
    }

    // 4. Risks & Vulnerabilities
    if (caseFile.threatFeedsMatched) {
      caseFile.threatFeedsMatched.forEach(feed => {
        const flagId = `risk-feed-${feed}`;
        nodes.push({ id: flagId, type: 'risk', label: `Listed: ${feed}` });
        links.push({ source: hostname, target: flagId });
      });
    }

    if (caseFile.brandAnnotations) {
      caseFile.brandAnnotations.forEach((ann, idx) => {
        const flagId = `risk-brand-${idx}`;
        nodes.push({ id: flagId, type: 'risk', label: ann.reason || 'Brand Mismatch' });
        links.push({ source: hostname, target: flagId });
      });
    }

    let hasMixed = false;
    if (caseFile.dependencies) {
      ['scripts', 'stylesheets', 'iframes'].forEach(key => {
        if ((caseFile.dependencies[key] || []).some(dep => dep.mixedContent)) {
          hasMixed = true;
        }
      });
    }
    if (hasMixed) {
      const flagId = 'risk-mixed';
      nodes.push({ id: flagId, type: 'risk', label: 'Mixed Content Warning' });
      links.push({ source: hostname, target: flagId });
    }

  } catch (err) {
    console.error('[drawMapGraph] Node/Link compilation failed:', err);
  }

  // If only root node or empty, render fallback static node
  if (nodes.length <= 1) {
    const svg = d3.select(canvas)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'select-none w-full h-full');

    const nodeG = svg.append('g')
      .attr('class', 'mapper-node-svg cursor-pointer')
      .attr('data-id', hostname)
      .attr('data-type', 'domain');

    nodeG.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', 14)
      .attr('fill', '#09151e')
      .attr('stroke', '#f0edee')
      .attr('stroke-width', 2);

    nodeG.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2 - 20)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'IBM Plex Mono, monospace')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.04em')
      .attr('fill', '#1b1c1c')
      .attr('class', 'select-none pointer-events-none')
      .text(hostname);

    setupDelegatedListener(canvas, caseFile);
    showNodeDetails('domain', hostname, caseFile);
    return;
  }

  // ── SSL node: add if domain has valid SSL ─────────────────────────────────
  try {
    if (caseFile.sslInfo && caseFile.sslInfo.issuer) {
      const sslId = 'ssl-cert';
      nodes.push({ id: sslId, type: 'ssl', label: caseFile.sslInfo.issuer });
      links.push({ source: hostname, target: sslId });
    }
  } catch (_) { }

  // Create D3 SVG viewport
  const svg = d3.select(canvas)
    .append('svg')
    .attr('width', width).attr('height', height)
    .attr('class', 'select-none w-full h-full')
    .style('background', 'transparent');

  // ── Color palette ─────────────────────────────────────────────────────────
  const C = {
    sub: '#ba1a1a', ip: '#c4a040', tech: '#8a7040',
    risk: '#ba1a1a', ssl: '#386a20',
    white: '#ffffff', outline: 'rgba(255,255,255,0.14)',
  };

  // ── SVG Defs ───────────────────────────────────────────────────────────────
  const defs = svg.append('defs');

  // Radial red glow gradient for domain hub
  const hubGrad = defs.append('radialGradient').attr('id', 'hub-glow')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
  hubGrad.append('stop').attr('offset', '0%').attr('stop-color', '#ba1a1a').attr('stop-opacity', 0.55);
  hubGrad.append('stop').attr('offset', '45%').attr('stop-color', '#ba1a1a').attr('stop-opacity', 0.15);
  hubGrad.append('stop').attr('offset', '100%').attr('stop-color', '#ba1a1a').attr('stop-opacity', 0);

  // Drop shadow
  defs.append('filter').attr('id', 'node-shadow')
    .attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%')
    .call(f => f.append('feDropShadow').attr('dx', 0).attr('dy', 2)
      .attr('stdDeviation', 4).attr('flood-color', 'rgba(0,0,0,0.65)'));

  // Red glow filter
  defs.append('filter').attr('id', 'red-glow')
    .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%')
    .call(f => {
      f.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    });

  // Green glow filter
  defs.append('filter').attr('id', 'green-glow')
    .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%')
    .call(f => {
      f.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    });

  // ── Star particles ─────────────────────────────────────────────────────────
  const starG = svg.append('g').attr('pointer-events', 'none');
  let _s = 42;
  const _r = () => { _s = (_s * 1664525 + 1013904223) & 0xffffffff; return (_s >>> 0) / 4294967296; };
  for (let i = 0; i < 130; i++) {
    starG.append('circle')
      .attr('cx', _r() * width).attr('cy', _r() * height)
      .attr('r', _r() * 1.1 + 0.2).attr('fill', 'white').attr('opacity', _r() * 0.3 + 0.06);
  }

  // ── Zoomable container ─────────────────────────────────────────────────────
  const zoomContainer = svg.append('g').attr('class', 'zoom-container');

  // ── Organic Force-Directed Network Layout ──────────────────────────────────
  const cx = width / 2, cy = height / 2;

  // Pin domain hub at center
  const rootNode = nodes.find(n => n.type === 'domain');
  if (rootNode) {
    rootNode.x = cx; rootNode.y = cy;
    rootNode.fx = cx; rootNode.fy = cy;
  }

  // Initialize non-domain nodes with organic spiral placement around center
  const nonRootNodes = nodes.filter(n => n.type !== 'domain');
  nonRootNodes.forEach((node, i) => {
    delete node.fx;
    delete node.fy;
    const angle = (i / nonRootNodes.length) * 2 * Math.PI + (Math.random() * 0.2 - 0.1);
    const r = (node.type === 'ip' || node.type === 'technology') ? 220 + Math.random() * 40 : 130 + Math.random() * 30;
    node.x = cx + r * Math.cos(angle);
    node.y = cy + r * Math.sin(angle);
  });

  // ── D3 Force Simulation (Organic cluster with intact roots) ────────────────
  const simulation = d3.forceSimulation(nodes)
    .alphaDecay(0.02)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
      // Child nodes (IPs attached to subdomains) sit close to their parent root
      if (d.target && d.target.type === 'ip') return 75;
      if (d.target && d.target.type === 'technology') return 90;
      if (d.target && d.target.type === 'subdomain') return 140;
      return 110;
    }).strength(0.6))
    .force('charge', d3.forceManyBody().strength(d => d.type === 'domain' ? -600 : -350))
    .force('x', d3.forceX(cx).strength(0.03))
    .force('y', d3.forceY(cy).strength(0.03))
    .force('collide', d3.forceCollide().radius(d => {
      if (d.type === 'domain') return 60;
      if (d.type === 'ip') return 34;
      return 30;
    }).iterations(3));

  // ── D3 Zoom ────────────────────────────────────────────────────────────────
  const zoom = d3.zoom().scaleExtent([0.1, 6])
    .on('zoom', ev => zoomContainer.attr('transform', ev.transform));
  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity.translate(width * 0.04, height * 0.04).scale(0.88));

  const btnIn = document.getElementById('mapper-zoom-in');
  const btnOut = document.getElementById('mapper-zoom-out');
  const btnReset = document.getElementById('mapper-zoom-reset');
  if (btnIn) btnIn.onclick = () => svg.transition().duration(220).call(zoom.scaleBy, 1.35);
  if (btnOut) btnOut.onclick = () => svg.transition().duration(220).call(zoom.scaleBy, 1 / 1.35);
  if (btnReset) btnReset.onclick = () => svg.transition().duration(320).call(zoom.transform,
    d3.zoomIdentity.translate(width * 0.04, height * 0.04).scale(0.88));

  // ── Edges ──────────────────────────────────────────────────────────────────
  const linkGroup = zoomContainer.append('g').attr('class', 'links');
  const linkLines = linkGroup.selectAll('line').data(links).join('line')
    .attr('stroke', d => {
      if (!d.target || !d.target.type) return 'rgba(255,255,255,0.14)';
      if (d.target.type === 'ip') return 'rgba(196,160,64,0.38)';
      if (d.target.type === 'ssl') return 'rgba(56,106,32,0.5)';
      if (d.target.type === 'risk') return 'rgba(186,26,26,0.4)';
      return 'rgba(255,255,255,0.18)';
    })
    .attr('stroke-width', 0.9)
    .attr('stroke-dasharray', d => {
      if (!d.target || !d.target.type) return null;
      if (d.target.type === 'ip') return '3 5';
      if (d.target.type === 'technology') return '2 6';
      return null;
    });

  // Edge midpoint tick marks
  const tickGroup = zoomContainer.append('g').attr('pointer-events', 'none');
  const tickLines = tickGroup.selectAll('line').data(links).join('line')
    .attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 1);

  // ── Node groups ────────────────────────────────────────────────────────────
  const node = zoomContainer.append('g').attr('class', 'nodes')
    .selectAll('g').data(nodes).join('g')
    .attr('class', 'mapper-node-svg cursor-pointer')
    .attr('data-id', d => d.id).attr('data-type', d => d.type);

  const shortLabel = d => { const l = d.label || d.id; return l.length > 30 ? l.slice(0, 28) + '…' : l; };

  // ── DOMAIN: glowing hub with orbit rings ───────────────────────────────────
  node.filter(d => d.type === 'domain').call(g => {
    g.append('circle').attr('r', 80).attr('fill', 'url(#hub-glow)').attr('opacity', 0.85).attr('pointer-events', 'none');
    [50, 72, 100].forEach((r, i) => {
      g.append('circle').attr('r', r).attr('fill', 'none')
        .attr('stroke', 'rgba(186,26,26,' + (0.2 - i * 0.05) + ')')
        .attr('stroke-width', 0.8)
        .attr('stroke-dasharray', i % 2 === 0 ? '4 4' : '2 6')
        .attr('pointer-events', 'none');
    });
    g.append('circle').attr('r', 33).attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.45)').attr('stroke-width', 1);
    g.append('circle').attr('r', 28).attr('fill', '#0e1c28')
      .attr('stroke', '#ba1a1a').attr('stroke-width', 2)
      .attr('filter', 'url(#red-glow)');
    g.append('circle').attr('r', 22).attr('fill', 'none')
      .attr('stroke', 'rgba(186,26,26,0.4)').attr('stroke-width', 1);
    g.append('text').attr('dy', 7).attr('text-anchor', 'middle')
      .attr('font-family', 'Barlow Condensed, sans-serif')
      .attr('font-size', '20px').attr('font-weight', '700').attr('fill', '#ffffff')
      .attr('class', 'select-none pointer-events-none')
      .text(d => (d.label || d.id)[0].toUpperCase());
  });

  // ── SUBDOMAIN: red square + monitor icon ───────────────────────────────────
  node.filter(d => d.type === 'subdomain').call(g => {
    g.append('rect').attr('x', -14).attr('y', -14).attr('width', 28).attr('height', 28)
      .attr('fill', 'none').attr('stroke', 'rgba(186,26,26,0.3)').attr('stroke-width', 1);
    g.append('rect').attr('x', -11).attr('y', -11).attr('width', 22).attr('height', 22)
      .attr('fill', C.sub).attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 1)
      .attr('filter', 'url(#red-glow)');
    // Monitor icon
    g.append('rect').attr('x', -5.5).attr('y', -5.5).attr('width', 11).attr('height', 8)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.75)').attr('stroke-width', 1);
    g.append('line').attr('x1', 0).attr('y1', 2.5).attr('x2', 0).attr('y2', 5.5)
      .attr('stroke', 'rgba(255,255,255,0.75)').attr('stroke-width', 1);
    g.append('line').attr('x1', -3).attr('y1', 5.5).attr('x2', 3).attr('y2', 5.5)
      .attr('stroke', 'rgba(255,255,255,0.75)').attr('stroke-width', 1);
  });

  // ── IP: gold diamond ───────────────────────────────────────────────────────
  node.filter(d => d.type === 'ip').call(g => {
    g.append('rect').attr('x', -11).attr('y', -11).attr('width', 22).attr('height', 22)
      .attr('fill', C.ip).attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 1)
      .attr('transform', 'rotate(45)').attr('filter', 'url(#node-shadow)');
  });

  // ── TECHNOLOGY: gear circle ─────────────────────────────────────────────────
  node.filter(d => d.type === 'technology').call(g => {
    g.append('circle').attr('r', 13).attr('fill', '#1e1a0e')
      .attr('stroke', C.ip).attr('stroke-width', 1.5).attr('filter', 'url(#node-shadow)');
    g.append('circle').attr('r', 6).attr('fill', 'none').attr('stroke', C.ip).attr('stroke-width', 1);
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      g.append('line')
        .attr('x1', Math.cos(angle) * 6).attr('y1', Math.sin(angle) * 6)
        .attr('x2', Math.cos(angle) * 9).attr('y2', Math.sin(angle) * 9)
        .attr('stroke', C.ip).attr('stroke-width', 2);
    }
    g.append('circle').attr('r', 2.5).attr('fill', C.ip);
  });

  // ── RISK: double ring + ! ──────────────────────────────────────────────────
  node.filter(d => d.type === 'risk').call(g => {
    g.append('circle').attr('r', 17).attr('fill', 'none')
      .attr('stroke', 'rgba(186,26,26,0.3)').attr('stroke-width', 1);
    g.append('circle').attr('r', 12).attr('fill', '#1a0505')
      .attr('stroke', C.risk).attr('stroke-width', 2).attr('filter', 'url(#red-glow)');
    g.append('text').attr('dy', 4).attr('text-anchor', 'middle')
      .attr('font-family', 'Barlow Condensed, sans-serif').attr('font-size', '13px')
      .attr('font-weight', '700').attr('fill', '#ffffff')
      .attr('class', 'select-none pointer-events-none').text('!');
  });

  // ── SSL SECURED: green lock ────────────────────────────────────────────────
  node.filter(d => d.type === 'ssl').call(g => {
    g.append('circle').attr('r', 13).attr('fill', '#061408')
      .attr('stroke', C.ssl).attr('stroke-width', 2).attr('filter', 'url(#green-glow)');
    g.append('path').attr('d', 'M -4 0 A 4 4 0 0 1 4 0').attr('fill', 'none')
      .attr('stroke', 'rgba(56,106,32,0.9)').attr('stroke-width', 1.5);
    g.append('rect').attr('x', -5.5).attr('y', 0).attr('width', 11).attr('height', 8)
      .attr('fill', 'none').attr('stroke', 'rgba(56,106,32,0.9)').attr('stroke-width', 1.5);
    g.append('circle').attr('cy', 4).attr('r', 1.5).attr('fill', 'rgba(56,106,32,0.9)');
  });

  // ── Labels ─────────────────────────────────────────────────────────────────
  const labelOffX = d => d.type === 'domain' ? 0 : (d.type === 'ip' ? 16 : 16);
  const labelOffY = d => d.type === 'domain' ? -42 : 4;
  const lAnchor = d => d.type === 'domain' ? 'middle' : 'start';
  const padX = 5, padY = 3;

  const labelBg = node.append('rect').attr('rx', 2)
    .attr('fill', 'rgba(8,14,20,0.82)').attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 0.5)
    .attr('class', 'select-none pointer-events-none');

  const labelText = node.append('text')
    .attr('text-anchor', d => lAnchor(d))
    .attr('font-family', 'IBM Plex Mono, monospace')
    .attr('font-size', '9.5px').attr('font-weight', '500').attr('letter-spacing', '0.02em')
    .attr('fill', d => {
      if (d.type === 'domain') return 'transparent'; // domain shows monogram not label
      if (d.type === 'ip') return '#c4a040';
      if (d.type === 'ssl') return '#7abf60';
      return 'rgba(255,255,255,0.8)';
    })
    .attr('class', 'select-none pointer-events-none')
    .text(d => d.type === 'domain' ? '' : shortLabel(d));

  let bgSized = false;

  // ── Drag ───────────────────────────────────────────────────────────────────
  if (d3.drag) {
    node.call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) simulation.alphaTarget(0); if (d.type !== 'domain') { d.fx = null; d.fy = null; } })
    );
  }

  // ── Simulation tick ────────────────────────────────────────────────────────
  simulation.on('tick', () => {
    linkLines
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

    // Perpendicular midpoint tick marks
    tickLines.each(function (d) {
      if (!d.source || !d.target) return;
      const mx = (d.source.x + d.target.x) / 2, my = (d.source.y + d.target.y) / 2;
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len * 4, py = dx / len * 4;

      this.setAttribute('x1', String(mx - px));
      this.setAttribute('y1', String(my - py));
      this.setAttribute('x2', String(mx + px));
      this.setAttribute('y2', String(my + py));
    });

    node.attr('transform', d => `translate(${d.x},${d.y})`);
    labelText.attr('x', d => labelOffX(d)).attr('y', d => labelOffY(d));

    if (!bgSized) {
      labelText.each(function () {
        try {
          const b = this.getBBox();
          if (b.width > 1) d3.select(this.previousSibling)
            .attr('x', b.x - padX).attr('y', b.y - padY)
            .attr('width', b.width + padX * 2).attr('height', b.height + padY * 2);
        } catch (_) { }
      });
      bgSized = true;
    }
  });


  setupDelegatedListener(canvas, caseFile);
  showNodeDetails('domain', hostname, caseFile);
}

function setupDelegatedListener(canvas, caseFile) {
  if (!canvas.dataset.listenerBound) {
    canvas.dataset.listenerBound = 'true';
    canvas.addEventListener('click', (e) => {
      const nodeGroup = e.target.closest('.mapper-node-svg');
      if (!nodeGroup) return;

      const type = nodeGroup.getAttribute('data-type');
      const id = nodeGroup.getAttribute('data-id');

      showNodeDetails(type, id, caseFile);
    });
  }
}

function showNodeDetails(type, id, caseFile) {
  const defaultDrawer = document.getElementById('mapper-details-default');
  const detailsContent = document.getElementById('mapper-details-content');
  if (!defaultDrawer || !detailsContent) return;

  defaultDrawer.classList.add('hidden');
  detailsContent.classList.remove('hidden');
  detailsContent.innerHTML = '';

  let html = '';

  switch (type) {
    case 'domain': {
      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-primary">Target Domain Hub</div>
          <div class="flex flex-col gap-1.5 bg-paper-variant p-3 border border-outline-variant">
            <div>DOMAIN: <span class="font-bold text-ink">${id}</span></div>
            <div class="break-all">FULL URL: <span class="text-gray-600">${caseFile.url}</span></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-paper-variant p-2 border border-outline-variant text-center">
              <span class="text-[9px] text-gray-500 block">SCORE</span>
              <span class="font-bold text-sm ${caseFile.score >= 80 ? 'text-green-600' : caseFile.score >= 50 ? 'text-yellow-600' : 'text-error'}">${caseFile.score}/100</span>
            </div>
            <div class="bg-paper-variant p-2 border border-outline-variant text-center">
              <span class="text-[9px] text-gray-500 block">VERDICT</span>
              <span class="font-bold text-[9px] tracking-wide block uppercase">${caseFile.priority.split(' ')[0]}</span>
            </div>
          </div>
          <div>TIMESTAMP: <span class="text-gray-600">${caseFile.timestamp}</span></div>
        </div>
      `;
      break;
    }
    case 'subdomain': {
      const subInfo = caseFile.resolvedSubdomains?.find(s => `${s.subdomain}.${id.substring(s.subdomain.length + 1)}` === id || id.startsWith(s.subdomain + '.'));
      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-primary">Subdomain Node</div>
          <div class="flex flex-col gap-1.5 bg-paper-variant p-3 border border-outline-variant">
            <div>FQDN: <span class="font-bold text-ink">${id}</span></div>
            <div>STATUS: <span class="text-green-600 font-bold">RESOLVED</span></div>
            <div>IP ADDRESS: <span class="font-bold text-ink">${subInfo?.ip || 'Unknown'}</span></div>
          </div>
        </div>
      `;
      break;
    }
    case 'ip': {
      const isMainIp = caseFile.registryRecord?.ip?.ip === id;
      const host = isMainIp ? caseFile.registryRecord.ip : {};
      const locationStr = [host.city, host.region, host.country].filter(Boolean).join(', ');

      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-primary">IP Address Node</div>
          <div class="flex flex-col gap-1.5 bg-paper-variant p-3 border border-outline-variant">
            <div>IP: <span class="font-bold text-ink">${id}</span></div>
            ${isMainIp ? `<div>NODE TYPE: <span class="font-bold text-gray-500">PRIMARY GATEWAY</span></div>` : `<div>NODE TYPE: <span class="font-bold text-gray-500">SUBDOMAIN ENDPOINT</span></div>`}
          </div>
          ${isMainIp ? `
            <div>ISP OPERATOR: <span class="text-ink font-bold block pl-2">${host.isp || 'Unknown'}</span></div>
            <div>AS NUMBER: <span class="text-ink font-bold block pl-2">${host.asn || 'Unknown'}</span></div>
            <div>GEOGRAPHIC AREA: <span class="text-gray-600 block pl-2">${locationStr || 'Unknown'}</span></div>
          ` : `
            <p class="text-gray-400 italic text-[11px] leading-relaxed">No direct WHOIS/ASN cache available for subdomain targets.</p>
          `}
        </div>
      `;
      break;
    }
    case 'technology': {
      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-primary">Technology / CDN Node</div>
          <div class="flex flex-col gap-1.5 bg-paper-variant p-3 border border-outline-variant">
            <div>ASSET DOMAIN: <span class="font-bold text-ink">${id}</span></div>
          </div>
          <p class="text-gray-500 text-[11px] leading-relaxed">Script assets, style documents, or embedded frames are loaded from this domain coordinates.</p>
        </div>
      `;
      break;
    }
    case 'risk': {
      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-primary">Risk / Vulnerability Node</div>
          <div class="flex flex-col gap-1.5 bg-red-50 text-error p-3 border border-error/20">
            <div class="font-bold uppercase tracking-wider">⚠️ Hazard Alert</div>
            <div class="font-bold mt-1 text-[11px] leading-relaxed">${id.startsWith('risk-brand-') ? 'Brand Impersonation Warning' : id === 'risk-mixed' ? 'Mixed Content Warning' : 'Intel Feeds Blocklisted'}</div>
          </div>
          <p class="text-ink font-bold text-[11px] leading-relaxed">${id.startsWith('risk-brand-') ? 'Page metadata or visible labels claim authorization matching a protected global brand, but target URL lacks aligned certificates or signature matches.' : id === 'risk-mixed' ? 'Encrypted secure interface transmitting raw HTTP scripts or assets (violating browser mixed-content controls).' : 'Domain identifier listed directly in threat logs (URLhaus, PhishTank, or OpenPhish).'}</p>
        </div>
      `;
      break;
    }
    case 'ssl': {
      const ssl = caseFile.sslInfo || {};
      html = `
        <div class="space-y-4 font-data-mono text-xs">
          <div class="font-bold border-b border-black pb-1 uppercase tracking-wide text-green-700">SSL Certificate Node</div>
          <div class="flex flex-col gap-1.5 bg-green-50 text-green-800 p-3 border border-green-200">
            <div class="font-bold uppercase tracking-wider">🔒 Valid Certificate</div>
            <div>ISSUER: <span class="font-bold">${ssl.issuer || id}</span></div>
            <div>SUBJECT: <span class="font-bold">${ssl.subject || 'Matched Target'}</span></div>
            <div>EXPIRES: <span class="text-gray-600">${ssl.validTo || 'Valid'}</span></div>
          </div>
          <p class="text-gray-600 text-[11px] leading-relaxed">Cryptographic handshake verified with valid TLS certificate issued by ${ssl.issuer || 'trusted CA'}.</p>
        </div>
      `;
      break;
    }
  }

  detailsContent.innerHTML = html;
}

const FALLBACK_SIMPLIFIED_MAPPING = {
  "Connection is not secure (HTTP instead of HTTPS).": "This website does not scramble your data, meaning someone on the same Wi-Fi could spy on what you type here.",
  "URL uses an IP address instead of a domain name.": "The site uses a raw number address instead of a standard name, which is very unusual for real company websites.",
  "Domain has an unusually high number of subdomains.": "The website link has too many dots and sub-sections, a trick often used to hide where the link actually goes.",
  "Domain name is suspiciously long.": "The link name is extremely long to make it look like a complicated official page, hoping you won't spot the fake parts.",
  "Domain contains many numbers, typical of auto-generated domains.": "The link has lots of random numbers, showing it was probably created automatically by a machine.",
  "Domain uses special characters (Punycode) often used in homograph attacks.": "The website uses look-alike characters from other alphabets (like a Cyrillic 'a') to mimic a famous brand name.",
  "URL could not be parsed correctly.": "The link is broken or formatted incorrectly.",
  "Domain is highly similar to a major brand (typosquatting).": "The domain name is a slight misspelling of a famous brand name, trying to trick you if you typo the name.",
  "URL contains a suspicious keyword often used in phishing.": "The link contains sensitive words (like 'login' or 'verify') on a site that has no business asking for them.",
  "URL contains a brand name but is not the official domain.": "The link uses a famous brand name but is not the official website, which is highly suspicious.",
  "Community threat-intelligence feeds flagged this URL/domain as malicious.": "This website is listed on global community blacklists as dangerous or malicious.",
  "URL/domain matched multiple community threat feeds (corroborated malicious signal).": "Multiple security systems have confirmed and blocked this website as a known threat.",
  "Domain was registered within the last 30 days.": "This website was created in the last 30 days. Most scam sites are fresh because they get caught and shut down quickly.",
  "Domain registration details could not be verified (WHOIS/RDAP lookup failed).": "We couldn't check who owns this website or how old it is because the registration database is blocked or offline.",
  "The SSL certificate was issued very recently (within the last 7 days).": "The secure lock certificate was created in the last 7 days, showing this website is brand-new.",
  "Recently reissued certificate on a pre-existing domain — possible takeover or repurposing.": "Recently reissued certificate on a pre-existing domain — possible takeover or repurposing.",
  "Page content differs significantly from its historic Wayback Machine archive (possible redirect hijack).": "The website text looks completely different from how it used to look in historical archives, suggesting a possible hijack.",
  "Page layout or visual contents changed significantly from its previous audit.": "The layout of this site has changed significantly since the last check.",
  "Domain could not be resolved via DNS.": "This website could not be resolved via DNS. It might be offline or blocked.",
  "DNS resolution check failed.": "We couldn't verify the website's address records.",
  "URL redirected to a different location.": "The link instantly forwarded you to a different website, which is a trick used to hide the final destination.",
  "Missing Strict-Transport-Security header.": "The site does not force secure connections, making it easier to intercept your password.",
  "Missing Content-Security-Policy header.": "The website lacks modern defenses to prevent hackers from injecting harmful scripts into the page.",
  "Missing X-Frame-Options header (vulnerable to clickjacking).": "The site is vulnerable to 'clickjacking', where invisible buttons can trick you into clicking things you didn't mean to.",
  "Missing X-Content-Type-Options header.": "The site doesn't specify its file types securely, which makes it easier for malware to run on your browser.",
  "Failed to connect to the target URL.": "We couldn't connect to this website.",
  "Page contains hidden forms or password fields.": "The site has hidden password or login boxes, which is a common trick used to steal credentials silently.",
  "Page uses urgency language typical of social engineering.": "The page uses pushy language (like 'suspend', 'immediate action') to panic you into typing your details.",
  "Page claims to be a brand but the domain does not match.": "The page claims to be a brand but is hosted on a completely unrelated website address.",
  "Verified established global brand domain.": "This is a verified official brand website, and all security systems report it is clean.",
  "Failed to parse page DOM.": "We couldn't inspect the page's internal code structure."
};

function generateSimplifiedNotesFallback(caseFile) {
  const reasons = caseFile.reasons || [];
  const sentences = reasons.map(r => {
    const matchKey = Object.keys(FALLBACK_SIMPLIFIED_MAPPING).find(key => r.startsWith(key));
    return matchKey ? FALLBACK_SIMPLIFIED_MAPPING[matchKey] : null;
  }).filter(Boolean);

  let verdictLine = '';
  if (caseFile.score >= 80) {
    verdictLine = "Overall, this site shows few warning signs. It appears safe, but standard browsing safety rules still apply.";
  } else if (caseFile.score >= 50) {
    verdictLine = "Overall, this site shows a mix of warnings. It would be wise to be cautious when sharing any details here.";
  } else {
    verdictLine = "Overall, this site shows multiple strong warning signs. It is highly recommended to leave this page immediately.";
  }

  const hasUnverified = reasons.some(r => r.includes('WHOIS/RDAP lookup failed') || r.includes('could not be verified'));
  if (hasUnverified) {
    sentences.push("Certain registry ownership details could not be checked.");
  }

  return [verdictLine, ...sentences].join(" ");
}

function updateInvestigatorNotes(caseFile) {
  const notesText = document.getElementById('investigator-notes');
  const simplifyBtn = document.getElementById('notes-simplify-btn');
  if (!notesText || !simplifyBtn) return;

  if (isSimplifiedNotesMode) {
    simplifyBtn.textContent = '[TECHNICAL NOTES]';
    simplifyBtn.classList.add('bg-primary', 'text-on-primary');
    let simp = caseFile.simplifiedNotes;
    if (!simp) {
      simp = generateSimplifiedNotesFallback(caseFile);
    }
    notesText.textContent = simp;
  } else {
    simplifyBtn.textContent = '[SIMPLIFY NOTES]';
    simplifyBtn.classList.remove('bg-primary', 'text-on-primary');
    notesText.textContent = caseFile.notes;
  }
}




