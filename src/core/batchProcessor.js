/**
 * REMA - Recovery Manager
 * High-Performance Batch Processing Pipeline & Ingestion Orchestrator
 */

const fs = require('node:fs');
const readline = require('node:readline');
const Normalizer = require('./normalizer');
const Matcher = require('./matcher');
const EvidenceGraph = require('./evidenceGraph');
const DecisionEngine = require('./decisionEngine');
const ClaimBuilder = require('./claimBuilder');
const ReviewQueueManager = require('./reviewQueue');
const AuditTrailService = require('./auditTrail');
const { DecisionVerdict } = require('./types');

class BatchProcessor {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.decisionEngine = new DecisionEngine();
  }

  /**
   * Helper to parse CSV rows into plain objects
   */
  static parseCsv(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      // Split on comma, respecting quotes if needed
      const rawCols = [];
      let inQuotes = false;
      let cur = '';
      const line = lines[i];

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          rawCols.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      rawCols.push(cur.trim());

      const record = {};
      for (let h = 0; h < headers.length; h++) {
        record[headers[h]] = rawCols[h] !== undefined ? rawCols[h] : '';
      }
      records.push(record);
    }

    return records;
  }

  /**
   * Ingests upstream data files (Receiving, Prep, Pack, Returns) into tenant stores
   */
  ingestUpstreamData(baseDataDir) {
    const receivingPath = `${baseDataDir}/upstream/receiving_sample.csv`;
    const prepPath = `${baseDataDir}/upstream/prep_sample.csv`;
    const packPath = `${baseDataDir}/upstream/pack_sample.csv`;
    const returnsPath = `${baseDataDir}/upstream/returns_sample.csv`;

    const counts = { receiving: 0, prep: 0, pack: 0, returns: 0, units: 0 };

    // 1. Receiving
    if (fs.existsSync(receivingPath)) {
      const rcvRows = BatchProcessor.parseCsv(receivingPath);
      for (const row of rcvRows) {
        if (!row.org_id) continue;
        const tenantRepo = this.dbManager.getTenantContext(row.org_id);
        const normalized = Normalizer.normalizeReceiving(row);
        tenantRepo.insertEvidence(normalized);
        tenantRepo.upsertUnit({
          unit_id: row.unit_id,
          org_id: row.org_id,
          sku: row.sku,
          asin: row.asin,
          product_title: row.product_title
        });
        counts.receiving++;
        counts.units++;
      }
    }

    // 2. Prep
    if (fs.existsSync(prepPath)) {
      const prepRows = BatchProcessor.parseCsv(prepPath);
      for (const row of prepRows) {
        if (!row.org_id) continue;
        const tenantRepo = this.dbManager.getTenantContext(row.org_id);
        const normalized = Normalizer.normalizePrep(row);
        tenantRepo.insertEvidence(normalized);
        tenantRepo.upsertUnit({
          unit_id: row.unit_id,
          org_id: row.org_id,
          sku: row.sku,
          asin: row.asin,
          fnsku: row.fnsku
        });
        counts.prep++;
      }
    }

    // 3. Pack
    if (fs.existsSync(packPath)) {
      const packRows = BatchProcessor.parseCsv(packPath);
      for (const row of packRows) {
        if (!row.org_id) continue;
        const tenantRepo = this.dbManager.getTenantContext(row.org_id);
        const normalized = Normalizer.normalizePack(row);
        tenantRepo.insertEvidence(normalized);
        counts.pack++;
      }
    }

    // 4. Returns
    if (fs.existsSync(returnsPath)) {
      const returnsRows = BatchProcessor.parseCsv(returnsPath);
      for (const row of returnsRows) {
        if (!row.org_id) continue;
        const tenantRepo = this.dbManager.getTenantContext(row.org_id);
        const normalized = Normalizer.normalizeReturns(row);
        tenantRepo.insertEvidence(normalized);
        counts.returns++;
      }
    }

    return counts;
  }

  /**
   * Ingests a fee report CSV and stores normalized charges
   */
  ingestFeeReport(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const rows = BatchProcessor.parseCsv(filePath);
    const ingested = [];

    for (const raw of rows) {
      const normalized = Normalizer.normalizeCharge(raw, filePath);
      if (normalized.org_id) {
        const tenantRepo = this.dbManager.getTenantContext(normalized.org_id);
        tenantRepo.insertCharge(normalized);
        AuditTrailService.recordEvent(
          tenantRepo,
          'CHARGE_INGESTED',
          normalized.charge_id,
          normalized.unit_id,
          null,
          {
            charge_type: normalized.charge_type,
            amount_usd: normalized.amount_usd,
            posted_date: normalized.posted_date,
            parsing_status: normalized.parsing_status
          }
        );
        ingested.push(normalized);
      }
    }

    return ingested;
  }

  /**
   * Processes a single charge through the entire pipeline with audit tracking
   */
  processCharge(charge, tenantRepo) {
    // 1. Audit: Charge Ingestion/Normalization verified
    AuditTrailService.recordEvent(
      tenantRepo,
      'CHARGE_NORMALIZED',
      charge.charge_id,
      charge.unit_id,
      null,
      { parsing_status: charge.parsing_status, amount_usd: charge.amount_usd }
    );

    // 2. Unit Matching
    const matchResult = Matcher.matchChargeToUnit(charge, tenantRepo);
    AuditTrailService.recordEvent(
      tenantRepo,
      'UNIT_MATCHED',
      charge.charge_id,
      matchResult.matched_unit_id,
      null,
      {
        match_status: matchResult.match_status,
        match_method: matchResult.match_method,
        ambiguity_flags: matchResult.ambiguity_flags
      }
    );

    // 3. Evidence Graph Assembly
    const evidenceGraph = EvidenceGraph.buildForUnit(matchResult.matched_unit_id, tenantRepo);
    const relevantEvidence = evidenceGraph.selectRelevantEvidence(charge.charge_type);
    AuditTrailService.recordEvent(
      tenantRepo,
      'EVIDENCE_RETRIEVED',
      charge.charge_id,
      matchResult.matched_unit_id,
      null,
      {
        coverage_status: relevantEvidence.coverage_status,
        available_stages: relevantEvidence.available_stages,
        missing_stages: relevantEvidence.missing_stages
      }
    );

    // 4. Decision Engine Evaluation
    const decision = this.decisionEngine.evaluate(charge, matchResult, evidenceGraph, tenantRepo);
    tenantRepo.insertDecision(decision);

    AuditTrailService.recordEvent(
      tenantRepo,
      'DECISION_PRODUCED',
      charge.charge_id,
      decision.unit_id,
      decision.decision_id,
      {
        verdict: decision.verdict,
        amount_usd: decision.amount_usd,
        reason: decision.reason,
        contradiction_status: decision.contradiction_status,
        rule_version: decision.rule_version
      }
    );

    // 5. Outcome Handling: CLAIM -> Build Claim Package; UNCERTAIN/Review -> Enqueue Review
    let claim = null;
    let review = null;

    if (decision.verdict === DecisionVerdict.CLAIM) {
      tenantRepo.deleteReviewForCharge(charge.charge_id);
      claim = ClaimBuilder.buildClaim(charge, decision, evidenceGraph);
      tenantRepo.insertClaim(claim);
      AuditTrailService.recordEvent(
        tenantRepo,
        'CLAIM_CREATED',
        charge.charge_id,
        decision.unit_id,
        decision.decision_id,
        {
          claim_id: claim.claim_id,
          amount_usd: claim.amount_usd,
          contradiction_summary: claim.contradiction_summary
        }
      );
    } else if (decision.verdict === DecisionVerdict.UNCERTAIN || decision.review_required) {
      tenantRepo.deleteClaimForCharge(charge.charge_id);
      review = ReviewQueueManager.enqueueReview(charge, decision, tenantRepo);
    } else {
      tenantRepo.deleteClaimForCharge(charge.charge_id);
      tenantRepo.deleteReviewForCharge(charge.charge_id);
    }


    return {
      charge,
      matchResult,
      evidenceGraph,
      decision,
      claim,
      review
    };
  }

  /**
   * Executes batch processing across all ingested charges for an organization
   */
  processAllCharges(orgId) {
    const startTime = Date.now();
    const tenantRepo = this.dbManager.getTenantContext(orgId);
    const charges = tenantRepo.listCharges();

    const results = {
      run_id: `RUN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      org_id: orgId,
      total_charges: charges.length,
      claims_count: 0,
      no_claims_count: 0,
      uncertain_count: 0,
      claim_amount_usd: 0.00,
      claims: [],
      no_claims: [],
      uncertains: [],
      latency_ms: 0
    };

    for (const charge of charges) {
      const out = this.processCharge(charge, tenantRepo);
      if (out.decision.verdict === DecisionVerdict.CLAIM) {
        results.claims_count++;
        results.claim_amount_usd = parseFloat((results.claim_amount_usd + out.decision.amount_usd).toFixed(2));
        results.claims.push(out);
      } else if (out.decision.verdict === DecisionVerdict.NO_CLAIM) {
        results.no_claims_count++;
        results.no_claims.push(out);
      } else {
        results.uncertain_count++;
        results.uncertains.push(out);
      }
    }

    results.latency_ms = Date.now() - startTime;
    tenantRepo.logRun({
      run_id: results.run_id,
      total_charges: results.total_charges,
      claims_count: results.claims_count,
      no_claims_count: results.no_claims_count,
      uncertain_count: results.uncertain_count,
      claim_amount_usd: results.claim_amount_usd,
      latency_ms: results.latency_ms
    });

    return results;
  }
}

module.exports = BatchProcessor;
