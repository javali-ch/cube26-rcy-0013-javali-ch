/**
 * REMA - Recovery Manager
 * Core Domain Constants and Types
 */

const ChargeType = {
  INBOUND_DEFECT_FEE: 'inbound_defect_fee',
  FULFILMENT_FEE_WEIGHT_TIER: 'fulfilment_fee_weight_tier',
  LOST_INBOUND: 'lost_inbound',
  REFUND_ISSUED_ITEM_NOT_RETURNED: 'refund_issued_item_not_returned',
  DAMAGED_IN_WAREHOUSE: 'damaged_in_warehouse'
};

const DecisionVerdict = {
  CLAIM: 'CLAIM',
  NO_CLAIM: 'NO_CLAIM',
  UNCERTAIN: 'UNCERTAIN'
};

const EvidenceState = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNCERTAIN: 'UNCERTAIN',
  MISSING: 'MISSING'
};

const EvidenceReliability = {
  RELIABLE: 'RELIABLE',
  DEGRADED: 'DEGRADED',
  CONFLICTED: 'CONFLICTED',
  INSUFFICIENT: 'INSUFFICIENT'
};

const MatchStatus = {
  MATCHED: 'MATCHED',
  UNMATCHED: 'UNMATCHED',
  AMBIGUOUS: 'AMBIGUOUS',
  INVALID: 'INVALID'
};

const ReviewIssueType = {
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
  AMBIGUOUS_UNIT_MATCH: 'AMBIGUOUS_UNIT_MATCH',
  MALFORMED_CHARGE: 'MALFORMED_CHARGE',
  UNSUPPORTED_CHARGE_TYPE: 'UNSUPPORTED_CHARGE_TYPE',
  DEGRADED_EVIDENCE: 'DEGRADED_EVIDENCE',
  ZERO_VALUATION: 'ZERO_VALUATION',
  SYSTEM_FAILURE: 'SYSTEM_FAILURE'
};

const ReviewSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const ReviewStatus = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED'
};

const Stage = {
  RECEIVING: 'RECEIVING',
  PREP: 'PREP',
  PACK: 'PACK',
  RETURNS: 'RETURNS'
};

module.exports = {
  ChargeType,
  DecisionVerdict,
  EvidenceState,
  EvidenceReliability,
  MatchStatus,
  ReviewIssueType,
  ReviewSeverity,
  ReviewStatus,
  Stage
};
