/**
 * REMA - Recovery Manager
 * Core Deterministic Decision Engine with Authoritative Policy Verification
 *
 * Sequence:
 * Charge -> Evidence -> Authoritative Rule -> Eligibility -> Decision
 */

const { DecisionVerdict, MatchStatus, EvidenceReliability, EvidenceState } = require('./types');
const { authoritativePolicyRegistry } = require('./policies/policyRegistry');
const EligibilityEvaluator = require('./eligibilityEvaluator');

class DecisionEngine {
  constructor(policyRegistry = authoritativePolicyRegistry) {
    this.policyRegistry = policyRegistry;
    this.eligibilityEvaluator = EligibilityEvaluator;
  }

  /**
   * Evaluates a charge, matched unit, and evidence graph through the authoritative pipeline:
   * Charge -> Evidence -> Authoritative Rule -> Eligibility -> Decision
   *
   * @param {Object} charge - Normalized charge record
   * @param {Object} matchResult - Output from Matcher
   * @param {EvidenceGraph} evidenceGraph - Graph of verified operational evidence
   * @param {TenantRepository} tenantRepo - Tenant-scoped repository
   * @param {Object} [options] - Optional runtime parameters
   * @returns {Object} Defensible decision object enriched with authoritative rule & eligibility trace
   */
  evaluate(charge, matchResult, evidenceGraph, tenantRepo, options = {}) {
    const decisionId = `DEC-${charge.charge_id}`;
    const unitId = matchResult ? matchResult.matched_unit_id : null;
    const matchMethod = matchResult?.matchMethod || matchResult?.match_method || 'NONE';
    const totalChargeAmount = charge.amount_usd !== undefined && charge.amount_usd !== null
      ? (typeof charge.amount_usd === 'number' ? charge.amount_usd : (parseFloat(charge.amount_usd) || 0.00))
      : 0.00;

    try {
      // -------------------------------------------------------------
      // 1. CHARGE GUARD: Guard against malformed charges
      // -------------------------------------------------------------
      if (charge.is_malformed) {
        const cannotReason = `Charge record is malformed (${(charge.validation_errors || []).join(', ')}).`;
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: null,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode: 'MALFORMED_CHARGE',
          reason_code: 'MALFORMED_CHARGE',
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod: matchMethod,
          match_method: matchMethod,
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: null,
          authoritative_rule: null,
          eligibilityResult: {
            isEligible: false,
            status: 'INELIGIBLE',
            reasonCode: 'MALFORMED_CHARGE',
            summary: cannotReason
          },
          eligibility_result: {
            isEligible: false,
            status: 'INELIGIBLE',
            reasonCode: 'MALFORMED_CHARGE',
            summary: cannotReason
          },
          evidence_coverage: { status: 'NONE' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          missing_evidence: ['VALID_CHARGE_RECORD'],
          conflicts: [],
          review_required: true,
          issue_type: 'MALFORMED_CHARGE',
          suggested_action: 'Correct data formatting errors in original channel fee report.'
        };
      }

      // -------------------------------------------------------------
      // 2. UNIT MATCHING GUARD: Definite identification vs Ambiguity
      // -------------------------------------------------------------
      if (!matchResult || matchResult.match_status !== MatchStatus.MATCHED) {
        let reasonCode = 'UNMATCHED_UNIT';
        let cannotReason = '';
        let issueType = 'AMBIGUOUS_UNIT_MATCH';
        let action = '';

        if (matchResult?.match_status === MatchStatus.AMBIGUOUS) {
          if (matchResult.ambiguity_flags?.includes('MULTIPLE_SKU_CANDIDATES')) {
            reasonCode = 'AMBIGUOUS_SKU';
          } else {
            reasonCode = 'AMBIGUOUS_UNIT_MATCH';
          }
          cannotReason = `Unit mapping is ambiguous. ${matchResult.match_reasons.join('. ')}.`;
          action = 'Resolve candidate ambiguities and confirm the authoritative unit identifier.';
        } else if (matchResult?.match_status === MatchStatus.INVALID) {
          reasonCode = 'INVALID_UNIT_ID';
          cannotReason = `Unit identifier syntax is invalid (${matchResult.match_reasons.join('. ')}).`;
          action = 'Correct unit identifier syntax in channel report.';
        } else {
          reasonCode = 'UNMATCHED_UNIT';
          cannotReason = `Charge could not be matched to any unit in organization '${charge.org_id}'.`;
          issueType = 'MISSING_EVIDENCE';
          action = 'Verify whether unit belongs to this organization or import missing upstream unit records.';
        }

        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: null,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode,
          reason_code: reasonCode,
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod: matchResult?.match_method || 'AMBIGUOUS_UNIT_MATCH',
          match_method: matchResult?.match_method || 'AMBIGUOUS_UNIT_MATCH',
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: null,
          authoritative_rule: null,
          eligibilityResult: {
            isEligible: false,
            status: 'INELIGIBLE',
            reasonCode,
            summary: cannotReason
          },
          eligibility_result: {
            isEligible: false,
            status: 'INELIGIBLE',
            reasonCode,
            summary: cannotReason
          },
          evidence_coverage: { status: 'NONE' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          missing_evidence: ['MATCHED_UNIT'],
          conflicts: matchResult?.ambiguity_flags || [],
          review_required: true,
          issue_type: issueType,
          suggested_action: action
        };
      }

      // -------------------------------------------------------------
      // 3. EVIDENCE: Retrieve relevant operational evidence & consistency
      // -------------------------------------------------------------
      const relevantEvidence = evidenceGraph.selectRelevantEvidence(charge.charge_type);
      const consistency = evidenceGraph.crossSourceConsistency || {
        conflicts: [],
        overall_reliability: EvidenceReliability.RELIABLE
      };

      // -------------------------------------------------------------
      // 4. AUTHORITATIVE RULE: Look up authoritative rule from registry
      // -------------------------------------------------------------
      const authoritativeRule = this.policyRegistry.getRule(charge.charge_type);

      // 4A. Missing authoritative rule -> UNCERTAIN
      if (!authoritativeRule) {
        const cannotReason = `Charge type '${charge.charge_type}' has no authoritative recovery policy configured.`;
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: unitId,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode: 'MISSING_POLICY_RULE',
          reason_code: 'MISSING_POLICY_RULE',
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod: matchMethod,
          match_method: matchMethod,
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: null,
          authoritative_rule: null,
          eligibilityResult: {
            isEligible: false,
            status: 'RULE_MISSING',
            reasonCode: 'MISSING_POLICY_RULE',
            summary: cannotReason
          },
          eligibility_result: {
            isEligible: false,
            status: 'RULE_MISSING',
            reasonCode: 'MISSING_POLICY_RULE',
            summary: cannotReason
          },
          evidence_coverage: { status: 'UNSUPPORTED' },
          evidence_reliability: { status: EvidenceReliability.INSUFFICIENT },
          contradiction_status: 'NONE',
          rule_version: '1.0.0-core',
          supporting_evidence_ids: [],
          missing_evidence: [],
          conflicts: [],
          review_required: true,
          issue_type: 'UNSUPPORTED_CHARGE_TYPE',
          suggested_action: `Define and register an authoritative policy rule for '${charge.charge_type}'.`
        };
      }

      const ruleJson = typeof authoritativeRule.toJSON === 'function'
        ? authoritativeRule.toJSON()
        : authoritativeRule;

      // 4B. Authoritative Policy Source Unavailable -> Fail open to UNCERTAIN
      if (authoritativeRule.sourceAvailable === false) {
        const cannotReason = `Authoritative policy source '${authoritativeRule.sourceName}' is temporarily unavailable. Automated claims suspended until policy authority can be verified.`;
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: unitId,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode: 'POLICY_SOURCE_UNAVAILABLE',
          reason_code: 'POLICY_SOURCE_UNAVAILABLE',
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod: matchMethod,
          match_method: matchMethod,
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: ruleJson,
          authoritative_rule: ruleJson,
          eligibilityResult: {
            isEligible: false,
            status: 'POLICY_UNAVAILABLE',
            reasonCode: 'POLICY_SOURCE_UNAVAILABLE',
            summary: cannotReason
          },
          eligibility_result: {
            isEligible: false,
            status: 'POLICY_UNAVAILABLE',
            reasonCode: 'POLICY_SOURCE_UNAVAILABLE',
            summary: cannotReason
          },
          evidence_coverage: { status: relevantEvidence.coverage_status },
          evidence_reliability: { overall: consistency.overall_reliability },
          contradiction_status: 'SOURCE_UNAVAILABLE',
          rule_version: authoritativeRule.ruleId,
          supporting_evidence_ids: [],
          missing_evidence: [],
          conflicts: ['Policy authority source unreachable'],
          review_required: true,
          issue_type: 'POLICY_SOURCE_UNAVAILABLE',
          suggested_action: 'Verify upstream policy endpoint connectivity and re-evaluate charge.'
        };
      }

