const TOP_DOMAINS = [
  'google.com', 'youtube.com', 'netflix.com', 'amazon.com', 'apple.com', 'microsoft.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'github.com',
  'wikipedia.org', 'paypal.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com',
  'cisco.com', 'adobe.com', 'cloudflare.com', 'godaddy.com', 'reddit.com', 'pinterest.com',
  'twitch.tv', 'zoom.us', 'salesforce.com', 'spotify.com', 'dropbox.com', 'ebay.com',
  'vimeo.com', 'tumblr.com', 'wordpress.com', 'idk.com'
];

exports.TOP_DOMAINS = TOP_DOMAINS;

exports.isEstablishedDomain = (hostname) => {
  if (!hostname) return false;
  let cleanHost = hostname.toLowerCase().trim();
  if (cleanHost.startsWith('www.')) cleanHost = cleanHost.slice(4);

  for (const domain of TOP_DOMAINS) {
    if (cleanHost === domain || cleanHost.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
};

function getEditDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}

exports.checkTyposquat = (urlString) => {
  const factors = [];
  try {
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'https://' + urlString;
    }
    const url = new URL(urlString);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);

    for (let domain of TOP_DOMAINS) {
      if (hostname !== domain) {
        const distance = getEditDistance(hostname, domain);
        if (distance === 1 || distance === 2) {
          factors.push({ id: 'typosquat_domain', detail: domain });
          break;
        }
      }
    }
  } catch(e) {}
  return factors;
};
