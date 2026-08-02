# Sentinel AI — Autonomous Cyber Threat Intelligence & Domain Forensics Engine

**Sentinel AI** is a real-time, zero-trust cybersecurity intelligence portal designed to perform automated deep forensic audits on any web domain, exposing phishing signatures, infrastructure anomalies, brand impersonations, and transport layer security misconfigurations.

---

## Technical Architecture & Core Subsystems

```
                               ┌──────────────────────────────────────────────┐
                               │   Sentinel Web Client (SPA / D3.js Mapper)  │
                               └──────────────────────┬───────────────────────┘
                                                      │ HTTP REST (x-client-id)
                               ┌──────────────────────▼───────────────────────┐
                               │    Node.js / Express Server API Gateway     │
                               └────────┬─────────────────────────────┬───────┘
                                        │                             │
               ┌────────────────────────▼────────────┐       ┌────────▼───────────────────────┐
               │    Concurrent Scan Pipeline         │       │    Puppeteer Render Worker    │
               │ (scanService.js Orchestrator)      │       │      (Headless Chrome)        │
               └────────┬────────────────────┬───────┘       └────────────────────────────────┘
                        │                    │
   ┌────────────────────▼──────┐      ┌──────▼────────────────────────┐
   │ Parallel Forensics Probes │      │  Scoring & Explainer Engine   │
   │  • DNS / WHOIS / RDAP     │      │  • heuristicEngine.js         │
   │  • crt.sh CT Subdomains   │      │  • localExplainer (Gemini API)│
   │  • Security Headers Audit │      │  • templateExplainer (Fallback)│
   │  • DOM & Password Forms   │      └──────────────┬────────────────┘
   │  • Wayback Jaccard Diff   │                     │
   │  • Community Threat Feeds │                     │
   └───────────────────────────┘      ┌──────────────▼────────────────┐
                                      │ Client-Scoped JSON Database   │
                                      │   (store.js / cases.json)     │
                                      └───────────────────────────────┘
```

### 1. Concurrent Multi-Vector Forensics Pipeline (`scanService.js`)
When a target domain is submitted, Sentinel executes parallel network probes:
- **DNS & Registry Layer**: Resolves WHOIS/RDAP records, parsing domain age, registrar metadata, and WHOIS privacy flags (`reputationService.js`, `registryService.js`).
- **Subdomain Discovery**: Mins Certificate Transparency (CT) logs via `crt.sh` and executes wordlist DNS resolution to discover subdomains and IP endpoints (`subdomainResolver.js`).
- **Transport Security Audit**: Audits raw HTTP response headers for Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options (clickjacking mitigation), and X-Content-Type-Options (`securityHeaders.js`).
- **DOM & Password Form Analysis**: Inspects linked scripts, stylesheets, external iframes, and hidden/invisible credential password forms typical of phishing kits (`domAnalyzer.js`).
- **Temporal Integrity Audit**: Calculates a Jaccard text similarity index against historic Wayback Machine snapshots to identify unauthorized content modifications or domain hijacking (`waybackService.js`).
- **Active Visual Snapshotting**: Captures high-resolution DOM renders and compares visual diff percentages against previous scan benchmarks (`imageDiffService.js`).

---

### 2. Calibrated Heuristic Engine (`heuristicEngine.js`)
Sentinel evaluates target risk using a multi-weighted deduction and credit algorithm (Score: 0–100):
- **HYGIENE VS. ACTIVE THREAT SEPARATION**: Minor email authentication misconfigurations (`missing_spf`, `missing_dmarc`) carry low penalties (-5 points each). High-risk indicators (`brand_mismatch_dom`, `typosquat_domain`, `invisible_credential_fields`, blocklist matches) trigger major deductions (-40 to -100 points).
- **SECURITY HEADER CREDIT**: Passing 3+ security headers awards a positive score bonus (+10 points).
- **CONDITIONAL PHISHING TAGGING**: The `PHISHING` threat tag is strictly reserved for cases exhibiting primary active spoofing or threat feed matches. Non-phishing low scores tag as `SUSPICIOUS` or `HIGH RISK`.
- **CORROBORATED SWEEP CONFIDENCE**: Confidence ratings (`HIGH`, `MEDIUM`, `LOW`) require primary corroboration (threat feed hits or brand spoofing match) to report `HIGH` confidence on non-clean scores.

---

### 3. Two-Tier Explainer Pipeline (`localExplainer.js`)
To produce human-readable forensic summaries for security teams:
- **Tier 1 (Cloud LLM)**: Sends structured telemetry prompts to the Google Gemini API (`gemini-1.5-flash`), synthesizing raw scan metrics into a sub-120-word forensic narrative.
- **Tier 2 (Local LLM Fallback)**: Attempts a local Ollama LLM call (`llama3.2:1b`) if Gemini API keys are missing or offline.
- **Tier 3 (Deterministic Generator)**: Dynamically composes case-specific notes incorporating domain age, pass/fail security header statistics, and specific findings via `templateExplainer.js`.

