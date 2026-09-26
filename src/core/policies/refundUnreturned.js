/**
 * REMA - Recovery Manager
 * Charge Policy: refund_issued_item_not_returned
 */

const { DecisionVerdict, EvidenceState, Stage } = require('../types');

class RefundUnreturnedPolicy {
  static get chargeType() {
    return 'refund_issued_item_not_returned';
  }

  static get ruleVersion() {
    return '1.0.0-refund-unreturned';
  }

  /**
   * Evaluates refund unreturned charge against Returns Manager audit logs
   */
  static evaluate(charge, evidenceGraph, tenantRepo) {
    const relevant = evidenceGraph.selectRelevantEvidence(this.chargeType);
    const rtnRecord = relevant.records[Stage.RETURNS];

    // 1. Missing Returns Evidence -> UNCERTAIN
    if (!rtnRecord) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: 'CANNOT CLAIM: Missing Returns station audit record. Cannot verify if buyer returned the item.',
        contradiction_status: 'NONE',
        evidence_state: EvidenceState.MISSING,
        supporting_evidence_ids: [],
        missing_evidence: [Stage.RETURNS],
        conflicts: [],
        review_required: true,
        issue_type: 'MISSING_EVIDENCE',
        suggested_action: 'Query reverse logistics returns dock scanner for RMA / LPN tracking.'
      };
    }

    const rtn = rtnRecord.normalized_data;

    // 2. Returns record exists: Physical custody confirmed
    // The channel claims item was NOT returned, but Returns Manager proves physical arrival
    if (charge.amount_usd === 0) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: 0.00,
        reason: `Returns Manager record (${rtnRecord.evidence_id}) proves physical return on ${rtnRecord.captured_at} (state: '${rtn.observed_state}', disposition: '${rtn.operator_disposition}'), directly contradicting channel's unreturned classification. However, line amount is $0.00; valuation review required to file customer refund reimbursement.`,
        contradiction_status: 'VALUATION_REQUIRED',
        evidence_state: EvidenceState.PASS,
        supporting_evidence_ids: [rtnRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: true,
        issue_type: 'ZERO_VALUATION',
        suggested_action: 'Retrieve original order value from order logs to assemble customer refund reimbursement claim.'
      };
    }

    // 3. Positive amount on record with verified return -> CLAIM
    return {
      verdict: DecisionVerdict.CLAIM,
      amount_usd: charge.amount_usd,
      disputable_amount: charge.amount_usd,
      reason: `Returns Manager audit (${rtnRecord.evidence_id}) confirms item was received back at returns dock (disposition: '${rtn.operator_disposition}'), disproving channel fee/loss deduction.`,
      contradiction_status: 'CONTRADICTS_CHARGE',
      evidence_state: EvidenceState.PASS,
      supporting_evidence_ids: [rtnRecord.evidence_id],
      missing_evidence: [],
      conflicts: [],
      review_required: false,
      issue_type: null,
      suggested_action: null
    };
  }
}

module.exports = RefundUnreturnedPolicy;
