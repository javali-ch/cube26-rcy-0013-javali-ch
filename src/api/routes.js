/**
 * REMA - Recovery Manager
 * REST API Routes with Multi-Tenant Scoping and Validation
 */

const express = require('express');
const path = require('node:path');
const Normalizer = require('../core/normalizer');
const EvaluationEngine = require('../core/evaluation');

function createRouter(dbManager, batchProcessor) {
  const router = express.Router();

  // Middleware: Extract tenant organization
  router.use((req, res, next) => {
    const orgId = req.headers['x-tenant-id'] || req.query.org_id || 'org_demo_alpha';
    try {
      req.tenantRepo = dbManager.getTenantContext(orgId);
      req.orgId = orgId;
      next();
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 1. GET /api/metrics - Financial recovery metrics & KPI summary
  router.get('/metrics', (req, res) => {
    try {
      const metrics = req.tenantRepo.getMetrics();
      res.json({ success: true, data: metrics });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. POST /api/charges/ingest - Ingest raw charge records
  router.post('/charges/ingest', express.json(), (req, res) => {
    try {
      const { charges, source_report } = req.body;
      if (!Array.isArray(charges)) {
        return res.status(400).json({ success: false, error: 'Expected charges array in request body' });
      }

      const ingested = [];
      for (const raw of charges) {
        // Enforce active tenant org_id if not present
        if (!raw.org_id) raw.org_id = req.orgId;
        const normalized = Normalizer.normalizeCharge(raw, source_report || 'api_ingest');
        req.tenantRepo.insertCharge(normalized);
        ingested.push(normalized);
      }

      res.status(201).json({
        success: true,
        count: ingested.length,
        ingested
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. GET /api/charges - List charges with optional filters
  router.get('/charges', (req, res) => {
    try {
      const { charge_type, unit_id } = req.query;
      const charges = req.tenantRepo.listCharges({ charge_type, unit_id });
      res.json({ success: true, count: charges.length, data: charges });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. GET /api/charges/:id - Get specific charge details
  router.get('/charges/:id', (req, res) => {
    try {
      const charge = req.tenantRepo.getCharge(req.params.id);
      if (!charge) {
        return res.status(404).json({ success: false, error: `Charge '${req.params.id}' not found` });
      }
      res.json({ success: true, data: charge });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. GET /api/charges/:id/evidence - Retrieve upstream evidence graph for charge's unit
  router.get('/charges/:id/evidence', (req, res) => {
    try {
      const charge = req.tenantRepo.getCharge(req.params.id);
      if (!charge) {
        return res.status(404).json({ success: false, error: `Charge '${req.params.id}' not found` });
      }

      const EvidenceGraph = require('../core/evidenceGraph');
      const graph = EvidenceGraph.buildForUnit(charge.unit_id, req.tenantRepo);
      const relevant = graph.selectRelevantEvidence(charge.charge_type);

      res.json({
        success: true,
        data: {
          charge_id: charge.charge_id,
          unit_id: charge.unit_id,
          graph: {
            receiving: graph.receiving,
            prep: graph.prep,
            pack: graph.pack,
            returns: graph.returns,
            record_reliability: graph.recordReliability,
            cross_source_consistency: graph.crossSourceConsistency
          },
          relevant_evidence: relevant
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. GET /api/charges/:id/decision - Retrieve decision for a charge
  router.get('/charges/:id/decision', (req, res) => {
    try {
      const decision = req.tenantRepo.getDecisionForCharge(req.params.id);
      if (!decision) {
        return res.status(404).json({ success: false, error: `No decision found for charge '${req.params.id}'` });
      }
      res.json({ success: true, data: decision });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. GET /api/claims - List all generated recovery claims
  router.get('/claims', (req, res) => {
    try {
      const claims = req.tenantRepo.listClaims();
      res.json({ success: true, count: claims.length, data: claims });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. GET /api/claims/:id - Get structured claim detail
  router.get('/claims/:id', (req, res) => {
    try {
      const claim = req.tenantRepo.getClaim(req.params.id);
      if (!claim) {
        return res.status(404).json({ success: false, error: `Claim '${req.params.id}' not found` });
      }
      res.json({ success: true, data: claim });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. GET /api/reviews - List human review queue items
  router.get('/reviews', (req, res) => {
    try {
      const { status } = req.query;
      const reviews = req.tenantRepo.listReviews(status);
      res.json({ success: true, count: reviews.length, data: reviews });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. GET /api/reviews/:id - Get specific review item
  router.get('/reviews/:id', (req, res) => {
    try {
      const review = req.tenantRepo.getReview(req.params.id);
      if (!review) {
        return res.status(404).json({ success: false, error: `Review item '${req.params.id}' not found` });
      }
      res.json({ success: true, data: review });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. POST /api/reviews/:id/resolve - Resolve a review item with human operator notes
  router.post('/reviews/:id/resolve', express.json(), (req, res) => {
    try {
      const { resolution_notes, resolved_by } = req.body;
      if (!resolution_notes) {
        return res.status(400).json({ success: false, error: 'Resolution notes are required' });
      }

      req.tenantRepo.resolveReview(req.params.id, resolution_notes, resolved_by || 'OPERATOR');
      const updated = req.tenantRepo.getReview(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. GET /api/audit/:decisionId - Trace chronological decision lineage
  router.get('/audit/:decisionId', (req, res) => {
    try {
      const trail = req.tenantRepo.getAuditTrail(req.params.decisionId);
      res.json({ success: true, count: trail.length, data: trail });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. POST /api/process/run - Trigger batch processing pipeline
  router.post('/process/run', (req, res) => {
    try {
      const runResults = batchProcessor.processAllCharges(req.orgId);
      const metrics = EvaluationEngine.evaluateBatch(runResults, req.tenantRepo);
      res.json({
        success: true,
        data: {
          run: runResults,
          evaluation: metrics
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. GET /api/evaluation/synthetic - Run the 13 synthetic edge cases benchmark
  router.get('/evaluation/synthetic', (req, res) => {
    try {
      const benchmarkResults = EvaluationEngine.runSyntheticBenchmark(dbManager);
      res.json({ success: true, data: benchmarkResults });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
