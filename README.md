# Sentinel AI — Threat Analysis Terminal

**Sentinel AI** is a self-hosted, zero-telemetry web application for link threat intelligence, domain infrastructure auditing, and network topology visualization. It aggregates local threat feeds, certificate transparency logs, DNS/RDAP records, and network probes to generate structured forensic reports without third-party API keys or cloud dependencies.

---

## Key Features

- **Multi-Source Threat Intelligence**: Scans targets against locally cached feeds from URLhaus, PhishTank, and OpenPhish.
- **Internet Topology Mapper**: Interactive D3 force-directed visualizer mapping target domain relationships, active subdomains, IP endpoints, open ports, and SSL certificates.
- **Passive Subdomain Discovery**: Mines Certificate Transparency logs via `crt.sh` and DNS-over-HTTPS (Cloudflare DoH) for real-time subdomain enumeration.
- **Network & Cryptographic Probing**: Performs parallel TCP port checks (80, 443, 8080, 8443, 22) and retrieves TLS certificate handshake metadata.
- **DOM & Visual Inspection**: Captures headful page renders, DOM script/stylesheet dependencies, mixed-content risks, and visual screenshots via an isolated Puppeteer worker.
- **Forensic Case Archive**: Stores historical scan records locally with risk scoring (0–100), automated verdict generation, and shareable HTML report exports.

---

## Technical Architecture

```
                                 ┌─────────────────────────────────┐
                                 │   Sentinel Client (SPA / D3)    │
                                 └────────────────┬────────────────┘
                                                  │ HTTP / REST
                                 ┌────────────────▼────────────────┐
                                 │    Node.js / Express Server     │
                                 └────────┬───────────────┬────────┘
                                          │               │
                 ┌────────────────────────┴───┐       ┌───┴────────────────────────┐
                 │       Analysis Engine      │       │     Puppeteer Render       │
                 │ (RDAP, DNS, TLS, Ports)   │       │     Worker (Port 4000)     │
                 └──────────────┬─────────────┘       └────────────────────────────┘
                                │
                 ┌──────────────▼─────────────┐
                 │ Local Threat Feed Cache    │
                 │ (URLhaus, PhishTank, etc.) │
                 └────────────────────────────┘
```

| Component | Architecture / Technology |
|---|---|
| **Frontend** | Vanilla HTML5 / ES6 JavaScript · Tailwind CSS · D3.js (Force-Directed Graph) |
| **Backend API** | Node.js (v18+) · Express.js |
| **Render Worker** | Puppeteer · Headless Chrome (Isolated Microservice) |
| **Threat Feed Engine** | Local cron ingestion & flat-file cache (URLhaus, PhishTank, OpenPhish) |
| **Data Persistence** | Local JSON storage (`server/db/cases.json`) |
| **Network & Security** | Node.js `net` (Socket Probing), `tls` (Cert Audit), Cloudflare DoH, RDAP |

---

## Project Structure

```
Sentinel/
├── client/
│   ├── index.html        # Main SPA interface & threat mapper canvas
│   ├── app.js            # Client application controller & D3 graph renderer
│   └── styles.css        # Dashboard styling & utility overrides
│
├── server/
│   ├── server.js         # Express server entry point
│   ├── routes/
│   │   ├── scan.js       # Target URL analysis endpoints
│   │   └── cases.js      # Case file record management
│   ├── services/
│   │   ├── scanService.js          # Core orchestrator for target analysis
│   │   ├── subdomainResolver.js    # crt.sh CT log & DoH subdomain enumeration
│   │   ├── portScanner.js          # Parallel TCP socket port scanner
│   │   ├── threatFeedService.js    # Local threat feed cache & query engine
│   │   ├── reputationService.js    # RDAP registrar & DNS records lookup
│   │   ├── registryService.js      # Geolocation, ASN, WHOIS aggregator
│   │   ├── securityHeaders.js      # Security header validation (CSP, HSTS)
│   │   ├── heuristicEngine.js      # Social engineering & urgency phrase heuristics
│   │   ├── domAnalyzer.js          # Script, stylesheet & iframe extraction
│   │   └── localExplainer.js       # Forensic narrative & verdict scoring
│   └── db/
│       ├── store.js                # JSON persistence layer
│       ├── cases.json              # Scan history data store
│       └── threat-feeds/           # Cached threat feed definitions
│
└── render-worker/
    ├── worker.js         # Puppeteer screenshot & DOM render service
    └── Dockerfile        # Container environment for render worker
```

---

## Installation & Deployment

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Install Dependencies

```bash
# Server dependencies
cd server
npm install

# Render worker dependencies
cd ../render-worker
npm install
```

### 2. Launch Services

**Option A: Manual Execution**

1. Start the render worker (Port 4000):
   ```bash
   cd render-worker
   node worker.js
   ```

2. Start the primary API server (Port 3001):
   ```bash
   cd server
   node server.js
   ```

**Option B: Docker Execution (Render Worker)**

```bash
cd render-worker
docker build -t sentinel-render-worker .
docker run -d -p 4000:4000 sentinel-render-worker
```

### 3. Access Dashboard

Navigate to **http://localhost:3001** in any web browser.

---

## Threat Intelligence Sources

Threat lists are downloaded upon server startup and updated automatically every 6 hours:

| Source | Identifier | Scope |
|---|---|---|
| **Abuse.ch** | URLhaus | Active malware distribution URLs |
| **PhishTank** | PhishTank | Verified phishing domains |
| **OpenPhish** | OpenPhish | Active phishing intelligence feeds |

Lookups execute locally against cached datasets without making external outbound calls per user query.

---

## License

Distributed under the [MIT License](LICENSE).
