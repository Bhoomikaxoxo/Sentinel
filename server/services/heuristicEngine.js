const RULE_WEIGHTS = {
  insecure_protocol: { score: -20, desc: "Connection is not secure (HTTP instead of HTTPS)." },
  ip_hostname: { score: -40, desc: "URL uses an IP address instead of a domain name." },
  excessive_subdomains: { score: -15, desc: "Domain has an unusually high number of subdomains." },
  long_hostname: { score: -10, desc: "Domain name is suspiciously long." },
  many_numbers_in_domain: { score: -10, desc: "Domain contains many numbers, typical of auto-generated domains." },
  punycode_domain: { score: -30, desc: "Domain uses special characters (Punycode) often used in homograph attacks." },
  invalid_url: { score: -50, desc: "URL could not be parsed correctly." },
  typosquat_domain: { score: -40, desc: "Domain is highly similar to a major brand (typosquatting)." },
  suspicious_keyword: { score: -10, desc: "URL contains a suspicious keyword often used in phishing." },
  fake_brand_keyword: { score: -30, desc: "URL contains a brand name but is not the official domain." },
  threat_feed_match: { score: -40, desc: "Community threat-intelligence feeds flagged this URL/domain as malicious." },
  multi_feed_flagged: { score: -100, desc: "URL/domain matched multiple community threat feeds (corroborated malicious signal)." },
  newly_registered_domain: { score: -30, desc: "Domain was registered within the last 30 days." },
  rdap_unavailable: { score: 0, desc: "Domain registration details could not be verified (WHOIS/RDAP lookup failed)." },
  new_ssl_certificate: { score: -15, desc: "The SSL certificate was issued very recently (within the last 7 days)." },
  recently_reissued_cert: { score: -10, desc: "Recently reissued certificate on a pre-existing domain — possible takeover or repurposing." },
  wayback_content_divergence: { score: -15, desc: "Page content differs significantly from its historic Wayback Machine archive (possible redirect hijack)." },
  visual_content_changed: { score: -15, desc: "Page layout or visual contents changed significantly from its previous audit." },
  dns_resolution_failure: { score: -20, desc: "Domain could not be resolved via DNS." },
  dns_resolution_error: { score: 0, desc: "DNS resolution check failed." },
  redirect_occurred: { score: -5, desc: "URL redirected to a different location." },
  missing_hsts: { score: -5, desc: "Missing Strict-Transport-Security header." },
  missing_csp: { score: -5, desc: "Missing Content-Security-Policy header." },
  missing_x_frame_options: { score: -5, desc: "Missing X-Frame-Options header (vulnerable to clickjacking)." },
  missing_x_content_type_options: { score: -5, desc: "Missing X-Content-Type-Options header." },
  missing_spf: { score: -10, desc: "Missing SPF DNS record (vulnerable to email spoofing)." },
  missing_dmarc: { score: -10, desc: "Missing DMARC DNS record (lacks email authentication enforcement)." },
  connection_failed: { score: -50, desc: "Failed to connect to the target URL." },
  invisible_credential_fields: { score: -40, desc: "Page contains hidden forms or password fields." },
  urgency_language: { score: -20, desc: "Page uses urgency language typical of social engineering." },
  brand_mismatch_dom: { score: -50, desc: "Page claims to be a brand but the domain does not match." },
  established_brand_verified: { score: 30, desc: "Verified established global brand domain." },
  dom_analysis_failed: { score: 0, desc: "Failed to parse page DOM." }
};

exports.calculateScore = (factors) => {
  let score = 100;
  const reasons = [];

  for (const factor of factors) {
    const rule = RULE_WEIGHTS[factor.id];
    if (rule) {
      score += rule.score;
      if (rule.score !== 0) {
        if (factor.detail) {
          reasons.push(`${rule.desc} (Looks like ${factor.detail})`);
        } else {
          reasons.push(rule.desc);
        }
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
};
