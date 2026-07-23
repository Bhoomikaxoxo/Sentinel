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

  const sentences = triggered
    .map(rule => FRAGMENTS[rule.id] || null)
    .filter(Boolean);

  let verdictLine = '';
  if (score >= 80) {
    verdictLine = "Overall, this site shows few risk indicators. Threat levels appear low, but standard browsing safety rules still apply.";
  } else if (score >= 50) {
    verdictLine = "Overall, this site shows a mix of risk indicators worth caution. Forensic indicators suggest potential security gaps or suspicious domain characteristics.";
  } else {
    verdictLine = "Overall, this site shows multiple strong risk indicators. High-risk signals indicate a potential threat pattern or confirmed malicious blacklist listing.";
  }

  // Handle case where specific checks are missing / unverified
  const hasUnverified = triggered.some(r => r.id === 'rdap_unavailable');
  if (hasUnverified) {
    sentences.push("Certain domain registration details could not be verified — this scan reflects lexical, structural, and connection checks only.");
  }

  return [verdictLine, ...sentences].join(" ");
};
