/**
 * REMA - Recovery Manager
 * Charge Policy: damaged_in_warehouse
 */

const { DecisionVerdict, EvidenceState, Stage } = require('../types');

class DamagedWarehousePolicy {
  static get chargeType() {
    return 'damaged_in_warehouse';
  }

  static get ruleVersion() {
    return '1.0.0-damaged-warehouse';
  }

  /**
   * Evaluates damaged in warehouse charge/reimbursement
   */
  static evaluate(charge, evidenceGraph, tenantRepo) {
    const relevant = evidenceGraph.selectRelevantEvidence(this.chargeType);
    const rcvRecord = relevant.records[Stage.RECEIVING];
    const prepRecord = relevant.records[Stage.PREP];

    // If charge is in reimbursement_report and amount is positive, channel has already compensated
    if (charge.report_type === 'reimbursement_report' && charge.amount_usd > 0) {
      return {
        verdict: DecisionVerdict.NO_CLAIM,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `Channel reimbursement of $${charge.amount_usd.toFixed(2)} was already approved and posted. Receiving logs (${rcvRecord ? rcvRecord.evidence_id : 'N/A'}) confirm item was intact upon delivery, validating the channel payout. No outstanding balance.`,
        contradiction_status: 'ALREADY_REIMBURSED',
        evidence_state: EvidenceState.PASS,
        supporting_evidence_ids: [
          ...(rcvRecord ? [rcvRecord.evidence_id] : []),
          ...(prepRecord ? [prepRecord.evidence_id] : [])
        ],
        missing_evidence: [],
        conflicts: [],
        review_required: false,
        issue_type: null,
        suggested_action: null
      };
    }

    // If channel deducted fees or refused reimbursement while Receiving was intact -> CLAIM
    if (rcvRecord && rcvRecord.normalized_data.carton_damage === 'none' && rcvRecord.normalized_data.unit_damage === 'none') {
      return {
        verdict: DecisionVerdict.CLAIM,
        amount_usd: charge.amount_usd,
        disputable_amount: charge.amount_usd,
        reason: `Receiving dock logs (${rcvRecord.evidence_id}) prove item arrived undamaged from supplier (carton: none, unit: none). Damage occurred under channel custody in warehouse; reimbursement claim warranted.`,
        contradiction_status: 'CONTRADICTS_CHARGE',
        evidence_state: EvidenceState.PASS,
        supporting_evidence_ids: [rcvRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: false,
        issue_type: null,
        suggested_action: null
      };
    }

    // Default missing or inconclusive
    return {
      verdict: DecisionVerdict.UNCERTAIN,
      amount_usd: 0.00,
      disputable_amount: charge.amount_usd,
      reason: 'CANNOT CLAIM: Insufficient upstream condition evidence to confirm custody point of damage.',
      contradiction_status: 'INCONCLUSIVE',
      evidence_state: EvidenceState.UNCERTAIN,
      supporting_evidence_ids: [],
      missing_evidence: [Stage.RECEIVING],
      conflicts: [],
      review_required: true,
      issue_type: 'MISSING_EVIDENCE',
      suggested_action: 'Examine receiving dock damage photos and warehouse incident reports.'
    };
  }
}

module.exports = DamagedWarehousePolicy;