---

### 4. Interactive Internet Topology Mapper (D3.js)
Renders real-time force-directed topology graphs linking:
- Root Domain Hubs
- Active Subdomains
- Edge IP Endpoints & Geolocation ASNs
- Security Header & Risk Nodes
- SSL Certificate Authorities

Includes strict pre-simulation link sanitization to prevent missing-node exceptions and ensure smooth visual performance.

---

### 5. Zero-Trust Client Data Isolation (`store.js`)
Sentinel enforces strict client-level data isolation without requiring user registration flows:
- **Client Tokens**: Devices auto-generate a 128-bit UUID (`crypto.randomUUID()`) stored in browser `localStorage` and sent via `x-client-id` HTTP headers.
- **Server DB Scoping**: Every database operation in `store.js` (`getCases`, `addCase`, `getCaseById`, `clearCases`) filters strictly by `clientId`.
- **Zero Cross-Access**: Requests for cases belonging to another client ID return an HTTP 404 response.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5 / JavaScript (ES6+) · Tailwind CSS · D3.js (v7 Force Simulation) |
| **Backend API** | Node.js (v18+) · Express.js |
| **Active Browser Worker** | Puppeteer · Headless Chrome Microservice |
| **AI Synthesis** | Google Gemini API (`generativelanguage.googleapis.com`) · Ollama (Fallback) |
| **Database & Cache** | Client-isolated JSON persistence layer (`server/db/cases.json`) |

---

## Directory Structure

```
Sentinel/
├── client/
│   ├── index.html        # Main SPA dashboard & D3 Internet Mapper canvas
│   ├── app.js            # Client application controller, API fetcher & D3 renderer
│   └── styles.css        # Dashboard styling & utility classes
│
├── server/
│   ├── server.js         # Express HTTP API server entrypoint
│   ├── routes/
│   │   ├── scan.js       # Domain scan & threat investigation endpoints
│   │   └── cases.js      # Client-isolated case history endpoints
│   ├── services/
│   │   ├── scanService.js          # Core multi-probe pipeline orchestrator
│   │   ├── heuristicEngine.js      # Weight calibration & score compiler
│   │   ├── localExplainer.js       # Gemini AI & Ollama explainer service
│   │   ├── templateExplainer.js    # Dynamic case summary fallback generator
│   │   ├── securityHeaders.js      # HSTS, CSP, X-Frame-Options audit
│   │   ├── subdomainResolver.js    # crt.sh CT logs & DNS subdomain enumeration
│   │   ├── reputationService.js    # DNS A/AAAA/MX/TXT & RDAP WHOIS lookup
│   │   ├── registryService.js      # Geolocation, ASN, WHOIS aggregator
│   │   ├── domAnalyzer.js          # DOM scripts, iframes & password form detection
│   │   ├── waybackService.js       # Wayback Machine Jaccard text similarity
│   │   └── imageDiffService.js     # Visual screenshot diffing comparison
│   └── db/
│       ├── store.js                # Client-isolated JSON database wrapper
│       └── cases.json              # Local case database
│
└── render-worker/
    ├── worker.js         # Puppeteer screenshot & DOM render service (Port 4000)
    └── Dockerfile        # Container configuration for headless Chrome
```

---

## Environment Setup & Configuration

Create a `.env` file inside the `server/` directory:

```env
PORT=3001
GEMINI_API_KEY=your_google_gemini_api_key_here
SCREENSHOTONE_ACCESS_KEY=optional_screenshot_api_key
OLLAMA_URL=http://localhost:11434
```

---

## Quickstart & Installation

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher

### 1. Install Dependencies

```bash
# Install API server dependencies
cd server
npm install

# Install Render Worker dependencies
cd ../render-worker
npm install
```

### 2. Run the Application

```bash
# Step 1: Start Render Worker (Port 4000)
cd render-worker
node worker.js

# Step 2: Start Express API Server (Port 3001)
cd ../server
node server.js
```

Open your browser and navigate to **`http://localhost:3001`**.

---

## REST API Reference

| Endpoint | Method | Description | Mandatory Headers |
|---|---|---|---|
| `/api/scan/domain` | `POST` | Initiates a concurrent threat investigation for a domain | `x-client-id` |
| `/api/cases` | `GET` | Fetches all cases owned by the requesting client ID | `x-client-id` |
| `/api/cases/:id` | `GET` | Retrieves full case telemetry file by ID | `x-client-id` |
| `/api/cases/:id/flag` | `POST` | Toggles user flag status on a case | `x-client-id` |
| `/api/cases` | `DELETE` | Clears all cases belonging to the requesting client ID | `x-client-id` |

---

## License

Distributed under the [MIT License](LICENSE).
