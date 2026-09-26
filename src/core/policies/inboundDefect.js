/**
 * REMA - Recovery Manager
 * Charge Policy: inbound_defect_fee
 */

const { DecisionVerdict, EvidenceState, Stage } = require('../types');

class InboundDefectPolicy {
  static get chargeType() {
    return 'inbound_defect_fee';
  }

  static get ruleVersion() {
    return '1.0.0-inbound-defect';
  }

  /**
   * Evaluates prep compliance against reported inbound defect fee
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
        reason: 'CANNOT CLAIM: Required Prep compliance evidence is missing for this unit.',
        contradiction_status: 'NONE',
        evidence_state: EvidenceState.MISSING,
        supporting_evidence_ids: [],
        missing_evidence: [Stage.PREP],
        conflicts: [],
        review_required: true,
        issue_type: 'MISSING_EVIDENCE',
        suggested_action: 'Locate physical prep workstation audit record and photo evidence for unit.'
      };
    }

    const prep = prepRecord.normalized_data;
    const checks = {};

    // 2. Check Polybag Requirement
    if (prep.polybag_present_sealed === 'uncertain') {
      checks.polybag = EvidenceState.UNCERTAIN;
    } else if (prep.wo_polybag) {
      checks.polybag = prep.polybag_present_sealed === 'yes' ? EvidenceState.PASS : EvidenceState.FAIL;
    } else {
      checks.polybag = ['not_required', 'yes'].includes(prep.polybag_present_sealed) ? EvidenceState.PASS : EvidenceState.FAIL;
    }

    // 3. Check Suffocation Warning
    if (prep.suffocation_warning === 'uncertain') {
      checks.suffocation_warning = EvidenceState.UNCERTAIN;
    } else if (prep.wo_suffocation_warning) {
      checks.suffocation_warning = prep.suffocation_warning === 'legible' ? EvidenceState.PASS : EvidenceState.FAIL;
    } else {
      checks.suffocation_warning = ['not_required', 'legible'].includes(prep.suffocation_warning) ? EvidenceState.PASS : EvidenceState.FAIL;
    }

    // 4. Check FNSKU Placement
    if (prep.fnsku_label_placement === 'uncertain') {
      checks.fnsku_placement = EvidenceState.UNCERTAIN;
    } else if (prep.fnsku_label_placement === 'flat') {
      checks.fnsku_placement = EvidenceState.PASS;
    } else {
      checks.fnsku_placement = EvidenceState.FAIL;
    }

    // 5. Check Barcode Covered
    if (prep.original_barcode_covered === 'uncertain') {
      checks.barcode_covered = EvidenceState.UNCERTAIN;
    } else if (prep.original_barcode_covered === 'yes') {
      checks.barcode_covered = EvidenceState.PASS;
    } else {
      checks.barcode_covered = EvidenceState.FAIL;
    }

    // 6. Check Expiry Date
    if (prep.expiry_date === 'uncertain') {
      checks.expiry_date = EvidenceState.UNCERTAIN;
    } else if (prep.wo_expiry_date) {
      checks.expiry_date = prep.expiry_date === 'legible' ? EvidenceState.PASS : EvidenceState.FAIL;
    } else {
      checks.expiry_date = ['not_required', 'legible'].includes(prep.expiry_date) ? EvidenceState.PASS : EvidenceState.FAIL;
    }

    // 7. Check Handling Marks
    if (prep.handling_marks === 'uncertain') {
      checks.handling_marks = EvidenceState.UNCERTAIN;
    } else if (prep.wo_handling_marks) {
      checks.handling_marks = prep.handling_marks === 'all_present' ? EvidenceState.PASS : EvidenceState.FAIL;
    } else {
      checks.handling_marks = ['not_required', 'all_present'].includes(prep.handling_marks) ? EvidenceState.PASS : EvidenceState.FAIL;
    }

    const failedChecks = Object.entries(checks).filter(([_, state]) => state === EvidenceState.FAIL);
    const uncertainChecks = Object.entries(checks).filter(([_, state]) => state === EvidenceState.UNCERTAIN);

    // 8. Cross-source conflict with Receiving
    const conflicts = [];
    if (rcvRecord) {
      const rcv = rcvRecord.normalized_data;
      if (rcv.quality_flags === 'obvious_defect' || rcv.quality_flags === 'missing_components') {
        conflicts.push(`Receiving recorded pre-existing defect: '${rcv.quality_flags}'`);
      }
      if (rcv.unit_damage === 'water' || rcv.unit_damage === 'crushing' || rcv.carton_damage === 'tears') {
        conflicts.push(`Receiving recorded physical package damage: carton='${rcv.carton_damage}', unit='${rcv.unit_damage}'`);
      }
    }

    if (conflicts.length > 0) {
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `CANNOT CLAIM: Cross-source evidence conflict. Reliable Prep evidence shows compliance, but Receiving reported prior damage/defects (${conflicts.join('; ')}). Neither can be established as sole authoritative cause.`,
        contradiction_status: 'CONFLICTED',
        evidence_state: EvidenceState.UNCERTAIN,
        supporting_evidence_ids: [prepRecord.evidence_id, ...(rcvRecord ? [rcvRecord.evidence_id] : [])],
        missing_evidence: [],
        conflicts,
        review_required: true,
        issue_type: 'CONFLICTING_EVIDENCE',
        suggested_action: 'Perform human review to determine if defect occurred prior to receiving or was caused by channel handling.'
      };
    }

    // 9. If any check is UNCERTAIN -> UNCERTAIN / REVIEW
    if (uncertainChecks.length > 0) {
      const uncertainNames = uncertainChecks.map(([name]) => name).join(', ');
      return {
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `CANNOT CLAIM: Prep audit evidence is inconclusive. The following checks are marked UNCERTAIN: ${uncertainNames}.`,
        contradiction_status: 'INCONCLUSIVE',
        evidence_state: EvidenceState.UNCERTAIN,
        supporting_evidence_ids: [prepRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: true,
        issue_type: 'DEGRADED_EVIDENCE',
        suggested_action: `Inspect photographic attachments for Prep Record #${prepRecord.evidence_id} to verify ${uncertainNames}.`
      };
    }

    // 10. If any check FAILED -> NO CLAIM (evidence supports the reported charge)
    if (failedChecks.length > 0) {
      const failDescriptions = failedChecks.map(([name]) => name).join(', ');
      return {
        verdict: DecisionVerdict.NO_CLAIM,
        amount_usd: 0.00,
        disputable_amount: charge.amount_usd,
        reason: `The reliable Prep evidence supports the reported defect charge: prep inspection failed on ${failDescriptions}. The charge is legitimate.`,
        contradiction_status: 'SUPPORTS_CHARGE',
        evidence_state: EvidenceState.FAIL,
        supporting_evidence_ids: [prepRecord.evidence_id],
        missing_evidence: [],
        conflicts: [],
        review_required: false,
        issue_type: null,
        suggested_action: null
      };
    }

    // 11. All checks PASS -> CONTRADICTION DETECTED -> CLAIM!
    return {
      verdict: DecisionVerdict.CLAIM,
      amount_usd: charge.amount_usd,
      disputable_amount: charge.amount_usd,
      reason: `Reliable Prep evidence (${prepRecord.evidence_id}) confirms full prep compliance (polybag sealed, warning legible, FNSKU flat, barcode covered, handling marks present), directly contradicting the reported inbound defect fee.`,
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

module.exports = InboundDefectPolicy;
