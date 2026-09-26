/**
 * REMA - Recovery Manager
 * Audit Trail Service
 */

class AuditTrailService {
  /**
   * Logs a complete stage-by-stage event into the audit trail
   */
  static recordEvent(tenantRepo, eventType, chargeId, unitId, decisionId, details) {
    tenantRepo.logAudit({
      charge_id: chargeId,
      unit_id: unitId,
      decision_id: decisionId,
      event_type: eventType,
      details,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Retrieves full chronological lineage for a decision or charge:
   * CHARGE -> NORMALIZED -> MATCHED -> EVIDENCE -> ASSESSMENT -> CONTRADICTION -> DECISION -> CLAIM
   */
  static getLineage(tenantRepo, decisionId = null, chargeId = null) {
    return tenantRepo.getAuditTrail(decisionId, chargeId);
  }
}

module.exports = AuditTrailService;
