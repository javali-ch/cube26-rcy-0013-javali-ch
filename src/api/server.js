/**
 * REMA - Recovery Manager
 * Main HTTP Server & Application Entry Point
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseManager } = require('../core/database');
const BatchProcessor = require('../core/batchProcessor');
const createRouter = require('./routes');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'rema.sqlite');
const dbManager = new DatabaseManager(dbPath);
const batchProcessor = new BatchProcessor(dbManager);

// Auto-seed reference dataset if database is fresh
function ensureSeeded() {
  const alphaRepo = dbManager.getTenantContext('org_demo_alpha');
  const existing = alphaRepo.listCharges();
  if (existing.length === 0) {
    console.log('[REMA] Ingesting reference dataset into database...');
    batchProcessor.ingestUpstreamData(dataDir);
    const feePath = path.join(dataDir, 'fee_report_sample.csv');
    if (fs.existsSync(feePath)) {
      batchProcessor.ingestFeeReport(feePath);
      console.log('[REMA] Reference dataset ingested successfully.');
      console.log('[REMA] Pre-processing charges for org_demo_alpha and org_demo_bravo...');
      batchProcessor.processAllCharges('org_demo_alpha');
      batchProcessor.processAllCharges('org_demo_bravo');
      console.log('[REMA] Processing complete.');
    }
  }
}

ensureSeeded();

// Attach API Routes
app.use('/api', createRouter(dbManager, batchProcessor));

// Serve Frontend client static files
const clientPath = fs.existsSync(path.join(__dirname, '..', '..', 'client', 'dist'))
  ? path.join(__dirname, '..', '..', 'client', 'dist')
  : path.join(__dirname, '..', '..', 'client');

if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[REMA Error]', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  REMA — Recovery Manager API Server running on :${PORT}`);
    console.log(`  Tenants supported: org_demo_alpha, org_demo_bravo`);
    console.log(`======================================================\n`);
  });
}

module.exports = { app, dbManager, batchProcessor };
