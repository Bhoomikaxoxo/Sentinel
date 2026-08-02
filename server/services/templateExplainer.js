const FRAGMENTS = {
  insecure_protocol: "This site does not use an encrypted connection (HTTP instead of HTTPS), meaning any data submitted could be intercepted by third parties.",
  ip_hostname: "The site uses a raw IP address instead of a standard domain name, which is highly atypical for legitimate web services.",
  excessive_subdomains: "The domain structure contains an unusually high count of subdomains, which is commonly used in phishing redirection funnels.",
  long_hostname: "The hostname is excessively long, a technique often used to mimic complex official paths on malicious pages.",
  many_numbers_in_domain: "The domain contains a large ratio of numbers, matching patterns of auto-generated or machine-registered URLs.",
  punycode_domain: "The domain uses Punycode character encoding. This is often used in homograph attacks to impersonate brand names with look-alike international characters.",
  invalid_url: "The URL could not be parsed, indicating a broken or deliberately malformed address.",
  typosquat_domain: "The domain name is highly similar to a well-known brand, indicating a typosquatting brand impersonation attempt.",
  suspicious_keyword: "The URL contains keywords commonly associated with account locks, verification pages, or logins, which are typical of credential harvesting.",
  fake_brand_keyword: "The URL contains a popular brand name but is hosted on an unofficial domain, indicating a suspicious link.",
  threat_feed_match: "This domain or URL matches known malicious database records independently reported by the community.",
  multi_feed_flagged: "This site has been corroborated and blacklisted across multiple independent community threat intelligence feeds.",
  newly_registered_domain: "The domain registration is extremely fresh (under 30 days old), which is a characteristic signature of temporary phishing setups.",
  rdap_unavailable: "Domain registration age and ownership credentials could not be verified due to a lookup failure.",
  dns_resolution_failure: "The domain failed to resolve via DNS, meaning the server might be offline or blocked.",
  dns_resolution_error: "DNS resolution checks encountered an error.",
  redirect_occurred: "The URL immediately redirected to a different domain, a behavior commonly used to bypass security crawlers.",
  missing_hsts: "The server does not enforce Strict-Transport-Security (HSTS), increasing vulnerability to SSL-downgrade attacks.",
  missing_csp: "The page is missing a Content-Security-Policy (CSP) header, increasing vulnerability to cross-site scripting (XSS) and script injections.",
  missing_x_frame_options: "The page does not configure X-Frame-Options, leaving users vulnerable to clickjacking frame embeds.",
  missing_x_content_type_options: "The page is missing X-Content-Type-Options, permitting browsers to sniff MIME types, which can lead to drive-by malware execution.",
  connection_failed: "Failed to connect to the target server during the sandboxed browser audit.",
  invisible_credential_fields: "The audit detected hidden or invisible form password/login elements on the page, typical of credential theft.",
  urgency_language: "The page text uses urgency prompts (e.g. 'immediately', 'verify now', 'account suspended') typical of social engineering scams.",
  brand_mismatch_dom: "The page contents present logos or text matching a brand, but the hosting domain does not match that brand's official profile.",
  dom_analysis_failed: "DOM structural analysis was skipped or failed.",
  new_ssl_certificate: "The SSL certificate was issued in the last 7 days, indicating recently established server infrastructure.",
  wayback_content_divergence: "The page content diverges significantly from its historic Wayback Machine archive, indicating a possible content hijack or defacement.",
  visual_content_changed: "The page content has changed visually from a previous scan, indicating a potential layout or credential field modification.",
  established_brand_verified: "The domain is a verified established global brand domain. All community threat intelligence feeds (URLhaus, PhishTank, OpenPhish) report a clean status."
};

exports.buildExplanation = (scanResult) => {
  const triggered = scanResult.triggeredRules || [];
  const score = scanResult.score !== undefined ? scanResult.score : 100;
  const hostname = scanResult.hostname || (scanResult.url ? scanResult.url.replace('https://','').replace('http://','').split('/')[0] : 'target website');

  const sentences = triggered
    .map(rule => FRAGMENTS[rule.id] || null)
    .filter(Boolean);

  let headerSummary = '';
  if (scanResult.securityHeadersAudit) {
    const vals = Object.values(scanResult.securityHeadersAudit);
    const passCount = vals.filter(h => h && h.present).length;
    headerSummary = `Security Headers Audit: Passed ${passCount}/4 controls (${vals.filter(h => h && h.present).map(h => h.name).join(', ') || 'None'}).`;
  }

  let verdictLine = '';
  if (score >= 80) {
    verdictLine = `Forensic audit of ${hostname} (Score: ${score}/100) indicates a clean security posture with minimal risk factors.`;
  } else if (score >= 50) {
    verdictLine = `Forensic audit of ${hostname} (Score: ${score}/100) reveals security misconfigurations or minor risk anomalies requiring review.`;
  } else {
    verdictLine = `Forensic audit of ${hostname} (Score: ${score}/100) detected critical security risk indicators.`;
  }

  const parts = [verdictLine];
  if (headerSummary) parts.push(headerSummary);
  parts.push(...sentences);

  const hasUnverified = triggered.some(r => r.id === 'rdap_unavailable');
  if (hasUnverified) {
    parts.push("Domain WHOIS/RDAP registration details could not be verified online.");
  }

  return parts.join(" ");
};

