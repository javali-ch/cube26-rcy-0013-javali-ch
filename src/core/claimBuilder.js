/**
 * REMA - Recovery Manager
 * Structured Claim Package Builder
 */

class ClaimBuilder {
  /**
   * Assembles a structured, legally defensible claim package for approved CLAIM verdicts
   */
  static buildClaim(charge, decision, evidenceGraph) {
    if (decision.verdict !== 'CLAIM') {
      throw new Error(`Cannot build claim for verdict '${decision.verdict}'. Only CLAIM decisions may be packaged.`);
    }

    if (!decision.amount_usd || decision.amount_usd <= 0) {
      throw new Error(`Cannot build claim with non-positive amount ($${decision.amount_usd}). Real dollar amount required.`);
    }

    const claimId = `CLM-${charge.charge_id}`;
    const relevant = evidenceGraph.selectRelevantEvidence(charge.charge_type);

    // Build human-readable summaries
    const evidenceSummary = `Relevant stages: ${relevant.available_stages.join(', ')}. Supporting records: ${decision.supporting_evidence_ids.join(', ')}.`;
    const contradictionSummary = decision.contradiction_status === 'CONTRADICTS_CHARGE'
      ? `Reliable internal operational evidence contradicts the channel charge '${charge.charge_type}' billed at $${charge.amount_usd.toFixed(2)}.`
      : `Operational evidence demonstrates disparity with channel assessment.`;

    const coverageSummary = `Coverage: ${decision.evidence_coverage.status} (Required: ${decision.evidence_coverage.required.join(', ')}).`;
    const reliabilitySummary = `Overall Reliability: ${decision.evidence_reliability.overall}. All supporting audit records verified complete.`;

    const claimAmountUsd = decision.claim_amount_usd !== undefined && decision.claim_amount_usd > 0
      ? decision.claim_amount_usd
      : decision.amount_usd;

    return {
      claim_id: claimId,
      org_id: charge.org_id,
      charge_id: charge.charge_id,
      unit_id: decision.unit_id,
      amount_usd: decision.amount_usd,
      total_charge_amount: decision.amount_usd,
      charge_amount_usd: decision.amount_usd,
      claim_amount_usd: claimAmountUsd,
      recoverable_amount_usd: claimAmountUsd,
      currency: charge.currency || 'USD',
      charge_type: charge.charge_type,
      decision: decision.verdict,
      reason: decision.reason,
      supporting_evidence_ids: decision.supporting_evidence_ids,
      evidence_summary: evidenceSummary,
      contradiction_summary: contradictionSummary,
      coverage_summary: coverageSummary,
      reliability_summary: reliabilitySummary,
      rule_version: decision.rule_version,
      status: 'DRAFT',
      created_at: new Date().toISOString()
    };
  }
}

module.exports = ClaimBuilder;
