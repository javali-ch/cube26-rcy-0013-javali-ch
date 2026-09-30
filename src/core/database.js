/**
 * REMA - Recovery Manager
 * Database Layer with Row-Level Multi-Tenancy Isolation
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

class DatabaseManager {
  constructor(dbPath = null) {
    if (!dbPath) {
      const dataDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      dbPath = path.join(dataDir, 'rema.sqlite');
    }
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      -- 1. Units Table
      CREATE TABLE IF NOT EXISTS units (
        unit_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        sku TEXT,
        asin TEXT,
        fnsku TEXT,
        product_title TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        PRIMARY KEY (unit_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_units_org ON units(org_id);
      CREATE INDEX IF NOT EXISTS idx_units_sku ON units(org_id, sku);

      -- 2. Charges Table (Fee / Reimbursement records)
      CREATE TABLE IF NOT EXISTS charges (
        charge_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        unit_id TEXT,
        sku TEXT,
        fnsku TEXT,
        fba_shipment_id TEXT,
        order_id TEXT,
        charge_type TEXT NOT NULL,
        report_type TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        amount_usd REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        posted_date TEXT NOT NULL,
        raw_record TEXT NOT NULL,
        parsing_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (charge_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_charges_org ON charges(org_id);
      CREATE INDEX IF NOT EXISTS idx_charges_unit ON charges(org_id, unit_id);
      CREATE INDEX IF NOT EXISTS idx_charges_type ON charges(org_id, charge_type);

      -- 3. Upstream Evidence Table (Receiving, Prep, Pack, Returns)
      CREATE TABLE IF NOT EXISTS upstream_evidence (
        evidence_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        operator_id TEXT,
        captured_at TEXT NOT NULL,
        photo_refs TEXT,
        raw_record TEXT NOT NULL,
        normalized_data TEXT NOT NULL,
        reliability_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (evidence_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_org ON upstream_evidence(org_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_unit ON upstream_evidence(org_id, unit_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_stage ON upstream_evidence(org_id, stage);

      -- 4. Decisions Table
      CREATE TABLE IF NOT EXISTS decisions (
        decision_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        charge_id TEXT NOT NULL,
        unit_id TEXT,
        verdict TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        reason TEXT NOT NULL,
        evidence_coverage TEXT NOT NULL,
        evidence_reliability TEXT NOT NULL,
        contradiction_status TEXT NOT NULL,
        rule_version TEXT NOT NULL,
        supporting_evidence_ids TEXT NOT NULL,
        missing_evidence TEXT NOT NULL,
        conflicts TEXT NOT NULL,
        review_required INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        reason_code TEXT,
        explanation TEXT,
        cannot_claim INTEGER DEFAULT 0,
        cannot_claim_reason TEXT,
        match_method TEXT,
        supporting_evidence TEXT,
        authoritative_rule TEXT,
        eligibility_result TEXT,
        PRIMARY KEY (decision_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_org ON decisions(org_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_charge ON decisions(org_id, charge_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_verdict ON decisions(org_id, verdict);

      -- 5. Claims Table
      CREATE TABLE IF NOT EXISTS claims (
        claim_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        charge_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        charge_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        supporting_evidence_ids TEXT NOT NULL,
        evidence_summary TEXT NOT NULL,
        contradiction_summary TEXT NOT NULL,
        coverage_summary TEXT NOT NULL,
        reliability_summary TEXT NOT NULL,
        rule_version TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        created_at TEXT NOT NULL,
        PRIMARY KEY (claim_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_claims_org ON claims(org_id);
      CREATE INDEX IF NOT EXISTS idx_claims_unit ON claims(org_id, unit_id);

      -- 6. Human Review Queue Table
      CREATE TABLE IF NOT EXISTS reviews (
        review_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        charge_id TEXT NOT NULL,
        unit_id TEXT,
        decision_id TEXT,
        issue_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        missing_evidence TEXT,
        conflicting_evidence TEXT,
        suggested_action TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        resolution_notes TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (review_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_org ON reviews(org_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(org_id, status);

      -- 7. Audit Trail Table
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        charge_id TEXT,
        unit_id TEXT,
        decision_id TEXT,
        event_type TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (audit_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id);
      CREATE INDEX IF NOT EXISTS idx_audit_charge ON audit_log(org_id, charge_id);
      CREATE INDEX IF NOT EXISTS idx_audit_unit ON audit_log(org_id, unit_id);

      -- 8. Processing Runs Table
      CREATE TABLE IF NOT EXISTS processing_runs (
        run_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        total_charges INTEGER NOT NULL,
        claims_count INTEGER NOT NULL,
        no_claims_count INTEGER NOT NULL,
        uncertain_count INTEGER NOT NULL,
        claim_amount_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_runs_org ON processing_runs(org_id);

      -- 9. Optional Manual Evidence Table
      CREATE TABLE IF NOT EXISTS manual_evidence (
        evidence_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        charge_id TEXT NOT NULL,
        unit_id TEXT,
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        description TEXT,
        file_data TEXT,
        source TEXT DEFAULT 'Seller / Manual Upload',
        created_at TEXT NOT NULL,
        PRIMARY KEY (evidence_id, org_id)
      );
      CREATE INDEX IF NOT EXISTS idx_manual_ev_org ON manual_evidence(org_id);
      CREATE INDEX IF NOT EXISTS idx_manual_ev_charge ON manual_evidence(org_id, charge_id);
      CREATE INDEX IF NOT EXISTS idx_manual_ev_unit ON manual_evidence(org_id, unit_id);
    `);

    // Safe dynamic migration for existing databases
    const extraCols = [
      'reason_code TEXT',
      'explanation TEXT',
      'cannot_claim INTEGER DEFAULT 0',
      'cannot_claim_reason TEXT',
      'match_method TEXT',
      'supporting_evidence TEXT',
      'authoritative_rule TEXT',
      'eligibility_result TEXT',
      'claim_amount_usd REAL DEFAULT 0.0',
      'total_charge_amount REAL'
    ];
    for (const col of extraCols) {
      try {
        this.db.exec(`ALTER TABLE decisions ADD COLUMN ${col}`);
      } catch (e) {
        // column already exists
      }
    }

    const claimExtraCols = [
      'claim_amount_usd REAL DEFAULT 0.0',
      'total_charge_amount REAL'
    ];
    for (const col of claimExtraCols) {
      try {
        this.db.exec(`ALTER TABLE claims ADD COLUMN ${col}`);
      } catch (e) {
        // column already exists
      }
    }
  }

  /**
   * Scopes all database queries to a specific org_id (Tenant Isolation)
   */
  getTenantContext(orgId) {
    if (!orgId || typeof orgId !== 'string') {
      throw new Error('Tenant context requires a valid org_id');
    }
    return new TenantRepository(this.db, orgId);
  }

  close() {
    this.db.close();
  }
}

