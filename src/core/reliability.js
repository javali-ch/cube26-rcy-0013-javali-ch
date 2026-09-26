/**
 * REMA - Recovery Manager
 * Deterministic Evidence Reliability & Cross-Source Consistency Engine
 */

const { EvidenceReliability, Stage } = require('./types');

class ReliabilityEngine {
  /**
   * Evaluates the reliability of an individual evidence record
   */
  static assessEvidenceRecord(evidence) {
    const issues = [];
    const normalized = evidence.normalized_data || {};

    // 1. Structural Completeness & Required Fields
    if (!evidence.evidence_id) issues.push('Missing evidence record_id');
    if (!evidence.unit_id) issues.push('Missing unit_id');
    if (!evidence.captured_at || isNaN(Date.parse(evidence.captured_at))) {
      issues.push('Missing or invalid captured_at timestamp');
    }
    if (!evidence.operator_id) {
      issues.push('Missing operator_id');
    }

    // 2. Stage-specific completeness & photo verification
    if (evidence.stage === Stage.PREP) {
      if (!evidence.photo_refs) {
        issues.push('Prep record lacks photographic audit references');
      }
      if (!normalized.work_order_id) {
        issues.push('Prep record lacks work_order_id');
      }
    } else if (evidence.stage === Stage.RECEIVING) {
      if (!evidence.photo_refs) {
        issues.push('Receiving record lacks photographic audit references');
      }
      if (normalized.identity_match === false) {
        issues.push('Receiving identity_match reported as NO (SKU/ASIN physical mismatch)');
      }
    } else if (evidence.stage === Stage.PACK) {
      if (!normalized.order_id) {
        issues.push('Pack record lacks order_id');
      }
    } else if (evidence.stage === Stage.RETURNS) {
      if (!normalized.observed_state || normalized.observed_state === 'uncertain') {
        issues.push('Returns physical observed_state is UNCERTAIN');
      }
    }

    // 3. Categorical Reliability Status
    let status = EvidenceReliability.RELIABLE;
    if (issues.some(i => i.includes('Missing unit_id') || i.includes('Missing evidence record_id'))) {
      status = EvidenceReliability.INSUFFICIENT;
    } else if (issues.some(i => i.includes('identity_match') || i.includes('UNCERTAIN'))) {
      status = EvidenceReliability.DEGRADED;
    } else if (issues.length > 0) {
      status = EvidenceReliability.DEGRADED;
    }

    return {
      status,
      issues,
      is_reliable: status === EvidenceReliability.RELIABLE
    };
  }

  /**
   * Assesses cross-source consistency across all upstream stages for a unit
   */
  static assessCrossSourceConsistency(evidenceGraph) {
    const conflicts = [];
    const rcv = evidenceGraph.receiving;
    const prep = evidenceGraph.prep;
    const pack = evidenceGraph.pack;
    const rtn = evidenceGraph.returns;

    // 1. Check FBA vs MFN mutual exclusivity
    if (prep && pack) {
      conflicts.push({
        type: 'MUTUAL_EXCLUSIVITY_VIOLATION',
        severity: 'HIGH',
        message: 'Unit contains both Prep (FBA) and Pack (MFN/3PL) records, violating channel routing architecture'
      });
    }

    // 2. Check SKU consistency across stages
    const observedSkus = [];
    if (rcv && rcv.normalized_data.sku) observedSkus.push({ stage: Stage.RECEIVING, sku: rcv.normalized_data.sku });
    if (prep && prep.normalized_data.sku) observedSkus.push({ stage: Stage.PREP, sku: prep.normalized_data.sku });
    if (rtn && rtn.normalized_data.ordered_sku) observedSkus.push({ stage: Stage.RETURNS, sku: rtn.normalized_data.ordered_sku });

    const distinctSkus = [...new Set(observedSkus.map(s => s.sku))];
    if (distinctSkus.length > 1) {
      conflicts.push({
        type: 'CROSS_STAGE_SKU_MISMATCH',
        severity: 'HIGH',
        message: `Conflicting SKUs observed across stages: ${observedSkus.map(s => `${s.stage}:${s.sku}`).join(', ')}`
      });
    }

    // 3. Chronological timeline ordering check
    // Receiving < Prep < Returns
    const timestamps = [];
    if (rcv) timestamps.push({ stage: Stage.RECEIVING, time: new Date(rcv.captured_at).getTime() });
    if (prep) timestamps.push({ stage: Stage.PREP, time: new Date(prep.captured_at).getTime() });
    if (pack) timestamps.push({ stage: Stage.PACK, time: new Date(pack.captured_at).getTime() });
    if (rtn) timestamps.push({ stage: Stage.RETURNS, time: new Date(rtn.captured_at).getTime() });

    for (let i = 0; i < timestamps.length - 1; i++) {
      if (timestamps[i].time > timestamps[i + 1].time) {
        conflicts.push({
          type: 'CHRONOLOGICAL_INVERSION',
          severity: 'MEDIUM',
          message: `${timestamps[i].stage} timestamp (${new Date(timestamps[i].time).toISOString()}) is later than subsequent ${timestamps[i + 1].stage} timestamp (${new Date(timestamps[i + 1].time).toISOString()})`
        });
      }
    }

    // 4. Quality vs Prep condition conflict
    // If receiving flagged obvious defect or damage, but prep marked standard pass without note
    if (rcv && prep) {
      const rcvDefect = rcv.normalized_data.quality_flags === 'obvious_defect' || rcv.normalized_data.unit_damage === 'water';
      if (rcvDefect) {
        conflicts.push({
          type: 'RECEIVING_DEFECT_NOT_REFLECTED_IN_PREP',
          severity: 'HIGH',
          message: `Receiving noted defect (${rcv.normalized_data.quality_flags || rcv.normalized_data.unit_damage}), creating upstream ambiguity with prep compliance audit`
        });
      }
    }

    let overallReliability = EvidenceReliability.RELIABLE;
    if (conflicts.some(c => c.severity === 'HIGH')) {
      overallReliability = EvidenceReliability.CONFLICTED;
    } else if (conflicts.some(c => c.severity === 'MEDIUM')) {
      overallReliability = EvidenceReliability.DEGRADED;
    }

    return {
      overall_reliability: overallReliability,
      conflicts,
      is_consistent: conflicts.length === 0
    };
  }
}

module.exports = ReliabilityEngine;