      // -------------------------------------------------------------
      // 5. ELIGIBILITY: Evaluate authoritative windows & eligibility conditions
      // -------------------------------------------------------------
      const eligibilityResult = this.eligibilityEvaluator.evaluate(
        charge,
        authoritativeRule,
        evidenceGraph,
        options
      );

      // 5A. Definitely expired / ineligible -> NO_CLAIM with cannotClaim=true and explicit reason
      if (eligibilityResult.outcome === 'NO_CLAIM') {
        const cannotReason = eligibilityResult.summary;
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: unitId,
          verdict: DecisionVerdict.NO_CLAIM,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode: eligibilityResult.reasonCode || 'ELIGIBILITY_DISQUALIFIED',
          reason_code: eligibilityResult.reasonCode || 'ELIGIBILITY_DISQUALIFIED',
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod,
          match_method: matchMethod,
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: ruleJson,
          authoritative_rule: ruleJson,
          eligibilityResult,
          eligibility_result: eligibilityResult,
          evidence_coverage: { status: relevantEvidence.coverage_status },
          evidence_reliability: { overall: consistency.overall_reliability },
          contradiction_status: 'DISQUALIFIED_BY_POLICY',
          rule_version: authoritativeRule.ruleId,
          missing_evidence: [],
          conflicts: eligibilityResult.conditionsFailed || [],
          review_required: false,
          issue_type: eligibilityResult.reasonCode,
          suggested_action: 'Do not file claim; charge is permanently disqualified from recovery under authoritative Amazon policy.'
        };
      }

      // 5B. Missing dates / conflicting dates / policy unavailable -> UNCERTAIN with cannotClaim=true
      if (eligibilityResult.outcome === 'UNCERTAIN') {
        const cannotReason = eligibilityResult.summary;
        return {
          decision_id: decisionId,
          org_id: charge.org_id,
          charge_id: charge.charge_id,
          unit_id: unitId,
          verdict: DecisionVerdict.UNCERTAIN,
          amount_usd: totalChargeAmount,
          total_charge_amount: totalChargeAmount,
          charge_amount_usd: totalChargeAmount,
          claim_amount_usd: 0.00,
          recoverable_amount_usd: 0.00,
          disputable_amount: totalChargeAmount,
          currency: charge.currency || 'USD',
          reason: `CANNOT CLAIM: ${cannotReason}`,
          reasonCode: eligibilityResult.reasonCode || 'ELIGIBILITY_UNCERTAIN',
          reason_code: eligibilityResult.reasonCode || 'ELIGIBILITY_UNCERTAIN',
          explanation: `CANNOT CLAIM: ${cannotReason}`,
          cannotClaim: true,
          cannot_claim: true,
          cannotClaimReason: cannotReason,
          cannot_claim_reason: cannotReason,
          matchMethod,
          match_method: matchMethod,
          supportingEvidence: [],
          supporting_evidence: [],
          supporting_evidence_ids: [],
          authoritativeRule: ruleJson,
          authoritative_rule: ruleJson,
          eligibilityResult,
          eligibility_result: eligibilityResult,
          evidence_coverage: { status: relevantEvidence.coverage_status },
          evidence_reliability: { overall: consistency.overall_reliability },
          contradiction_status: 'ELIGIBILITY_INDETERMINATE',
          rule_version: authoritativeRule.ruleId,
          missing_evidence: eligibilityResult.status === 'MISSING_DATES' ? ['CHARGE_POSTED_DATE'] : [],
          conflicts: eligibilityResult.conditionsFailed || [],
          review_required: true,
          issue_type: eligibilityResult.reasonCode,
          suggested_action: 'Review timeline and date discrepancies to confirm authoritative eligibility.'
        };
      }

      // -------------------------------------------------------------
      // 6. POLICY EXECUTION: Evidence interpretation (for definitely eligible charges)
      // -------------------------------------------------------------
      const policyClass = authoritativeRule.policyClass || this.policyRegistry.getPolicy(charge.charge_type);
      const policyResult = policyClass.evaluate(charge, evidenceGraph, tenantRepo);

      // Build structured supporting evidence objects
      const supportingIds = policyResult.supporting_evidence_ids || [];
      const supportingEvidence = supportingIds.map(id => {
        const record = (evidenceGraph.allRecords || []).find(r => r.evidence_id === id);
        if (record) {
          return {
            evidenceId: record.evidence_id,
            stage: record.stage,
            capturedAt: record.captured_at,
            reliability: record.reliability_status,
            operatorId: record.operator_id
          };
        }
        return { evidenceId: id, stage: 'AUDIT', reliability: 'RELIABLE' };
      });

      // -------------------------------------------------------------
      // 7. FINAL DECISION: Synthesize Evidence Interpretation + Eligibility
      // A charge can ONLY become CLAIM when:
      //  1. Evidence directly contradicts the charge (policyResult.verdict === CLAIM)
      //  AND
      //  2. Authoritative eligibility conditions are satisfied (eligibilityResult.isEligible === true)
      // -------------------------------------------------------------
      let verdict = policyResult.verdict;
      let reasonCode = policyResult.reasonCode;
      let explanation = policyResult.reason;
      let cannotClaim = false;
      let cannotClaimReason = null;
      let claimAmountUsd = 0.00;

      if (policyResult.verdict === DecisionVerdict.CLAIM) {
        // Evidence contradicts charge AND authoritative eligibility is satisfied -> CLAIM
        verdict = DecisionVerdict.CLAIM;
        cannotClaim = false;
        cannotClaimReason = null;
        reasonCode = policyResult.reasonCode || 'RECOVERABLE_EVIDENCE_CONTRADICTION';
        claimAmountUsd = policyResult.amount_usd !== undefined && policyResult.amount_usd > 0
          ? policyResult.amount_usd
          : totalChargeAmount;
      } else if (policyResult.verdict === DecisionVerdict.NO_CLAIM) {
        verdict = DecisionVerdict.NO_CLAIM;
        cannotClaim = true;
        cannotClaimReason = policyResult.reason;
        reasonCode = policyResult.reasonCode || 'CHARGE_CONFIRMED_VALID';
        claimAmountUsd = 0.00;
      } else {
        // UNCERTAIN from policy (missing evidence, zero valuation, conflict)
        verdict = DecisionVerdict.UNCERTAIN;
        cannotClaim = true;
        cannotClaimReason = policyResult.reason;
        reasonCode = policyResult.reasonCode || 'UNCERTAIN_OPERATIONAL_EVIDENCE';
        claimAmountUsd = 0.00;
      }

      return {
        decision_id: decisionId,
        org_id: charge.org_id,
        charge_id: charge.charge_id,
        unit_id: unitId,
        verdict,
        amount_usd: totalChargeAmount,
        total_charge_amount: totalChargeAmount,
        charge_amount_usd: totalChargeAmount,
        claim_amount_usd: claimAmountUsd,
        recoverable_amount_usd: claimAmountUsd,
        disputable_amount: policyResult.disputable_amount !== undefined
          ? policyResult.disputable_amount
          : totalChargeAmount,
        currency: charge.currency || 'USD',
        reason: explanation,
        reasonCode,
        reason_code: reasonCode,
        explanation,
        cannotClaim,
        cannot_claim: cannotClaim,
        cannotClaimReason,
        cannot_claim_reason: cannotClaimReason,
        matchMethod,
        match_method: matchMethod,
        supportingEvidence,
        supporting_evidence: supportingEvidence,
        supporting_evidence_ids: supportingIds,
        authoritativeRule: ruleJson,
        authoritative_rule: ruleJson,
        eligibilityResult,
        eligibility_result: eligibilityResult,
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
        rule_version: authoritativeRule.ruleId || policyClass.ruleVersion,
        missing_evidence: policyResult.missing_evidence || [],
        conflicts: [
          ...(policyResult.conflicts || []),
          ...consistency.conflicts.map(c => c.message)
        ],
        review_required: verdict === DecisionVerdict.UNCERTAIN || policyResult.review_required,
        issue_type: policyResult.issue_type || (verdict === DecisionVerdict.UNCERTAIN ? reasonCode : null),
        suggested_action: policyResult.suggested_action || (cannotClaim ? cannotClaimReason : null)
      };

    } catch (err) {
      // 8. FAIL-OPEN BEHAVIOR: Never drop claims on runtime errors
      const cannotReason = `Processing error encountered during decision evaluation: ${err.message}. Case routed to human review to preserve recovery rights.`;
      return {
        decision_id: decisionId,
        org_id: charge.org_id,
        charge_id: charge.charge_id,
        unit_id: unitId,
        verdict: DecisionVerdict.UNCERTAIN,
        amount_usd: totalChargeAmount,
        total_charge_amount: totalChargeAmount,
        charge_amount_usd: totalChargeAmount,
        claim_amount_usd: 0.00,
        recoverable_amount_usd: 0.00,
        disputable_amount: totalChargeAmount,
        currency: charge.currency || 'USD',
        reason: cannotReason,
        reasonCode: 'SYSTEM_FAILURE',
        reason_code: 'SYSTEM_FAILURE',
        explanation: cannotReason,
        cannotClaim: true,
        cannot_claim: true,
        cannotClaimReason: cannotReason,
        cannot_claim_reason: cannotReason,
        matchMethod,
        match_method: matchMethod,
        supportingEvidence: [],
        supporting_evidence: [],
        supporting_evidence_ids: [],
        authoritativeRule: null,
        authoritative_rule: null,
        eligibilityResult: {
          isEligible: false,
          status: 'ERROR',
          reasonCode: 'SYSTEM_FAILURE',
          summary: err.message
        },
        eligibility_result: {
          isEligible: false,
          status: 'ERROR',
          reasonCode: 'SYSTEM_FAILURE',
          summary: err.message
        },
        evidence_coverage: { status: 'INCOMPLETE' },
        evidence_reliability: { status: EvidenceReliability.DEGRADED },
        contradiction_status: 'PROCESSING_ERROR',
        rule_version: '1.0.0-core',
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