/**
 * Tenant-scoped Repository implementing Row-Level Security
 */
class TenantRepository {
  constructor(db, orgId) {
    this.db = db;
    this.orgId = orgId;
  }

  // --- UNITS ---
  upsertUnit(unit) {
    const stmt = this.db.prepare(`
      INSERT INTO units (unit_id, org_id, sku, asin, fnsku, product_title, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(unit_id, org_id) DO UPDATE SET
        sku = excluded.sku,
        asin = excluded.asin,
        fnsku = excluded.fnsku,
        product_title = excluded.product_title,
        status = excluded.status
    `);
    stmt.run(
      unit.unit_id,
      this.orgId,
      unit.sku || null,
      unit.asin || null,
      unit.fnsku || null,
      unit.product_title || null,
      unit.status || 'ACTIVE',
      unit.created_at || new Date().toISOString()
    );
  }

  getUnit(unitId) {
    const stmt = this.db.prepare(`
      SELECT * FROM units WHERE unit_id = ? AND org_id = ?
    `);
    return stmt.get(unitId, this.orgId);
  }

  listUnits() {
    const stmt = this.db.prepare(`
      SELECT * FROM units WHERE org_id = ? ORDER BY unit_id ASC
    `);
    return stmt.all(this.orgId);
  }

  // --- CHARGES ---
  insertCharge(charge) {
    const stmt = this.db.prepare(`
      INSERT INTO charges (
        charge_id, org_id, unit_id, sku, fnsku, fba_shipment_id, order_id,
        charge_type, report_type, quantity, amount_usd, currency, posted_date,
        raw_record, parsing_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(charge_id, org_id) DO UPDATE SET
        unit_id = excluded.unit_id,
        amount_usd = excluded.amount_usd,
        parsing_status = excluded.parsing_status
    `);
    stmt.run(
      charge.charge_id,
      this.orgId,
      charge.unit_id || null,
      charge.sku || null,
      charge.fnsku || null,
      charge.fba_shipment_id || null,
      charge.order_id || null,
      charge.charge_type,
      charge.report_type,
      charge.quantity || 1,
      charge.amount_usd,
      charge.currency || 'USD',
      charge.posted_date,
      JSON.stringify(charge.raw_record || {}),
      charge.parsing_status || 'PARSED',
      charge.created_at || new Date().toISOString()
    );
  }