const SIMPLIFIED_FRAGMENTS = {
  insecure_protocol: "This website does not scramble your data, meaning someone on the same Wi-Fi could spy on what you type here.",
  ip_hostname: "The site uses a raw number address instead of a standard name, which is very unusual for real company websites.",
  excessive_subdomains: "The website link has too many dots and sub-sections, a trick often used to hide where the link actually goes.",
  long_hostname: "The link name is extremely long to make it look like a complicated official page, hoping you won't spot the fake parts.",
  many_numbers_in_domain: "The link has lots of random numbers, showing it was probably created automatically by a machine.",
  punycode_domain: "The website uses look-alike characters from other alphabets (like a Cyrillic 'a') to mimic a famous brand name.",
  invalid_url: "The link is broken or formatted incorrectly.",
  typosquat_domain: "The domain name is a slight misspelling of a famous brand name, trying to trick you if you typo the name.",
  suspicious_keyword: "The link contains sensitive words (like 'login' or 'verify') on a site that has no business asking for them.",
  fake_brand_keyword: "The link uses a famous brand name but is not the official website, which is highly suspicious.",
  threat_feed_match: "This website is listed on global community blacklists as dangerous or malicious.",
  multi_feed_flagged: "Multiple security systems have confirmed and blocked this website as a known threat.",
  newly_registered_domain: "This website was created in the last 30 days. Most scam sites are fresh because they get caught and shut down quickly.",
  rdap_unavailable: "We couldn't check who owns this website or how old it is because the registration database is blocked or offline.",
  dns_resolution_failure: "This website could not be resolved via DNS. It might be offline or blocked.",
  dns_resolution_error: "We couldn't verify the website's address records.",
  redirect_occurred: "The link instantly forwarded you to a different website, which is a trick used to hide the final destination.",
  missing_hsts: "The site does not force secure connections, making it easier to intercept your password.",
  missing_csp: "The website lacks modern defenses to prevent hackers from injecting harmful scripts into the page.",
  missing_x_frame_options: "The site is vulnerable to 'clickjacking', where invisible buttons can trick you into clicking things you didn't mean to.",
  missing_x_content_type_options: "The site doesn't specify its file types securely, which makes it easier for malware to run on your browser.",
  connection_failed: "We couldn't connect to this website.",
  invisible_credential_fields: "The site has hidden password or login boxes, which is a common trick used to steal credentials silently.",
  urgency_language: "The page uses pushy language (like 'suspend', 'immediate action') to panic you into typing your details.",
  brand_mismatch_dom: "The page claims to be a brand but is hosted on a completely unrelated website address.",
  dom_analysis_failed: "We couldn't inspect the page's internal code structure.",
  new_ssl_certificate: "The secure lock certificate was created in the last 7 days, showing this website is brand-new.",
  wayback_content_divergence: "The website text looks completely different from how it used to look in historical archives, suggesting a possible hijack.",
  visual_content_changed: "The layout of this site has changed significantly since the last check.",
  established_brand_verified: "This is a verified official brand website, and all security systems report it is clean."
};

exports.buildSimplifiedExplanation = (scanResult) => {
  const triggered = scanResult.triggeredRules || [];
  const score = scanResult.score !== undefined ? scanResult.score : 100;

  const sentences = triggered
    .map(rule => SIMPLIFIED_FRAGMENTS[rule.id] || null)
    .filter(Boolean);

  let verdictLine = '';
  if (score >= 80) {
    verdictLine = "Overall, this site shows few warning signs. It appears safe, but standard browsing safety rules still apply.";
  } else if (score >= 50) {
    verdictLine = "Overall, this site shows a mix of warnings. It would be wise to be cautious when sharing any details here.";
  } else {
    verdictLine = "Overall, this site shows multiple strong warning signs. It is highly recommended to leave this page immediately.";
  }

  const hasUnverified = triggered.some(r => r.id === 'rdap_unavailable');
  if (hasUnverified) {
    sentences.push("Certain registry ownership details could not be checked.");
  }

  return [verdictLine, ...sentences].join(" ");
};

