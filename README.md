# Sentinel AI — Link Threat Analysis Terminal

> Paste a link. Get an honest answer about whether it's safe.

Sentinel AI is a self-hosted web application that checks any URL against multiple free, community-maintained threat intelligence sources and returns a structured evidence report — no API keys, no paywalls, no third-party accounts required.

---

## What it does

When you submit a URL, Sentinel runs the following checks in parallel and aggregates them into a risk score (0–100) with a clear verdict:

| Check | Source |
|---|---|
| Encrypted connection (HTTPS) | Direct HTTP request |
| Security headers (CSP, X-Frame-Options, etc.) | Direct HTTP request |
| Domain registration age & registrar | RDAP (free, no key) |
| DNS records (A, MX, NS, TXT) | DNS-over-HTTPS via Cloudflare |
| IP geolocation & ASN | ip-api.com (free tier) |
| Certificate transparency logs | crt.sh (free, no key) |
| Known malicious URL database | **URLhaus** — abuse.ch community feed |
| Known phishing URL database | **PhishTank** — community feed |
| Known phishing URL database | **OpenPhish** — community feed |
| Urgency / social-engineering language | Local heuristic engine |
| DOM structure analysis | Puppeteer render worker |
| Visual screenshot capture | Puppeteer render worker |
| Wayback Machine archive history | Wayback CDX API (free) |
| Background watchlist monitoring | Local monitor service |

All threat feeds are downloaded and cached locally on a schedule — no live API call is made per scan.

---

## Screenshots

> The app uses a forensic case-file aesthetic — evidence boards, manila folder panels, and printed registry records.

**Morning Briefing Dashboard** — the default screen showing open cases, today's intake log, and a 24h verdict tally.

**Case Report** — the full evidence report for a scanned URL, with a screenshot (Exhibit A), evidence log, redirect trail, and a rotating verdict stamp.

**Registry Record** — a printed public-records-style lookup showing WHOIS/RDAP, DNS, IP geolocation, and certificate transparency data for the scanned domain.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS · Tailwind CSS (CDN) |
| Backend | Node.js · Express |
| Screenshot renderer | Puppeteer (isolated render-worker service) |
| Database | JSON flat-file (`server/db/cases.json`) |
| Threat feeds | URLhaus · PhishTank · OpenPhish (downloaded, cached locally) |
| DNS | Cloudflare DNS-over-HTTPS |
| Domain data | RDAP |
| Certificate data | crt.sh |

No external database, no cloud dependency, no API keys required for any feature.

---

## Project structure

```
Sentinel/
├── client/
│   ├── index.html        # Main SPA — dashboard, scan, registry, logs, settings
│   ├── app.js            # All client-side logic
│   └── styles.css        # Custom utility classes and light-mode theme
│
├── server/
│   ├── server.js         # Express entry point
│   ├── routes/
│   │   ├── scan.js       # POST /api/scan — runs a full URL analysis
│   │   └── cases.js      # GET/DELETE /api/cases — case archive + shareable reports
│   ├── services/
│   │   ├── scanService.js          # Orchestrates all sub-checks
│   │   ├── threatFeedService.js    # Downloads & queries URLhaus/PhishTank/OpenPhish
│   │   ├── reputationService.js    # RDAP + DNS-over-HTTPS
│   │   ├── registryService.js      # Aggregates RDAP, DNS, IP, cert transparency
│   │   ├── securityHeaders.js      # HTTP header analysis
│   │   ├── heuristicEngine.js      # URL & content heuristics (urgency language, etc.)
│   │   ├── domAnalyzer.js          # DOM-based checks via Puppeteer output
│   │   ├── certTransparencyService.js  # crt.sh certificate lookup
│   │   ├── waybackService.js       # Wayback Machine archive history
│   │   ├── monitorService.js       # Background re-scan watchlist
│   │   ├── localExplainer.js       # Human-readable verdict generation
│   │   ├── templateExplainer.js    # Shareable report text generation
│   │   ├── imageDiffService.js     # Screenshot comparison
│   │   ├── urlAnalyzer.js          # URL structure analysis
│   │   └── domainUtils.js          # Domain parsing helpers
│   └── db/
│       ├── store.js                # JSON flat-file read/write
│       ├── cases.json              # Persisted case archive
│       └── threat-feeds/           # Cached URLhaus, PhishTank, OpenPhish data
│
└── render-worker/
    ├── worker.js         # Standalone Puppeteer HTTP service
    └── Dockerfile        # Container definition for the render worker
```

---

## Getting started

### Prerequisites

- Node.js 18+
- npm

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Install render-worker dependencies

```bash
cd render-worker
npm install
```

### 3. Start the render worker (optional — needed for screenshots)

```bash
cd render-worker
node worker.js
# Listens on http://localhost:4000
```

Or run it in Docker:

```bash
cd render-worker
docker build -t sentinel-render-worker .
docker run -p 4000:4000 sentinel-render-worker
```

### 4. Start the server

```bash
cd server
node server.js
# Listens on http://localhost:3001
```

### 5. Open the app

Visit **http://localhost:3001** in your browser.

---

## Configuration

All settings are accessible in the **System Settings** tab inside the app:

| Setting | Default | Description |
|---|---|---|
| Puppeteer Render Endpoint | `http://127.0.0.1:4000` | URL of the running render-worker |
| Scan Timeout | `10s` | Max time to wait for a page response |
| User Agent | Chrome/120 | Browser UA string sent with requests |

Settings are persisted in `localStorage` — no server-side config file needed.

---

## Threat feeds

On startup, Sentinel downloads and caches three community threat lists locally:

| Feed | Source | Update interval |
|---|---|---|
| URLhaus | `urlhaus.abuse.ch` | Every 6 hours |
| PhishTank | `phishtank.com` | Every 6 hours |
| OpenPhish | `openphish.com` | Every 6 hours |

All lookups happen against the local cache — no live API call per scan. The feeds require no API key or account.

---

## Shareable reports

Every scan result can be exported as a self-contained HTML report via the **Share** button in the case view. The report includes the full evidence log, verdict, redirect trail, and registry record — no server required to view it.

---

## Limitations

- A **clean result** means no known red flags were found in the checked sources — not a guarantee that a site is safe. Threat databases are not exhaustive.
- Screenshot capture requires the render worker to be running. The rest of the analysis works without it.
- PhishTank requests a free API key for high-volume use; the public feed used here may be rate-limited at times.
- This tool is designed for personal and research use. It is not a replacement for enterprise security tooling.

---

## License

MIT
