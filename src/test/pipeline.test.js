/**
 * REMA - Recovery Manager
 * Integration & Tenancy Isolation Test Suite
 */

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseManager } = require('../core/database');
const BatchProcessor = require('../core/batchProcessor');
const Matcher = require('../core/matcher');
const Normalizer = require('../core/normalizer');
const { MatchStatus, DecisionVerdict } = require('../core/types');

async function runTests() {
  console.log('====================================================');
  console.log('REMA: INGESTION, PROCESSING & TENANCY TEST SUITE');
  console.log('====================================================\n');

  // Use an in-memory or dedicated test database
  const testDbPath = path.join(__dirname, '..', '..', 'data', 'test_rema.sqlite');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const dbManager = new DatabaseManager(testDbPath);
  const processor = new BatchProcessor(dbManager);
  const baseDataDir = path.join(__dirname, '..', '..', 'data');

  // 1. Ingest Upstream Data
  console.log('1. Ingesting upstream data (Receiving, Prep, Pack, Returns)...');
  const upstreamCounts = processor.ingestUpstreamData(baseDataDir);
  console.log(`   Ingested: Receiving=${upstreamCounts.receiving}, Prep=${upstreamCounts.prep}, Pack=${upstreamCounts.pack}, Returns=${upstreamCounts.returns}`);
  assert.strictEqual(upstreamCounts.receiving, 100, 'Should ingest 100 receiving records');
  assert.strictEqual(upstreamCounts.prep, 62, 'Should ingest 62 prep records');
  assert.strictEqual(upstreamCounts.pack, 29, 'Should ingest 29 pack records');
  assert.strictEqual(upstreamCounts.returns, 24, 'Should ingest 24 returns records');

  // 2. Ingest Fee Report
  console.log('\n2. Ingesting fee report...');
  const feeReportPath = path.join(baseDataDir, 'fee_report_sample.csv');
  const ingestedFees = processor.ingestFeeReport(feeReportPath);
  console.log(`   Ingested ${ingestedFees.length} fee/adjustment lines.`);
  assert.strictEqual(ingestedFees.length, 61, 'Should ingest 61 fee lines');

  // 3. Test Tenancy Isolation (Rule 1)
  console.log('\n3. Testing Tenancy Isolation (Row-Level Security)...');
  const alphaRepo = dbManager.getTenantContext('org_demo_alpha');
  const bravoRepo = dbManager.getTenantContext('org_demo_bravo');

  const alphaCharges = alphaRepo.listCharges();
  const bravoCharges = bravoRepo.listCharges();
  console.log(`   Alpha charges count: ${alphaCharges.length}`);
  console.log(`   Bravo charges count: ${bravoCharges.length}`);
  assert.strictEqual(alphaCharges.length + bravoCharges.length, 61, 'Total charges must match sum of tenant charges');
  assert.strictEqual(alphaCharges.every(c => c.org_id === 'org_demo_alpha'), true, 'Alpha charges must only belong to Alpha');
  assert.strictEqual(bravoCharges.every(c => c.org_id === 'org_demo_bravo'), true, 'Bravo charges must only belong to Bravo');

  // Verify Alpha cannot fetch a Bravo unit
  const bravoFirstUnit = bravoRepo.listUnits()[0];
  if (bravoFirstUnit) {
    const alphaAttempt = alphaRepo.getUnit(bravoFirstUnit.unit_id);
    assert.strictEqual(alphaAttempt, undefined, 'Alpha must NOT be able to view a Bravo unit (Tenant Isolation Violation)');
  }
  console.log('   ✓ Tenancy isolation verified: Zero cross-tenant row leaks.');

  // 4. Batch Process Both Tenants
  console.log('\n4. Executing Batch Pipeline for org_demo_alpha...');
  const alphaResults = processor.processAllCharges('org_demo_alpha');
  console.log(`   Alpha Results: Total=${alphaResults.total_charges}, Claims=${alphaResults.claims_count} ($${alphaResults.claim_amount_usd}), NoClaims=${alphaResults.no_claims_count}, Uncertain=${alphaResults.uncertain_count} (${alphaResults.latency_ms}ms)`);

  console.log('\n5. Executing Batch Pipeline for org_demo_bravo...');
  const bravoResults = processor.processAllCharges('org_demo_bravo');
  console.log(`   Bravo Results: Total=${bravoResults.total_charges}, Claims=${bravoResults.claims_count} ($${bravoResults.claim_amount_usd}), NoClaims=${bravoResults.no_claims_count}, Uncertain=${bravoResults.uncertain_count} (${bravoResults.latency_ms}ms)`);

  // Verify decisions exist for all charges
  const alphaDecisions = alphaRepo.listDecisions();
  assert.strictEqual(alphaDecisions.length, alphaCharges.length, 'Every charge must produce a recorded decision');

  // Verify Claims have real dollar amounts
  const alphaClaims = alphaRepo.listClaims();
  for (const claim of alphaClaims) {
    assert.ok(claim.amount_usd > 0, `Claim ${claim.claim_id} must have real positive amount: ${claim.amount_usd}`);
    assert.ok(claim.supporting_evidence_ids.length > 0, `Claim ${claim.claim_id} must have supporting evidence IDs`);
    assert.ok(claim.contradiction_summary.length > 0, `Claim ${claim.claim_id} must describe contradiction`);
  }
  console.log(`   ✓ Claims verified: All ${alphaClaims.length} alpha claims have real amounts and supporting evidence IDs.`);

  // Verify Case 1 (CLAIM), Case 2 (NO_CLAIM), Case 3 (UNCERTAIN) are all represented
  const verdicts = new Set(alphaDecisions.map(d => d.verdict));
  console.log(`   Distinct verdicts produced: ${Array.from(verdicts).join(', ')}`);
  assert.ok(verdicts.has(DecisionVerdict.CLAIM), 'Must have CLAIM verdicts');
  assert.ok(verdicts.has(DecisionVerdict.NO_CLAIM), 'Must have NO_CLAIM verdicts');
  assert.ok(verdicts.has(DecisionVerdict.UNCERTAIN), 'Must have UNCERTAIN verdicts');
  console.log('   ✓ Verified: System produces CLAIM, NO_CLAIM, and UNCERTAIN outcomes without bias.');

  // Verify Review Queue items have actionable suggestions
  const alphaReviews = alphaRepo.listReviews();
  for (const rev of alphaReviews) {
    assert.ok(rev.suggested_action && rev.suggested_action.length > 0, `Review ${rev.review_id} must have actionable suggestion`);
  }
  console.log(`   ✓ Review Queue verified: ${alphaReviews.length} actionable items enqueued.`);

  // Verify Audit Trail Lineage
  const firstClaim = alphaClaims[0];
  const auditTrail = alphaRepo.getAuditTrail(null, firstClaim.charge_id);
  console.log(`   ✓ Audit Trail for ${firstClaim.charge_id}: ${auditTrail.length} lifecycle events recorded.`);
  const eventTypes = auditTrail.map(e => e.event_type);
  assert.ok(eventTypes.includes('CHARGE_INGESTED'), 'Must include CHARGE_INGESTED');
  assert.ok(eventTypes.includes('CHARGE_NORMALIZED'), 'Must include CHARGE_NORMALIZED');
  assert.ok(eventTypes.includes('UNIT_MATCHED'), 'Must include UNIT_MATCHED');
  assert.ok(eventTypes.includes('EVIDENCE_RETRIEVED'), 'Must include EVIDENCE_RETRIEVED');
  assert.ok(eventTypes.includes('DECISION_PRODUCED'), 'Must include DECISION_PRODUCED');
  assert.ok(eventTypes.includes('CLAIM_CREATED'), 'Must include CLAIM_CREATED');
  console.log(`     Events: ${eventTypes.join(' -> ')}`);

  // Clean up test DB
  dbManager.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('\n====================================================');
  console.log('ALL CORE PIPELINE & TENANCY TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
