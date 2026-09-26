/**
 * REMA - Recovery Manager
 * Charge -> Unit Matching Layer
 */

const { MatchStatus } = require('./types');

class Matcher {
  /**
   * Matches a normalized charge to a unit in the tenant database
   *
   * @param {Object} charge - Normalized charge object
   * @param {TenantRepository} tenantRepo - Tenant-scoped repository
   * @returns {Object} Matching result with status, reasons, and ambiguity flags
   */
  static matchChargeToUnit(charge, tenantRepo) {
    const rawUnitId = charge.unit_id ? charge.unit_id.trim() : null;

    // 1. Check for invalid or malformed unit_id syntax
    if (rawUnitId && !/^UNIT-\d{4}$/.test(rawUnitId)) {
      return {
        matched_unit_id: null,
        match_method: 'SYNTAX_VALIDATION',
        match_status: MatchStatus.INVALID,
        candidates: [],
        match_reasons: [`Unit ID '${rawUnitId}' does not conform to UNIT-XXXX format`],
        ambiguity_flags: ['MALFORMED_UNIT_IDENTIFIER']
      };
    }

    // 2. Direct exact unit_id match
    if (rawUnitId) {
      const existingUnit = tenantRepo.getUnit(rawUnitId);
      if (existingUnit) {
        // Validate cross-identifier consistency (e.g. SKU, FNSKU, Order ID)
        const ambiguityFlags = [];
        const matchReasons = [`Exact unit_id match found for ${rawUnitId}`];

        if (charge.sku && existingUnit.sku && charge.sku !== existingUnit.sku) {
          ambiguityFlags.push('SKU_MISMATCH');
          matchReasons.push(`Charge SKU '${charge.sku}' differs from Unit SKU '${existingUnit.sku}'`);
        }
        if (charge.fnsku && existingUnit.fnsku && charge.fnsku !== existingUnit.fnsku) {
          ambiguityFlags.push('FNSKU_MISMATCH');
          matchReasons.push(`Charge FNSKU '${charge.fnsku}' differs from Unit FNSKU '${existingUnit.fnsku}'`);
        }

        if (ambiguityFlags.length > 0) {
          return {
            matched_unit_id: rawUnitId,
            match_method: 'EXACT_UNIT_ID_WITH_CONFLICTS',
            match_status: MatchStatus.AMBIGUOUS,
            candidates: [existingUnit],
            match_reasons: matchReasons,
            ambiguity_flags: ambiguityFlags
          };
        }

        return {
          matched_unit_id: rawUnitId,
          match_method: 'EXACT_UNIT_ID',
          match_status: MatchStatus.MATCHED,
          candidates: [existingUnit],
          match_reasons: matchReasons,
          ambiguity_flags: []
        };
      }
    }

    // 3. Fallback matching when unit_id is missing: search by secondary keys (fnsku, order_id, fba_shipment_id + sku)
    const candidates = [];
    const allUnits = tenantRepo.listUnits();

    if (charge.fnsku) {
      const fnskuMatches = allUnits.filter(u => u.fnsku === charge.fnsku);
      if (fnskuMatches.length === 1) {
        return {
          matched_unit_id: fnskuMatches[0].unit_id,
          match_method: 'SECONDARY_KEY_FNSKU',
          match_status: MatchStatus.MATCHED,
          candidates: fnskuMatches,
          match_reasons: [`Matched via unique FNSKU '${charge.fnsku}'`],
          ambiguity_flags: []
        };
      } else if (fnskuMatches.length > 1) {
        return {
          matched_unit_id: null,
          match_method: 'SECONDARY_KEY_FNSKU',
          match_status: MatchStatus.AMBIGUOUS,
          candidates: fnskuMatches,
          match_reasons: [`Multiple units (${fnskuMatches.length}) share FNSKU '${charge.fnsku}'`],
          ambiguity_flags: ['MULTIPLE_FNSKU_CANDIDATES']
        };
      }
    }

    // 4. Missing unit_id and no secondary match
    if (!rawUnitId) {
      return {
        matched_unit_id: null,
        match_method: 'NONE',
        match_status: MatchStatus.UNMATCHED,
        candidates: [],
        match_reasons: ['Charge has no unit_id and cannot be resolved through secondary keys'],
        ambiguity_flags: ['MISSING_UNIT_ID']
      };
    }

    // 5. Unit ID specified in charge but not found in tenant database
    return {
      matched_unit_id: null,
      match_method: 'EXACT_UNIT_ID',
      match_status: MatchStatus.UNMATCHED,
      candidates: [],
      match_reasons: [`Unit '${rawUnitId}' does not exist in tenant organization '${tenantRepo.orgId}'`],
      ambiguity_flags: ['UNIT_NOT_FOUND_IN_TENANT']
    };
  }
}

module.exports = Matcher;
