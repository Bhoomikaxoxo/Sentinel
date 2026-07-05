const express = require('express');
const cors = require('cors');
const path = require('path');
const scanRoute = require('./routes/scan');
const casesRoute = require('./routes/cases');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.use('/api/scan', scanRoute);
app.use('/api/cases', casesRoute);

const threatFeedService = require('./services/threatFeedService');
const monitorService = require('./services/monitorService');

// Initialize threat intelligence feeds
threatFeedService.initFeeds();
threatFeedService.startScheduler();

// Start background watchlist monitoring
monitorService.startMonitoring();

app.listen(PORT, () => {
  console.log(`Sentinel AI Server running on port ${PORT}`);
});
