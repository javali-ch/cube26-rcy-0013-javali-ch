/**
 * REMA - Recovery Manager
 * Charge Policy: fulfilment_fee_weight_tier
 */

const { DecisionVerdict, EvidenceState, Stage } = require('../types');

class WeightTierPolicy {
  static get chargeType() {
    return 'fulfilment_fee_weight_tier';
  }

  static get ruleVersion() {
    return '1.0.0-weight-tier';
  }

  /**
   * Evaluates weight tier fee against SKU baseline and upstream packaging records
   */
  static evaluate(charge, evidenceGraph, tenantRepo) {
    const relevant = evidenceGraph.selectRelevantEvidence(this.chargeType);
    const prepRecord = relevant.records[Stage.PREP];
    const rcvRecord = relevant.records[Stage.RECEIVING];

    // 1. Missing Required Evidence -> UNCERTAIN
    if (!prepRecord) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: 'CANNOT CLAIM: Required Prep packaging evidence is missing for weight-tier verification.',
        contradiction_status: 'NONE',
        evidence_state: EvidenceState.MISSING,
        supporting_evidence_ids: [],
        missing_evidence: [Stage.PREP],
        conflicts: [],
        review_required: true,
        issue_type: 'MISSING_EVIDENCE',
        suggested_action: 'Retrieve workstation prep logs to confirm package dimensions and packaging materials.'
      };
    }

    const prep = prepRecord.normalized_data;

    // Check if prep packaging has uncertain attributes
    if (prep.polybag_present_sealed === 'uncertain') {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: 'CANNOT CLAIM: Prep packaging audit is uncertain, making package volume and weight tier indeterminate.',
        contradiction_status: 'INCONCLUSIVE',
        evidence_state: EvidenceState.UNCERTAIN,
        supporting_evidence_ids: [prepRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: true,
        issue_type: 'DEGRADED_EVIDENCE',
        suggested_action: 'Inspect prep photo audit to confirm packaging type and measurements.'
      };
    }

    // Check cross-source consistency: if receiving noted water damage or package distortion
    if (rcvRecord) {
      const rcv = rcvRecord.normalized_data;
      if (rcv.unit_damage === 'water' || rcv.quality_flags === 'obvious_defect' || rcv.carton_damage === 'crushing') {
        const conflictMsg = `Receiving dock noted package damage/defect (carton: '${rcv.carton_damage}', unit: '${rcv.unit_damage}', flags: '${rcv.quality_flags}'), which may have caused dimensional distortion or weight variation.`;
        return {
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: 0.00,
          disputable_amount: charge.amount_usd,
          reason: `CANNOT CLAIM: Cross-source evidence conflict. ${conflictMsg}`,
          contradiction_status: 'CONFLICTED',
          evidence_state: EvidenceState.UNCERTAIN,
          supporting_evidence_ids: [prepRecord.evidence_id, rcvRecord.evidence_id],
          missing_evidence: [],
          conflicts: [conflictMsg],
          review_required: true,
          issue_type: 'CONFLICTING_EVIDENCE',
          suggested_action: 'Perform physical parcel remeasurement audit to verify true dimensional weight tier.'
        };
      }
    }

    // Determine baseline fee for this SKU across all charges for this tenant
    // Find the minimum fee recorded for this SKU in the dataset as the baseline tier
    const skuCharges = tenantRepo.listCharges({ charge_type: this.chargeType })
      .filter(c => c.sku === charge.sku);

    const amounts = skuCharges.map(c => c.amount_usd).filter(a => a > 0);
    const baselineFee = amounts.length > 0 ? Math.min(...amounts) : charge.amount_usd;

    // 2. Fee matches baseline tier -> NO CLAIM (correctly billed)
    if (charge.amount_usd <= baselineFee) {
      return {
        verdict: DecisionVerdict.NO_CLAIM,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `The reported charge ($${charge.amount_usd.toFixed(2)}) conforms to the established baseline tier ($${baselineFee.toFixed(2)}) for ${charge.sku}. Evidence supports correct billing.`,
        contradiction_status: 'SUPPORTS_CHARGE',
        evidence_state: EvidenceState.PASS,
        supporting_evidence_ids: [prepRecord.evidence_id, ...(rcvRecord ? [rcvRecord.evidence_id] : [])],
        missing_evidence: [],
        conflicts: [],
        review_required: false,
        issue_type: null,
        suggested_action: null
      };
    }

    // 3. Fee exceeds baseline fee: Calculate defensible overcharge
    const overcharge = parseFloat((charge.amount_usd - baselineFee).toFixed(2));

    return {
      verdict: DecisionVerdict.CLAIM,
      amount_usd: overcharge,
      disputable_amount: charge.amount_usd,
      reason: `Reliable Prep records prove standard packaging for ${charge.sku}, yet channel billed an elevated weight tier fee ($${charge.amount_usd.toFixed(2)} vs baseline $${baselineFee.toFixed(2)}). Recommending recovery of the $${overcharge.toFixed(2)} mis-tier overcharge.`,
      contradiction_status: 'CONTRADICTS_CHARGE',
      evidence_state: EvidenceState.PASS,
      supporting_evidence_ids: [prepRecord.evidence_id, ...(rcvRecord ? [rcvRecord.evidence_id] : [])],
      missing_evidence: [],
      conflicts: [],
      review_required: false,
      issue_type: null,
      suggested_action: null
    };
  }
}

module.exports = WeightTierPolicy;
