const { DatabaseManager } = require('../core/database');
const BatchProcessor = require('../core/batchProcessor');
const EvaluationEngine = require('../core/evaluation');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.join(__dirname, '..', '..', 'data', 'eval_test.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const dbManager = new DatabaseManager(testDbPath);
const processor = new BatchProcessor(dbManager);
const baseDataDir = path.join(__dirname, '..', '..', 'data');

processor.ingestUpstreamData(baseDataDir);
processor.ingestFeeReport(path.join(baseDataDir, 'fee_report_sample.csv'));

console.log('=== REAL DATASET EVALUATION (org_demo_alpha) ===');
const alphaBatch = processor.processAllCharges('org_demo_alpha');
const alphaMetrics = EvaluationEngine.evaluateBatch(alphaBatch, dbManager.getTenantContext('org_demo_alpha'));
console.log(JSON.stringify(alphaMetrics, null, 2));

console.log('\n=== REAL DATASET EVALUATION (org_demo_bravo) ===');
const bravoBatch = processor.processAllCharges('org_demo_bravo');
const bravoMetrics = EvaluationEngine.evaluateBatch(bravoBatch, dbManager.getTenantContext('org_demo_bravo'));
console.log(JSON.stringify(bravoMetrics, null, 2));

console.log('\n=== SYNTHETIC EDGE CASE BENCHMARK ===');
const synResults = EvaluationEngine.runSyntheticBenchmark(dbManager);
console.log(`Cases: ${synResults.passed_cases}/${synResults.total_cases} passed (${(synResults.pass_rate * 100).toFixed(1)}%)`);
for (const d of synResults.details) {
  console.log(`  [${d.passed ? 'PASS' : 'FAIL'}] ${d.name} -> Expected: ${d.expected}, Got: ${d.actual}`);
}

dbManager.close();
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
