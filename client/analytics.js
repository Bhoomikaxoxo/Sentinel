// Vercel Web Analytics Integration
// This file initializes Vercel Web Analytics for the application

import { inject } from 'https://cdn.jsdelivr.net/npm/@vercel/analytics@2/+esm';

// Initialize analytics
// The inject function automatically handles script loading and tracking
inject({
  mode: 'auto', // Automatically detects development vs production
  debug: false   // Set to true for debugging
});

// Note: Page views are tracked automatically
// For custom events, you can import and use the track function:
// import { track } from 'https://cdn.jsdelivr.net/npm/@vercel/analytics@2/+esm';
// track('event_name', { property: 'value' });
