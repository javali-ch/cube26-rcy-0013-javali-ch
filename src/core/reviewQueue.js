/**
 * REMA - Recovery Manager
 * Human Review Queue Manager
 */

const { ReviewSeverity, ReviewStatus } = require('./types');

class ReviewQueueManager {
  /**
   * Enqueues an issue into the human review queue
   */
  static enqueueReview(charge, decision, tenantRepo) {
    const reviewId = `REV-${charge.charge_id}`;

    // Determine severity based on issue type and financial exposure
    let severity = ReviewSeverity.MEDIUM;
    if (decision.issue_type === 'MALFORMED_CHARGE' || decision.issue_type === 'SYSTEM_FAILURE') {
      severity = ReviewSeverity.HIGH;
    } else if (charge.amount_usd > 10.00) {
      severity = ReviewSeverity.HIGH;
    } else if (decision.issue_type === 'ZERO_VALUATION') {
      severity = ReviewSeverity.MEDIUM;
    } else if (decision.issue_type === 'DEGRADED_EVIDENCE') {
      severity = ReviewSeverity.LOW;
    }

    const reviewItem = {
      review_id: reviewId,
      org_id: charge.org_id,
      charge_id: charge.charge_id,
      unit_id: decision.unit_id || null,
      decision_id: decision.decision_id,
      issue_type: decision.issue_type || 'UNCERTAIN_OUTCOME',
      severity,
      missing_evidence: decision.missing_evidence && decision.missing_evidence.length > 0
        ? decision.missing_evidence.join(', ')
        : null,
      conflicting_evidence: decision.conflicts && decision.conflicts.length > 0
        ? decision.conflicts.join('; ')
        : null,
      suggested_action: decision.suggested_action || 'Review charge and operational evidence records.',
      status: ReviewStatus.PENDING,
      created_at: new Date().toISOString()
    };

    tenantRepo.insertReview(reviewItem);

    // Also record audit log event
    tenantRepo.logAudit({
      charge_id: charge.charge_id,
      unit_id: decision.unit_id,
      decision_id: decision.decision_id,
      event_type: 'REVIEW_ENQUEUED',
      details: {
        review_id: reviewId,
        issue_type: reviewItem.issue_type,
        severity: reviewItem.severity,
        suggested_action: reviewItem.suggested_action
      }
    });

    return reviewItem;
  }
}

module.exports = ReviewQueueManager;