  getCharge(chargeId) {
    const stmt = this.db.prepare(`
      SELECT * FROM charges WHERE charge_id = ? AND org_id = ?
    `);
    const row = stmt.get(chargeId, this.orgId);
    if (!row) return null;
    return { ...row, raw_record: JSON.parse(row.raw_record) };
  }

  listCharges(filters = {}) {
    let sql = `SELECT * FROM charges WHERE org_id = ?`;
    const params = [this.orgId];

    if (filters.charge_type) {
      sql += ` AND charge_type = ?`;
      params.push(filters.charge_type);
    }
    if (filters.unit_id) {
      sql += ` AND unit_id = ?`;
      params.push(filters.unit_id);
    }
    sql += ` ORDER BY posted_date DESC, charge_id ASC`;
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => ({ ...r, raw_record: JSON.parse(r.raw_record) }));
  }

  // --- UPSTREAM EVIDENCE ---
  insertEvidence(evidence) {
    const stmt = this.db.prepare(`
      INSERT INTO upstream_evidence (
        evidence_id, org_id, unit_id, stage, operator_id, captured_at,
        photo_refs, raw_record, normalized_data, reliability_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(evidence_id, org_id) DO UPDATE SET
        normalized_data = excluded.normalized_data,
        reliability_status = excluded.reliability_status
    `);
    stmt.run(
      evidence.evidence_id,
      this.orgId,
      evidence.unit_id,
      evidence.stage,
      evidence.operator_id || null,
      evidence.captured_at,
      evidence.photo_refs || null,
      JSON.stringify(evidence.raw_record || {}),
      JSON.stringify(evidence.normalized_data || {}),
      evidence.reliability_status || 'RELIABLE',
      evidence.created_at || new Date().toISOString()
    );
  }

  getEvidenceForUnit(unitId) {
    const stmt = this.db.prepare(`
      SELECT * FROM upstream_evidence WHERE unit_id = ? AND org_id = ? ORDER BY captured_at ASC
    `);
    const rows = stmt.all(unitId, this.orgId);
    return rows.map(r => ({
      ...r,
      raw_record: JSON.parse(r.raw_record),
      normalized_data: JSON.parse(r.normalized_data)
    }));
  }

  _hydrateDecision(r) {
    if (!r) return null;
    let authRule = null;
    let eligRes = null;
    let supEv = [];
    try { if (r.authoritative_rule) authRule = JSON.parse(r.authoritative_rule); } catch (e) {}
    try { if (r.eligibility_result) eligRes = JSON.parse(r.eligibility_result); } catch (e) {}
    try { if (r.supporting_evidence) supEv = JSON.parse(r.supporting_evidence); } catch (e) {}
    const cannotClaim = r.cannot_claim === 1 || r.cannot_claim === true || r.verdict !== 'CLAIM';
    const totalChargeAmount = r.total_charge_amount !== undefined && r.total_charge_amount !== null
      ? r.total_charge_amount
      : r.amount_usd;
    const claimVal = r.claim_amount_usd !== undefined && r.claim_amount_usd !== null
      ? r.claim_amount_usd
      : (r.verdict === 'CLAIM' ? r.amount_usd : 0.00);

    return {
      ...r,
      amount_usd: totalChargeAmount,
      total_charge_amount: totalChargeAmount,
      charge_amount_usd: totalChargeAmount,
      claim_amount_usd: claimVal,
      recoverable_amount_usd: claimVal,
      evidence_coverage: JSON.parse(r.evidence_coverage || '{}'),
      evidence_reliability: JSON.parse(r.evidence_reliability || '{}'),
      supporting_evidence_ids: JSON.parse(r.supporting_evidence_ids || '[]'),
      missing_evidence: JSON.parse(r.missing_evidence || '[]'),
      conflicts: JSON.parse(r.conflicts || '[]'),
      reasonCode: r.reason_code || (r.verdict === 'CLAIM' ? 'RECOVERABLE_CLAIM' : 'UNCERTAIN_OPERATIONAL_EVIDENCE'),
      reason_code: r.reason_code || (r.verdict === 'CLAIM' ? 'RECOVERABLE_CLAIM' : 'UNCERTAIN_OPERATIONAL_EVIDENCE'),
      explanation: r.explanation || r.reason,
      cannotClaim,
      cannot_claim: cannotClaim,
      cannotClaimReason: r.cannot_claim_reason || (cannotClaim ? r.reason : null),
      cannot_claim_reason: r.cannot_claim_reason || (cannotClaim ? r.reason : null),
      matchMethod: r.match_method || 'UNIT_ID',
      match_method: r.match_method || 'UNIT_ID',
      supportingEvidence: supEv,
      supporting_evidence: supEv,
      authoritativeRule: authRule,
      authoritative_rule: authRule,
      eligibilityResult: eligRes,
      eligibility_result: eligRes
    };
  }

  // --- DECISIONS ---
  insertDecision(decision) {
    const totalChargeAmount = decision.total_charge_amount !== undefined && decision.total_charge_amount !== null
      ? decision.total_charge_amount
      : decision.amount_usd;
    const claimAmount = decision.claim_amount_usd !== undefined && decision.claim_amount_usd !== null
      ? decision.claim_amount_usd
      : (decision.verdict === 'CLAIM' ? decision.amount_usd : 0.00);

    const stmt = this.db.prepare(`
      INSERT INTO decisions (
        decision_id, org_id, charge_id, unit_id, verdict, amount_usd,
        currency, reason, evidence_coverage, evidence_reliability,
        contradiction_status, rule_version, supporting_evidence_ids,
        missing_evidence, conflicts, review_required, created_at,
        reason_code, explanation, cannot_claim, cannot_claim_reason,
        match_method, supporting_evidence, authoritative_rule, eligibility_result,
        claim_amount_usd, total_charge_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(decision_id, org_id) DO UPDATE SET
        verdict = excluded.verdict,
        amount_usd = excluded.amount_usd,
        reason = excluded.reason,
        contradiction_status = excluded.contradiction_status,
        evidence_coverage = excluded.evidence_coverage,
        evidence_reliability = excluded.evidence_reliability,
        supporting_evidence_ids = excluded.supporting_evidence_ids,
        missing_evidence = excluded.missing_evidence,
        conflicts = excluded.conflicts,
        review_required = excluded.review_required,
        created_at = excluded.created_at,
        reason_code = excluded.reason_code,
        explanation = excluded.explanation,
        cannot_claim = excluded.cannot_claim,
        cannot_claim_reason = excluded.cannot_claim_reason,
        match_method = excluded.match_method,
        supporting_evidence = excluded.supporting_evidence,
        authoritative_rule = excluded.authoritative_rule,
        eligibility_result = excluded.eligibility_result,
        claim_amount_usd = excluded.claim_amount_usd,
        total_charge_amount = excluded.total_charge_amount
    `);

    stmt.run(
      decision.decision_id,
      this.orgId,
      decision.charge_id,
      decision.unit_id || null,
      decision.verdict,
      totalChargeAmount,
      decision.currency || 'USD',
      decision.reason,
      JSON.stringify(decision.evidence_coverage || {}),
      JSON.stringify(decision.evidence_reliability || {}),
      decision.contradiction_status,
      decision.rule_version,
      JSON.stringify(decision.supporting_evidence_ids || []),
      JSON.stringify(decision.missing_evidence || []),
      JSON.stringify(decision.conflicts || []),
      decision.review_required ? 1 : 0,
      decision.created_at || new Date().toISOString(),
      decision.reasonCode || decision.reason_code || null,
      decision.explanation || decision.reason || null,
      (decision.cannotClaim || decision.cannot_claim) ? 1 : 0,
      decision.cannotClaimReason || decision.cannot_claim_reason || null,
      decision.matchMethod || decision.match_method || 'UNIT_ID',
      JSON.stringify(decision.supportingEvidence || decision.supporting_evidence || []),
      JSON.stringify(decision.authoritativeRule || decision.authoritative_rule || null),
      JSON.stringify(decision.eligibilityResult || decision.eligibility_result || null),
      claimAmount,
      totalChargeAmount
    );
  }

  getDecision(decisionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM decisions WHERE decision_id = ? AND org_id = ?
    `);
    const r = stmt.get(decisionId, this.orgId);
    return this._hydrateDecision(r);
  }

  getDecisionForCharge(chargeId) {
    const stmt = this.db.prepare(`
      SELECT * FROM decisions WHERE charge_id = ? AND org_id = ?
    `);
    const r = stmt.get(chargeId, this.orgId);
    return this._hydrateDecision(r);
  }

  listDecisions() {
    const stmt = this.db.prepare(`
      SELECT * FROM decisions WHERE org_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(this.orgId).map(r => this._hydrateDecision(r));
  }

  // --- CLAIMS ---
  insertClaim(claim) {
    const totalChargeAmount = claim.total_charge_amount !== undefined && claim.total_charge_amount !== null
      ? claim.total_charge_amount
      : claim.amount_usd;
    const claimAmount = claim.claim_amount_usd !== undefined && claim.claim_amount_usd !== null
      ? claim.claim_amount_usd
      : claim.amount_usd;

    const stmt = this.db.prepare(`
      INSERT INTO claims (
        claim_id, org_id, charge_id, unit_id, amount_usd, currency,
        charge_type, reason, supporting_evidence_ids, evidence_summary,
        contradiction_summary, coverage_summary, reliability_summary,
        rule_version, status, created_at,
        claim_amount_usd, total_charge_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(claim_id, org_id) DO UPDATE SET
        amount_usd = excluded.amount_usd,
        reason = excluded.reason,
        supporting_evidence_ids = excluded.supporting_evidence_ids,
        evidence_summary = excluded.evidence_summary,
        contradiction_summary = excluded.contradiction_summary,
        coverage_summary = excluded.coverage_summary,
        reliability_summary = excluded.reliability_summary,
        status = excluded.status,
        created_at = excluded.created_at,
        claim_amount_usd = excluded.claim_amount_usd,
        total_charge_amount = excluded.total_charge_amount
    `);
    stmt.run(
      claim.claim_id,
      this.orgId,
      claim.charge_id,
      claim.unit_id,
      totalChargeAmount,
      claim.currency || 'USD',
      claim.charge_type,
      claim.reason,
      JSON.stringify(claim.supporting_evidence_ids || []),
      claim.evidence_summary,
      claim.contradiction_summary,
      claim.coverage_summary,
      claim.reliability_summary,
      claim.rule_version,
      claim.status || 'DRAFT',
      claim.created_at || new Date().toISOString(),
      claimAmount,
      totalChargeAmount
    );
  }

  deleteClaimForCharge(chargeId) {
    const stmt = this.db.prepare(`DELETE FROM claims WHERE charge_id = ? AND org_id = ?`);
    return stmt.run(chargeId, this.orgId);
  }

  getClaim(claimId) {
    const stmt = this.db.prepare(`
      SELECT * FROM claims WHERE claim_id = ? AND org_id = ?
    `);
    const r = stmt.get(claimId, this.orgId);
    if (!r) return null;
    return {
      ...r,
      supporting_evidence_ids: JSON.parse(r.supporting_evidence_ids)
    };
  }

  listClaims() {
    const stmt = this.db.prepare(`
      SELECT * FROM claims WHERE org_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(this.orgId).map(r => ({
      ...r,
      supporting_evidence_ids: JSON.parse(r.supporting_evidence_ids)
    }));
  }

  // --- REVIEWS ---
  insertReview(review) {
    const stmt = this.db.prepare(`
      INSERT INTO reviews (
        review_id, org_id, charge_id, unit_id, decision_id, issue_type,
        severity, missing_evidence, conflicting_evidence, suggested_action,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, org_id) DO UPDATE SET
        decision_id = excluded.decision_id,
        issue_type = excluded.issue_type,
        severity = excluded.severity,
        missing_evidence = excluded.missing_evidence,
        conflicting_evidence = excluded.conflicting_evidence,
        suggested_action = excluded.suggested_action,
        status = excluded.status,
        created_at = excluded.created_at
    `);
    stmt.run(
      review.review_id,
      this.orgId,
      review.charge_id,
      review.unit_id || null,
      review.decision_id || null,
      review.issue_type,
      review.severity,
      review.missing_evidence || null,
      review.conflicting_evidence || null,
      review.suggested_action,
      review.status || 'PENDING',
      review.created_at || new Date().toISOString()
    );
  }

  deleteReviewForCharge(chargeId) {
    const stmt = this.db.prepare(`DELETE FROM reviews WHERE charge_id = ? AND org_id = ? AND status = 'PENDING'`);
    return stmt.run(chargeId, this.orgId);
  }


  getReview(reviewId) {
    const stmt = this.db.prepare(`
      SELECT * FROM reviews WHERE review_id = ? AND org_id = ?
    `);
    return stmt.get(reviewId, this.orgId);
  }

  listReviews(status = null) {
    let sql = `SELECT * FROM reviews WHERE org_id = ?`;
    const params = [this.orgId];
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;
    return this.db.prepare(sql).all(...params);
  }

  resolveReview(reviewId, resolutionNotes, resolvedBy = 'OPERATOR') {
    const stmt = this.db.prepare(`
      UPDATE reviews
      SET status = 'RESOLVED', resolution_notes = ?, resolved_by = ?, resolved_at = ?
      WHERE review_id = ? AND org_id = ?
    `);
    return stmt.run(resolutionNotes, resolvedBy, new Date().toISOString(), reviewId, this.orgId);
  }

  // --- AUDIT TRAIL ---
  logAudit(event) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (
        audit_id, org_id, charge_id, unit_id, decision_id, event_type, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.audit_id || `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      this.orgId,
      event.charge_id || null,
      event.unit_id || null,
      event.decision_id || null,
      event.event_type,
      JSON.stringify(event.details || {}),
      event.created_at || new Date().toISOString()
    );
  }

  getAuditTrail(decisionId = null, chargeId = null) {
    let sql = `SELECT * FROM audit_log WHERE org_id = ?`;
    const params = [this.orgId];
    if (decisionId && chargeId) {
      sql += ` AND (decision_id = ? OR charge_id = ?)`;
      params.push(decisionId, chargeId);
    } else if (decisionId) {
      sql += ` AND decision_id = ?`;
      params.push(decisionId);
    } else if (chargeId) {
      sql += ` AND charge_id = ?`;
      params.push(chargeId);
    }
    sql += ` ORDER BY created_at ASC`;
    return this.db.prepare(sql).all(...params).map(r => ({
      ...r,
      details: JSON.parse(r.details)
    }));
  }

  // --- OPTIONAL MANUAL EVIDENCE ---
  insertManualEvidence(evidence) {
    const stmt = this.db.prepare(`
      INSERT INTO manual_evidence (
        evidence_id, org_id, charge_id, unit_id, filename,
        file_type, file_size, description, file_data, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(evidence_id, org_id) DO UPDATE SET
        description = excluded.description,
        filename = excluded.filename,
        file_type = excluded.file_type,
        file_size = excluded.file_size,
        file_data = excluded.file_data
    `);
    stmt.run(
      evidence.evidence_id || `MEV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      this.orgId,
      evidence.charge_id,
      evidence.unit_id || null,
      evidence.filename,
      evidence.file_type || 'application/octet-stream',
      evidence.file_size || 0,
      evidence.description || '',
      evidence.file_data || null,
      evidence.source || 'Seller / Manual Upload',
      evidence.created_at || new Date().toISOString()
    );
  }

  listManualEvidenceForCharge(chargeId) {
    const stmt = this.db.prepare(`
      SELECT * FROM manual_evidence WHERE org_id = ? AND charge_id = ? ORDER BY created_at ASC
    `);
    return stmt.all(this.orgId, chargeId);
  }

  listManualEvidenceForUnit(unitId) {
    return this.db.prepare(`
      SELECT * FROM manual_evidence WHERE org_id = ? AND unit_id = ? ORDER BY created_at ASC
    `).all(this.orgId, unitId);
  }

  getManualEvidence(evidenceId) {
    return this.db.prepare(`
      SELECT * FROM manual_evidence WHERE org_id = ? AND evidence_id = ?
    `).get(this.orgId, evidenceId);
  }

  // --- PROCESSING RUNS & METRICS ---
  logRun(run) {
    const stmt = this.db.prepare(`
      INSERT INTO processing_runs (
        run_id, org_id, total_charges, claims_count, no_claims_count,
        uncertain_count, claim_amount_usd, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.run_id,
      this.orgId,
      run.total_charges,
      run.claims_count,
      run.no_claims_count,
      run.uncertain_count,
      run.claim_amount_usd,
      run.latency_ms,
      run.created_at || new Date().toISOString()
    );
  }

  getLatestRun() {
    const stmt = this.db.prepare(`
      SELECT * FROM processing_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 1
    `);
    return stmt.get(this.orgId) || null;
  }

  getEvidenceCoverageSummary() {
    const charges = this.listCharges();
    const totalCharges = charges.length;

    const unitsCountStmt = this.db.prepare(`SELECT COUNT(*) as count FROM units WHERE org_id = ?`);
    const totalUnits = unitsCountStmt.get(this.orgId)?.count || 0;

    const stageCountsStmt = this.db.prepare(`
      SELECT stage, COUNT(DISTINCT unit_id) as unit_count, COUNT(*) as record_count
      FROM upstream_evidence
      WHERE org_id = ?
      GROUP BY stage
    `);
    const stageRows = stageCountsStmt.all(this.orgId);
    const stages = {
      RECEIVING: { unit_count: 0, record_count: 0, charge_count: 0 },
      PREP: { unit_count: 0, record_count: 0, charge_count: 0 },
      PACK: { unit_count: 0, record_count: 0, charge_count: 0 },
      RETURNS: { unit_count: 0, record_count: 0, charge_count: 0 }
    };
    for (const r of stageRows) {
      if (stages[r.stage]) {
        stages[r.stage].unit_count = r.unit_count;
        stages[r.stage].record_count = r.record_count;
      }
    }

    for (const c of charges) {
      if (!c.unit_id) continue;
      const evRows = this.getEvidenceForUnit(c.unit_id);
      const stageSet = new Set(evRows.map(e => e.stage));
      if (stageSet.has('RECEIVING')) stages.RECEIVING.charge_count++;
      if (stageSet.has('PREP')) stages.PREP.charge_count++;
      if (stageSet.has('PACK')) stages.PACK.charge_count++;
      if (stageSet.has('RETURNS')) stages.RETURNS.charge_count++;
    }

    return {
      total_charges: totalCharges,
      total_units: totalUnits,
      stages: {
        receiving: {
          available_charges: stages.RECEIVING.charge_count,
          total_charges: totalCharges,
          unit_count: stages.RECEIVING.unit_count,
          total_units: totalUnits
        },
        prep: {
          available_charges: stages.PREP.charge_count,
          total_charges: totalCharges,
          unit_count: stages.PREP.unit_count,
          total_units: totalUnits
        },
        pack: {
          available_charges: stages.PACK.charge_count,
          total_charges: totalCharges,
          unit_count: stages.PACK.unit_count,
          total_units: totalUnits
        },
        returns: {
          available_charges: stages.RETURNS.charge_count,
          total_charges: totalCharges,
          unit_count: stages.RETURNS.unit_count,
          total_units: totalUnits
        }
      }
    };
  }

  getMetrics() {
    const totalChargesStmt = this.db.prepare(`SELECT COUNT(*) as count, SUM(amount_usd) as total_usd FROM charges WHERE org_id = ?`);
    const chargesSummary = totalChargesStmt.get(this.orgId);
    const totalCharges = chargesSummary.count || 0;
    const totalAmount = parseFloat((chargesSummary.total_usd || 0).toFixed(2));

    // Ensure 1 authoritative decision per charge
    const decisionsStmt = this.db.prepare(`
      SELECT verdict, COUNT(*) as count, SUM(amount_usd) as total_usd, SUM(claim_amount_usd) as total_claim_usd
      FROM (
        SELECT charge_id, verdict, amount_usd, claim_amount_usd
        FROM decisions
        WHERE org_id = ?
        GROUP BY charge_id
      )
      GROUP BY verdict
    `);
    const decisionRows = decisionsStmt.all(this.orgId);

    const verdictMap = {
      CLAIM: { count: 0, total_usd: 0, total_claim_usd: 0 },
      NO_CLAIM: { count: 0, total_usd: 0, total_claim_usd: 0 },
      UNCERTAIN: { count: 0, total_usd: 0, total_claim_usd: 0 }
    };
    for (const row of decisionRows) {
      if (verdictMap[row.verdict]) {
        verdictMap[row.verdict] = {
          count: row.count,
          total_usd: parseFloat((row.total_usd || 0).toFixed(2)),
          total_claim_usd: parseFloat((row.total_claim_usd || 0).toFixed(2))
        };
      }
    }

    const claimsCount = verdictMap.CLAIM.count;
    const noClaimsCount = verdictMap.NO_CLAIM.count;
    const uncertainCount = verdictMap.UNCERTAIN.count;
    const totalDecisions = claimsCount + noClaimsCount + uncertainCount;

    // Single source of truth for review queue: pending reviews (1 per uncertain charge)
    const reviewsStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT charge_id
        FROM reviews
        WHERE org_id = ? AND status = 'PENDING'
        GROUP BY charge_id
      )
    `);
    const pendingReviewsCount = reviewsStmt.get(this.orgId)?.count || uncertainCount;

    // Dynamically calculate claim precision from verified claims
    const claims = this.listClaims();
    let correctlySupported = 0;
    const seenClaimCharges = new Set();
    for (const clm of claims) {
      if (seenClaimCharges.has(clm.charge_id)) continue;
      seenClaimCharges.add(clm.charge_id);
      if (clm.supporting_evidence_ids && clm.supporting_evidence_ids.length > 0 && ((clm.claim_amount_usd !== undefined ? clm.claim_amount_usd : clm.amount_usd) > 0)) {
        correctlySupported++;
      }
    }
    const claimPrecision = claimsCount > 0 ? (correctlySupported / claimsCount) : 1.0;

    // Mathematically consistent rates
    const effectiveTotal = totalCharges > 0 ? totalCharges : (totalDecisions > 0 ? totalDecisions : 1);
    const reviewRate = uncertainCount / effectiveTotal;
    const claimRate = claimsCount / effectiveTotal;
    const noClaimRate = noClaimsCount / effectiveTotal;

    const latestRun = this.getLatestRun();
    const evidenceCoverage = this.getEvidenceCoverageSummary();

    return {
      org_id: this.orgId,
      total_charges_reviewed: totalCharges,
      total_amount_reviewed: totalAmount,
      total_charge_amount: totalAmount,
      total_claimable_amount: verdictMap.CLAIM.total_claim_usd || verdictMap.CLAIM.total_usd,
      claims_total_charge_amount: verdictMap.CLAIM.total_usd,
      no_claims_total_charge_amount: verdictMap.NO_CLAIM.total_usd,
      uncertain_total_charge_amount: verdictMap.UNCERTAIN.total_usd,
      claims_count: claimsCount,
      no_claims_count: noClaimsCount,
      uncertain_count: uncertainCount,
      pending_reviews_count: pendingReviewsCount,
      correctly_supported_claims: correctlySupported,
      total_supported_claims_denominator: claimsCount,
      claim_precision: claimPrecision,
      review_rate: reviewRate,
      claim_rate: claimRate,
      no_claim_rate: noClaimRate,
      last_batch_run: latestRun,
      evidence_coverage: evidenceCoverage
    };
  }

}

module.exports = {
  DatabaseManager,
  TenantRepository
};
