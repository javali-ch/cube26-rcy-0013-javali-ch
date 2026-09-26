/**
 * REMA - Recovery Manager
 * Charge Policy: lost_inbound
 */

const { DecisionVerdict, EvidenceState, Stage } = require('../types');

class LostInboundPolicy {
  static get chargeType() {
    return 'lost_inbound';
  }

  static get ruleVersion() {
    return '1.0.0-lost-inbound';
  }

  /**
   * Evaluates lost inbound inventory adjustment against receiving and prep custody logs
   */
  static evaluate(charge, evidenceGraph, tenantRepo) {
    const relevant = evidenceGraph.selectRelevantEvidence(this.chargeType);
    const rcvRecord = relevant.records[Stage.RECEIVING];
    const prepRecord = relevant.records[Stage.PREP];

    // 1. Missing Receiving Evidence -> UNCERTAIN
    if (!rcvRecord) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: 'CANNOT CLAIM: Missing Receiving dock log. Inbound receipt cannot be verified.',
        contradiction_status: 'NONE',
        evidence_state: EvidenceState.MISSING,
        supporting_evidence_ids: [],
        missing_evidence: [Stage.RECEIVING],
        conflicts: [],
        review_required: true,
        issue_type: 'MISSING_EVIDENCE',
        suggested_action: 'Locate bill of lading and warehouse dock check-in record.'
      };
    }

    const rcv = rcvRecord.normalized_data;

    // 2. Short Shipment at Receiving (e.g. qty_received < qty_ordered)
    // If supplier sent less inventory, channel did not lose it in transit/warehouse
    if (rcv.qty_received < rcv.qty_ordered) {
      return {
        verdict: DecisionVerdict.NO_CLAIM,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `Receiving dock audit confirms inbound shipment was short (${rcv.qty_received} counted vs ${rcv.qty_ordered} ordered). Discrepancy originated at supplier shipment, not channel loss.`,
        contradiction_status: 'SUPPORTS_CHARGE',
        evidence_state: EvidenceState.FAIL,
        supporting_evidence_ids: [rcvRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: false,
        issue_type: null,
        suggested_action: null
      };
    }

    // 3. Full receipt verified, but charge amount is $0.00 in report
    // Never invent a financial value when report has 0.00
    if (charge.amount_usd === 0) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: 0.00,
        reason: `Receiving dock confirmed full check-in (${rcv.qty_received}/${rcv.qty_ordered}) and Prep confirmed handling, proving channel loss in network. However, channel adjustment report recorded $0.00 valuation. Automated recovery requires valuation schedule.`,
        contradiction_status: 'VALUATION_REQUIRED',
        evidence_state: EvidenceState.PASS,
        supporting_evidence_ids: [rcvRecord.evidence_id, ...(prepRecord ? [prepRecord.evidence_id] : [])],
        missing_evidence: [],
        conflicts: [],
        review_required: true,
        issue_type: 'ZERO_VALUATION',
        suggested_action: 'Apply SKU wholesale/replacement valuation schedule to generate defensible claim value.'
      };
    }

    // 4. Positive amount on record with verified full receipt -> CLAIM
    return {
      verdict: DecisionVerdict.CLAIM,
      amount_usd: charge.amount_usd,
      disputable_amount: charge.amount_usd,
      reason: `Receiving dock confirmed full check-in (${rcv.qty_received}/${rcv.qty_ordered}) and internal custody, establishing valid claim for lost inbound inventory.`,
      contradiction_status: 'CONTRADICTS_CHARGE',
      evidence_state: EvidenceState.PASS,
      supporting_evidence_ids: [rcvRecord.evidence_id, ...(prepRecord ? [prepRecord.evidence_id] : [])],
      missing_evidence: [],
      conflicts: [],
      review_required: false,
      issue_type: null,
      suggested_action: null
    };
  }
}

module.exports = LostInboundPolicy;
