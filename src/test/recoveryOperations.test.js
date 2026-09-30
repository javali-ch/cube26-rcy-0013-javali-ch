/**
 * REMA - Recovery Manager
 * Recovery Operations Test Suite:
 * 1. Copy / Export Dispute Package
 * 2. Optional Manual Evidence Attachment
 * 3. Re-evaluation through Existing Decision Engine
 * 4. Audit Trail Verification
 */

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseManager } = require('../core/database');
const BatchProcessor = require('../core/batchProcessor');
const { DecisionVerdict } = require('../core/types');

async function runRecoveryOpsTests() {
  console.log('====================================================');
  console.log('REMA: RECOVERY OPERATIONS & MANUAL EVIDENCE TESTS');
  console.log('====================================================\n');

  const testDbPath = path.join(__dirname, '..', '..', 'data', 'test_recovery_ops.sqlite');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const dbManager = new DatabaseManager(testDbPath);
  const processor = new BatchProcessor(dbManager);
  const baseDataDir = path.join(__dirname, '..', '..', 'data');

  // Ingest sample data
  processor.ingestUpstreamData(baseDataDir);
  const feeReportPath = path.join(baseDataDir, 'fee_report_sample.csv');
  processor.ingestFeeReport(feeReportPath);

  const orgId = 'org_demo_alpha';
  const tenantRepo = dbManager.getTenantContext(orgId);

  // Run batch processing for org_demo_alpha
  processor.processAllCharges(orgId);

  // ----------------------------------------------------
  // TEST 1: Manual Evidence Persistence & Association
  // ----------------------------------------------------
  console.log('1. Testing Optional Manual Evidence Attachment...');
  const charges = tenantRepo.listCharges();
  assert.ok(charges.length > 0, 'Should have charges available');

  const targetCharge = charges.find(c => c.charge_id === 'FEE-0085-1') || charges[0];

  const manualEvidenceRecord = {
    evidence_id: 'MEV-TEST-001',
    org_id: orgId,
    charge_id: targetCharge.charge_id,
    unit_id: targetCharge.unit_id,
    filename: 'carrier_signed_pod.pdf',
    file_type: 'application/pdf',
    file_size: 145020,
    description: 'Signed carrier bill of lading and warehouse dock receipt confirmation',
    source: 'Seller / Manual Upload',
    created_at: new Date().toISOString()
  };

  tenantRepo.insertManualEvidence(manualEvidenceRecord);

  // Verify retrieval
  const retrieved = tenantRepo.listManualEvidenceForCharge(targetCharge.charge_id);
  assert.strictEqual(retrieved.length, 1, 'Should retrieve 1 manual evidence record');
  assert.strictEqual(retrieved[0].evidence_id, 'MEV-TEST-001');
  assert.strictEqual(retrieved[0].filename, 'carrier_signed_pod.pdf');
  assert.strictEqual(retrieved[0].file_type, 'application/pdf');
  assert.strictEqual(retrieved[0].source, 'Seller / Manual Upload');
  assert.strictEqual(retrieved[0].description, manualEvidenceRecord.description);
  console.log('   ✓ Manual evidence attached and associated with charge_id, unit_id, and metadata.');

  // Verify upstream evidence is intact (never deleted or overwritten)
  const upstreamRecords = tenantRepo.getEvidenceForUnit(targetCharge.unit_id);
  assert.ok(upstreamRecords.length > 0, 'Upstream evidence must remain intact');
  assert.strictEqual(
    upstreamRecords.every(r => r.source !== 'Seller / Manual Upload'),
    true,
    'Upstream evidence must remain distinct from manual evidence'
  );
  console.log('   ✓ Upstream evidence verified intact and distinct from manual evidence.');

  // ----------------------------------------------------
  // TEST 2: Audit Logging of Manual Evidence Actions
  // ----------------------------------------------------
  console.log('\n2. Testing Audit Trail Logging for Manual Evidence & Re-evaluation...');
  tenantRepo.logAudit({
    charge_id: targetCharge.charge_id,
    unit_id: targetCharge.unit_id,
    decision_id: `DEC-${targetCharge.charge_id}`,
    event_type: 'MANUAL_EVIDENCE_ATTACHED',
    details: {
      evidence_id: manualEvidenceRecord.evidence_id,
      filename: manualEvidenceRecord.filename,
      file_type: manualEvidenceRecord.file_type,
      source: 'Seller / Manual Upload'
    }
  });

  tenantRepo.logAudit({
    charge_id: targetCharge.charge_id,
    unit_id: targetCharge.unit_id,
    decision_id: `DEC-${targetCharge.charge_id}`,
    event_type: 'EVIDENCE_DESCRIPTION_ADDED',
    details: {
      evidence_id: manualEvidenceRecord.evidence_id,
      description: manualEvidenceRecord.description
    }
  });

  // Re-evaluation execution
  const prevDecision = tenantRepo.getDecisionForCharge(targetCharge.charge_id);
  const revalResult = processor.processCharge(targetCharge, tenantRepo);

  tenantRepo.logAudit({
    charge_id: targetCharge.charge_id,
    unit_id: targetCharge.unit_id,
    decision_id: revalResult.decision.decision_id,
    event_type: 'CASE_REEVALUATED',
    details: {
      charge_id: targetCharge.charge_id,
      previous_verdict: prevDecision.verdict,
      new_verdict: revalResult.decision.verdict,
      manual_evidence_count: 1
    }
  });

  const auditTrail = tenantRepo.getAuditTrail(revalResult.decision.decision_id, targetCharge.charge_id);
  const eventTypes = auditTrail.map(a => a.event_type);
  assert.ok(eventTypes.includes('MANUAL_EVIDENCE_ATTACHED'), 'Must include MANUAL_EVIDENCE_ATTACHED');
  assert.ok(eventTypes.includes('EVIDENCE_DESCRIPTION_ADDED'), 'Must include EVIDENCE_DESCRIPTION_ADDED');
  assert.ok(eventTypes.includes('CASE_REEVALUATED'), 'Must include CASE_REEVALUATED');
  console.log('   ✓ Audit timeline successfully tracks MANUAL_EVIDENCE_ATTACHED, EVIDENCE_DESCRIPTION_ADDED, and CASE_REEVALUATED.');

  // ----------------------------------------------------
  // TEST 3: Re-evaluation using Existing Engine Logic
  // ----------------------------------------------------
  console.log('\n3. Testing Engine Re-evaluation (UNCERTAIN remains UNCERTAIN without automated promotion)...');
  // Find an UNCERTAIN charge (e.g. TC or real charge that was UNCERTAIN)
  const decisions = tenantRepo.db.prepare(`SELECT * FROM decisions WHERE org_id = ?`).all(orgId);
  const uncertainDecision = decisions.find(d => d.verdict === DecisionVerdict.UNCERTAIN);
  assert.ok(uncertainDecision, 'Should have at least 1 UNCERTAIN decision in dataset');

  const uncertainCharge = tenantRepo.getCharge(uncertainDecision.charge_id);
  assert.ok(uncertainCharge, 'Should find charge for uncertain decision');

  // Attach a generic manual document
  tenantRepo.insertManualEvidence({
    evidence_id: 'MEV-TEST-002',
    org_id: orgId,
    charge_id: uncertainCharge.charge_id,
    unit_id: uncertainCharge.unit_id,
    filename: 'seller_internal_note.txt',
    file_type: 'text/plain',
    file_size: 120,
    description: 'Seller operator notes requesting review',
    source: 'Seller / Manual Upload',
    created_at: new Date().toISOString()
  });

  // Re-evaluate using EXISTING decision engine
  const revalUncertain = processor.processCharge(uncertainCharge, tenantRepo);

  // Manual evidence must NOT automatically turn UNCERTAIN into CLAIM
  assert.strictEqual(
    revalUncertain.decision.verdict,
    DecisionVerdict.UNCERTAIN,
    'Manual evidence must NOT automatically cause a CLAIM. Existing rules and guards must hold.'
  );
  console.log('   ✓ Verified: Re-evaluation adheres to deterministic engine rules; UNCERTAIN case remains UNCERTAIN without automated promotion.');

  // ----------------------------------------------------
  // TEST 4: Tenancy Isolation for Manual Evidence
  // ----------------------------------------------------
  console.log('\n4. Testing Tenancy Isolation for Manual Evidence...');
  const bravoRepo = dbManager.getTenantContext('org_demo_bravo');
  const bravoManual = bravoRepo.listManualEvidenceForCharge(targetCharge.charge_id);
  assert.strictEqual(bravoManual.length, 0, 'Bravo tenant must NOT see Alpha manual evidence');
  console.log('   ✓ Tenancy isolation verified: Zero cross-tenant manual evidence leakage.');

  console.log('\n====================================================');
  console.log('ALL RECOVERY OPERATIONS TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');

  dbManager.close();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch (e) {
    // Windows file handle cleanup grace
  }
}

runRecoveryOpsTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
