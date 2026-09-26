/**
 * REMA - Recovery Manager
 * Core Deterministic Decision Engine with Fail-Open Architecture
 */

const { DecisionVerdict, MatchStatus, EvidenceReliability, EvidenceState } = require('./types');
const { defaultRegistry } = require('./policies');

class DecisionEngine {
  constructor(policyRegistry = defaultRegistry) {
    this.policyRegistry = policyRegistry;
  }

  /**
   * Evaluates a charge, matched unit, and evidence graph to produce a defensible financial decision
   */
  evaluate(charge, matchResult, evidenceGraph, tenantRepo) {
    const decisionId = `DEC-${charge.charge_id}`;
    const unitId = matchResult.matched_unit_id;

    try {
      // 1. Guard against malformed charges
      if (charge.is_malformed) {
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: null,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: 0.00,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: Charge record is malformed (${charge.validation_errors.join(', ')}).`,
          evidence_coverage: { status: 'NONE' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          supporting_evidence_ids: [],
          missing_evidence: ['VALID_CHARGE_RECORD'],
          conflicts: [],
          review_required: true,
          issue_type: 'MALFORMED_CHARGE',
          suggested_action: 'Correct data formatting errors in original channel fee report.'
        };
      }

      // 2. Guard against Ambiguous or Invalid Unit Matching
      if (matchResult.match_status !== MatchStatus.MATCHED) {
        let reason = '';
        let issueType = 'AMBIGUOUS_UNIT_MATCH';
        let action = '';

        if (matchResult.match_status === MatchStatus.AMBIGUOUS) {
          reason = `CANNOT CLAIM: Unit mapping is ambiguous. ${matchResult.match_reasons.join('. ')}.`;
          action = 'Resolve candidate ambiguities and confirm the authoritative unit identifier.';
        } else if (matchResult.match_status === MatchStatus.INVALID) {
          reason = `CANNOT CLAIM: Unit identifier syntax is invalid (${matchResult.match_reasons.join('. ')}).`;
          action = 'Correct unit identifier syntax in channel report.';
        } else {
          reason = `CANNOT CLAIM: Charge could not be matched to any unit in organization '${charge.org_id}'.`;
          issueType = 'MISSING_EVIDENCE';
          action = 'Verify whether unit belongs to this organization or import missing upstream unit records.';
        }

        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: null,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: 0.00,
          currency: charge.currency || 'USD',
          reason,
          evidence_coverage: { status: 'NONE' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          supporting_evidence_ids: [],
          missing_evidence: ['MATCHED_UNIT'],
          conflicts: matchResult.ambiguity_flags,
          review_required: true,
          issue_type: issueType,
          suggested_action: action
        };
      }

      // 3. Check for supported charge policy
      const policy = this.policyRegistry.getPolicy(charge.charge_type);
      if (!policy) {
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: unitId,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: 0.00,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: Charge type '${charge.charge_type}' has no automated recovery policy configured.`,
          evidence_coverage: { status: 'UNSUPPORTED' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          supporting_evidence_ids: [],
          missing_evidence: [],
          conflicts: [],
          review_required: true,
          issue_type: 'UNSUPPORTED_CHARGE_TYPE',
          suggested_action: `Define and register a charge policy for '${charge.charge_type}'.`
        };
      }

      // 4. Select relevant evidence and check coverage
      const relevantEvidence = evidenceGraph.selectRelevantEvidence(charge.charge_type);

      // 5. Evaluate Cross-Source Consistency & Overall Evidence Reliability
      const consistency = evidenceGraph.crossSourceConsistency || { conflicts: [], overall_reliability: EvidenceReliability.RELIABLE };

      // 6. Execute charge-specific policy
      const policyResult = policy.evaluate(charge, evidenceGraph, tenantRepo);

      return {
        decision_id: decisionId,
        org_id: charge.org_id,
        charge_id: charge.charge_id,
        unit_id: unitId,
        verdict: policyResult.verdict,
        amount_usd: policyResult.amount_usd,
        disputable_amount: policyResult.disputable_amount,
        currency: charge.currency || 'USD',
        reason: policyResult.reason,
        evidence_coverage: {
          status: relevantEvidence.coverage_status,
          required: relevantEvidence.required_stages,
          available: relevantEvidence.available_stages,
          missing: relevantEvidence.missing_stages
        },
        evidence_reliability: {
          overall: consistency.overall_reliability,
          records: evidenceGraph.recordReliability
        },
        contradiction_status: policyResult.contradiction_status,
        rule_version: policy.ruleVersion,
        supporting_evidence_ids: policyResult.supporting_evidence_ids || [],
        missing_evidence: policyResult.missing_evidence || [],
        conflicts: [...(policyResult.conflicts || []), ...consistency.conflicts.map(c => c.message)],
        review_required: policyResult.review_required,
        issue_type: policyResult.issue_type || null,
        suggested_action: policyResult.suggested_action || null
      };

    } catch (err) {
      // 7. Fail-open behavior: Never silently return NO CLAIM on runtime errors
      return {
        decision_id: decisionId,
        org_id: charge.org_id,
        charge_id: charge.charge_id,
        unit_id: unitId,
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: 0.00,
        currency: charge.currency || 'USD',
        reason: `Processing error encountered during decision evaluation: ${err.message}. Case routed to human review to preserve recovery rights.`,
        evidence_coverage: { status: 'INCOMPLETE' },
        evidence_reliability: { status: EvidenceReliability.DEGRADED },
        contradiction_status: 'PROCESSING_ERROR',
        rule_version: '1.0.0-core',
        supporting_evidence_ids: [],
        missing_evidence: [],
        conflicts: [err.message],
        review_required: true,
        issue_type: 'SYSTEM_FAILURE',
        suggested_action: 'Investigate system error logs and rerun decision engine.'
      };
    }
  }
}

module.exports = DecisionEngine;
