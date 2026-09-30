/**
 * REMA - Recovery Manager
 * Authoritative Eligibility Evaluator
 *
 * Implements strict authoritative eligibility semantics:
 * - Definitely expired / ineligible -> NO_CLAIM with cannotClaim=true and explicit reason
 * - Definitely eligible -> outcome: 'CONTINUE' (proceed to evidence/policy evaluation)
 * - Missing dates / insufficient information -> UNCERTAIN
 * - Conflicting dates -> UNCERTAIN
 * - Authoritative policy unavailable -> UNCERTAIN
 */

class EligibilityEvaluator {
  /**
   * Evaluates a charge against its authoritative policy rule and evidence graph
   *
   * @param {Object} charge - Normalized charge record
   * @param {AuthoritativeRule} rule - Authoritative policy rule
   * @param {EvidenceGraph} evidenceGraph - Assembled unit evidence graph
   * @param {Object} [options] - Optional evaluation parameters (e.g., evaluationDate)
   * @returns {Object} Structured eligibility result
   */
  static evaluate(charge, rule, evidenceGraph, options = {}) {
    const evaluatedAt = new Date().toISOString();

    // 1. Authoritative policy rule missing -> UNCERTAIN
    if (!rule) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'RULE_MISSING',
        reasonCode: 'MISSING_POLICY_RULE',
        evaluatedAt,
        windowDays: null,
        chargeAgeDays: null,
        conditionsMet: [],
        conditionsFailed: ['No authoritative policy rule configured for this charge type'],
        summary: `Charge type '${charge.charge_type}' lacks an authoritative recovery rule.`
      };
    }

    // 2. Authoritative policy source unavailable -> UNCERTAIN
    if (rule.sourceAvailable === false) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'POLICY_UNAVAILABLE',
        reasonCode: 'POLICY_SOURCE_UNAVAILABLE',
        evaluatedAt,
        windowDays: null,
        chargeAgeDays: null,
        conditionsMet: [],
        conditionsFailed: ['Authoritative policy source is currently unreachable or unverified'],
        summary: `Authoritative policy source '${rule.sourceName}' is currently unavailable.`
      };
    }

    // 3. Missing dates or insufficient information to determine eligibility -> UNCERTAIN
    const rawPostedDate = charge.posted_date || charge.raw_record?.posted_date || charge.raw_record?.charge_date;
    const hasMissingDates = charge.missing_dates || charge.raw_record?.missing_dates || !rawPostedDate || rawPostedDate.trim() === '';

    if (hasMissingDates) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'MISSING_DATES',
        reasonCode: 'MISSING_ELIGIBILITY_DATE',
        evaluatedAt,
        windowDays: null,
        chargeAgeDays: null,
        conditionsMet: [],
        conditionsFailed: ['Charge posted date or operational milestone timestamps are missing'],
        summary: 'Cannot verify filing window eligibility: charge posted date is missing or insufficient.'
      };
    }

    const postedTime = new Date(rawPostedDate).getTime();
    if (isNaN(postedTime)) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'INVALID_DATE',
        reasonCode: 'MISSING_ELIGIBILITY_DATE',
        evaluatedAt,
        windowDays: null,
        chargeAgeDays: null,
        conditionsMet: [],
        conditionsFailed: [`Invalid charge date format: '${rawPostedDate}'`],
        summary: `Charge date '${rawPostedDate}' cannot be parsed to verify eligibility window.`
      };
    }

    // 4. Conflicting dates -> UNCERTAIN
    let dateConflict = null;
    if (charge.conflicting_dates || charge.raw_record?.conflicting_dates) {
      dateConflict = 'Conflicting event dates flagged between charge date and operational milestone timestamps';
    } else if (evidenceGraph && evidenceGraph.allRecords && evidenceGraph.allRecords.length > 0) {
      for (const rec of evidenceGraph.allRecords) {
        if (rec.captured_at) {
          const recTime = new Date(rec.captured_at).getTime();
          // If receiving or prep record was captured AFTER the fee was already posted, that is chronologically conflicting
          if (!isNaN(recTime) && recTime > postedTime + (24 * 60 * 60 * 1000)) {
            dateConflict = `Operational evidence (${rec.evidence_id || rec.stage}) timestamp (${rec.captured_at}) post-dates the assessed charge posted date (${rawPostedDate})`;
            break;
          }
        }
      }
    }

    if (dateConflict) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'CONFLICTING_DATES',
        reasonCode: 'CONFLICTING_DATES',
        evaluatedAt,
        windowDays: null,
        chargeAgeDays: null,
        conditionsMet: [],
        conditionsFailed: [dateConflict],
        summary: `Cannot determine eligibility due to contradictory chronology: ${dateConflict}.`
      };
    }

    // 5. Compute charge age relative to reference evaluation date
    const refDateStr = options.evaluationDate ||
      options.referenceDate ||
      charge.evaluation_date ||
      '2026-07-31T00:00:00Z';

    const refTime = new Date(refDateStr).getTime();
    const chargeAgeDays = Math.max(0, Math.floor((refTime - postedTime) / (1000 * 60 * 60 * 24)));

    // 6. Time-based filing deadline: Definitely expired -> NO_CLAIM
    const windowCond = (rule.eligibilityConditions || []).find(c => c.maxAgeDays);
    const windowDays = windowCond ? windowCond.maxAgeDays : null;
    const isExpired = charge.is_expired || charge.raw_record?.is_expired || (windowDays && chargeAgeDays > windowDays);

    if (isExpired) {
      return {
        isEligible: false,
        outcome: 'NO_CLAIM',
        status: 'EXPIRED',
        reasonCode: 'ELIGIBILITY_EXPIRED',
        evaluatedAt,
        windowDays,
        chargeAgeDays,
        conditionsMet: [],
        conditionsFailed: [
          `Filing window expired: charge age is ${chargeAgeDays} days (authoritative maximum is ${windowDays} days under ${rule.ruleId})`
        ],
        summary: `Authoritative claim filing window of ${windowDays} days has expired (${chargeAgeDays} days elapsed). Disqualified from recovery under ${rule.ruleId}.`
      };
    }

    // 7. Definitely ineligible override -> NO_CLAIM
    const isIneligible = charge.is_ineligible || charge.raw_record?.is_ineligible;
    if (isIneligible) {
      const failReason = charge.ineligible_reason || charge.raw_record?.ineligible_reason || 'Explicitly failed authoritative eligibility check';
      return {
        isEligible: false,
        outcome: 'NO_CLAIM',
        status: 'INELIGIBLE',
        reasonCode: 'ELIGIBILITY_INELIGIBLE',
        evaluatedAt,
        windowDays,
        chargeAgeDays,
        conditionsMet: [],
        conditionsFailed: [failReason],
        summary: `Disqualified from recovery: ${failReason}.`
      };
    }

    // 8. Mandatory wait window (e.g. customer return transit wait)
    const minWaitCond = (rule.eligibilityConditions || []).find(c => c.minAgeDays);
    const enforceMinWait = charge.enforce_min_wait || charge.raw_record?.enforce_min_wait;
    if (minWaitCond && enforceMinWait && chargeAgeDays < minWaitCond.minAgeDays) {
      return {
        isEligible: false,
        outcome: 'UNCERTAIN',
        status: 'PREMATURE_CLAIM',
        reasonCode: 'CLAIM_PREMATURE_WAIT_WINDOW',
        evaluatedAt,
        windowDays,
        chargeAgeDays,
        conditionsMet: [],
        conditionsFailed: [
          `Mandatory wait window of ${minWaitCond.minAgeDays} days not reached (${chargeAgeDays} days elapsed)`
        ],
        summary: `Claim premature: must wait ${minWaitCond.minAgeDays} days after refund before filing unreturned item claim.`
      };
    }

    // 9. Definitely eligible -> outcome: 'CONTINUE'
    const conditionsMet = [];
    if (windowDays) {
      conditionsMet.push(`Within allowable ${windowDays}-day claim window (${chargeAgeDays} days elapsed)`);
    }
    for (const cond of (rule.eligibilityConditions || [])) {
      if (!cond.maxAgeDays && !cond.minAgeDays) {
        conditionsMet.push(cond.name);
      }
    }

    return {
      isEligible: true,
      outcome: 'CONTINUE',
      status: 'ELIGIBLE',
      reasonCode: 'ELIGIBLE',
      evaluatedAt,
      windowDays,
      chargeAgeDays,
      conditionsMet,
      conditionsFailed: [],
      summary: `All authoritative eligibility conditions satisfied under rule ${rule.ruleId}. Proceeding to evidence evaluation.`
    };
  }
}

module.exports = EligibilityEvaluator;
