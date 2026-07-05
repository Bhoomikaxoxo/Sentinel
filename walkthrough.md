# Sentinel AI Threat Analysis - Master Walkthrough

Here is the complete record of everything built, configured, and fixed in the Sentinel codebase, up to the completion of the Registry Record Tab Migration phase.

---

## 1. Puppeteer Screenshot Engine (`render-worker/`)
* **Real Screenshot Generation**: Updated the headless Puppeteer worker so that it takes high-fidelity, authentic screenshots of target websites (retaining actual icons, text layouts, and images) instead of using flat AI-generated placeholders.
* **Dynamic Scans**: Configured the worker endpoints to accept dynamic inputs (custom `userAgent` and page navigation `timeout` limits) for each scan.

---

## 2. Server-Side Database Persistence (`server/db/`)
* **JSON File Database**: Created a server-side storage controller ([store.js](file:///Users/mika/Documents/Projects/Sentinel/server/db/store.js)) that reads, writes, and manages scanned cases inside `cases.json`.
* **REST API Endpoints**: Created database routes ([cases.js](file:///Users/mika/Documents/Projects/Sentinel/server/routes/cases.js)) mounted in [server.js](file:///Users/mika/Documents/Projects/Sentinel/server/server.js):
  * `GET /api/cases`: Retrieves all archived scans to display in the UI.
  * `GET /api/cases/:id`: Fetches a single case file.
  * `DELETE /api/cases`: Clears all archived case records from the database.
  * `POST /api/cases/:id/watch`: Toggles domain watchlist monitoring.
  * `POST /api/cases/:id/feedback`: Allows human-in-the-loop audit feedback toggles (marking reports `"inaccurate"`).

---

## 3. Fully-Free Services Migration & Keyless Threat Intelligence
* **Google Safe Browsing Deletion**: Completely removed dependency on paid/credentialed Safe Browsing APIs.
* **Community Threat Feeds Integration**: Created `threatFeedService.js` to automatically fetch, cache, and update blacklist databases from community feeds (URLhaus, PhishTank, and OpenPhish) on a 12-hour schedule.
* **Fallback & Cache Safety**: Downloads CSV/Text feeds with a custom browser User-Agent to prevent Cloudflare 403 blocks. If downloads fail, the service automatically falls back to cached data and prints error logs without crashing.

---

## 4. Advanced Threat Scanners & Heuristics
* **Certificate Transparency Checks (`certTransparencyService.js`)**: Leverages crt.sh to look up public certificate transparency logs. Flags certificates issued within the last 7 days (`new_ssl_certificate`, penalty `-15` points).
* **Wayback Machine Similarity Analysis (`waybackService.js`)**: Fetches historical page snapshots from the Wayback Machine. Evaluates content changes via a custom tokenized Jaccard similarity index, flagging defaced or hijacked redirect domains (`wayback_content_divergence`, penalty `-15` points).
* **Screenshot Visual Diffing (`imageDiffService.js`)**: Employs Pixelmatch and PNGjs to calculate raw visual difference percentages between consecutive domain scans. Displays layout shifts in the UI and flags changes (`visual_content_changed`, penalty `-15` points).
* **Unverified Scoring Enforcement**: Tuned WHOIS/Safe Browsing errors to penalize the score by `-10` points for lack of verification (forensic blind spots) instead of letting them pass with 0-deduction scores.

---

## 5. Background Monitoring & Watchlists
* **Monitoring Daemon (`monitorService.js`)**: Periodically re-audits watchlist domains every 6 hours. Automatically sets an `alert: true` status if the risk score drops by more than 15 points or if a visual layout change exceeds 30%.
* **Alert Notifications**: Visually tags compromised watchlist domains in the client archive list with blinking crimson warning outlines and pulsing folder tabs.

---

## 6. Forensic UI Expansion & Surfaced Metadata
* **Enriched Metadata Fields**: Structured WHOIS registry age, registrar service name, SSL cert issue age, Wayback Machine Jaccard text overlap, and visual diff changes are parsed and surfaced on a new **Forensic Evidence Summary** report card.
* **Matched Feed Badges**: Matches display prominent red headers detailing the exact feeds triggered (e.g. `MATCHED FEEDS: URLHAUS`).
* **Category Tag Chips**: Places tag pills (`PHISHING`, `BRAND IMPERSONATION`, `BLOCKLISTED`, `REDIRECT HOPS`) up top.
* **Inline Redirect Chain**: Visualizes a horizontal, single-line breadcrumb path of intermediate redirects directly above Exhibit A.
* **Screenshot Highlights overlays**: Automatically draws red visual highlight boxes directly over Exhibit A's screenshot if typosquatting brand matches occur, featuring hoverable tooltip alerts detailing unauthorized wordmark usage.
* **Confidence Rating**: Tags audits with `CONFIDENCE: HIGH`, `MEDIUM`, or `LOW` based on verification completeness.
* **Auditor Inaccuracy Feedback**: Integrates a `[MARK INACCURATE]` auditor button that flags inaccurate reports on the server case database and blinks an `AUDIT` warning badge on archived folders.

---

## 7. Registry Record Tab & IP Geolocation (New!)
* **Network Map Removal**: The old Network Map corkboard tab has been fully replaced. The redirect chain is now displayed inline and as a small collapsible panel on the new Registry Record sheet.
* **Aggregated Public Records Service (`registryService.js`)**: Runs concurrent unsettled requests using `Promise.allSettled` to query:
  * **WHOIS/RDAP**: registrar details, creation dates, expiration dates, status codes, and registrant country/org details.
  * **DNS Records**: Cloudflare DoH lookup for `A`, `MX`, `NS`, and `TXT` record blocks.
  * **Network Geolocation**: Resolves DNS `A` records and queries `ip-api.com` for hosting organizations, ASN operators, and geographical locations. Includes a singleton throttle to stay safely under the ~45 req/min free tier rate limit.
  * **SSL History**: Pulls crt.sh certificate history logs to verify issuers and active dates.
* **File-Based Record Caching**: Persists full query payloads into `server/db/cache/registry-{hostname}.json` with a 24-hour expiration threshold to minimize redundant API requests.
* **Certified Records Design Motif**: Styled as an official laser-printed public records printout. Features clean dot padding table listings (`A ............... 104.21.xx.xx`), a diagonal low-opacity "CERTIFIED RECORD" watermark, and a credibility attribution caption in monospace font.
* **SSL Cert Takeover Heuristic Rule (`recently_reissued_cert`)**: Compares domain registry creation age against SSL certificate issuance timestamps. If a pre-existing domain (>2 years old) has an SSL cert issued within the last 7 days, the system penalizes the score by `-10` points and tags the case as a potential hijack/repurposing takeover.

---

## 8. Verification logs & Proof of Concept

### Registry Records Output
A sweep scan of `https://soap2dayonline.com` returned the following structured registry data:
- **Registrar**: `NameCheap, Inc.`
- **Created**: `2026-06-29T12:03:06Z` (6 days old)
- **Status Codes**: `["client transfer prohibited"]`
- **DNS Records**:
  - `A`: `104.21.82.14, 172.67.150.169`
  - `MX`: `(none found)`
  - `NS`: `memphis.ns.cloudflare.com., natasha.ns.cloudflare.com.`
- **IP Geolocation**:
  - `IP Address`: `104.21.82.14`
  - `Hosting Org`: `Cloudflare, Inc.`
  - `ASN`: `AS13335 Cloudflare, Inc.`
  - `Location`: `Toronto, Ontario, Canada`

### Heuristic Takeover Verification
A validation test script `scratch/test_takeover.js` verified the takeover cross-check rule:
* **Triggered Rule**: `recently_reissued_cert`
* **Score Penalty**: `-10` points
* **Reason Listed**: `Recently reissued certificate on a pre-existing domain — possible takeover or repurposing.`
* **Result**: Passed successfully.
