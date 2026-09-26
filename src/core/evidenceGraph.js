/**
 * REMA - Recovery Manager
 * Unit Evidence Graph Builder & Relevant Evidence Selector
 */

const { Stage, EvidenceReliability } = require('./types');
const ReliabilityEngine = require('./reliability');

class EvidenceGraph {
  constructor(unitId, orgId, stages = {}) {
    this.unitId = unitId;
    this.orgId = orgId;
    this.receiving = stages.receiving || null;
    this.prep = stages.prep || null;
    this.pack = stages.pack || null;
    this.returns = stages.returns || null;
    this.recordReliability = {};
    this.crossSourceConsistency = null;
  }

  /**
   * Builds an Evidence Graph for a unit from the tenant database
   */
  static buildForUnit(unitId, tenantRepo) {
    if (!unitId) {
      return new EvidenceGraph(null, tenantRepo.orgId);
    }

    const records = tenantRepo.getEvidenceForUnit(unitId);
    const stages = {};

    for (const r of records) {
      if (r.stage === Stage.RECEIVING) stages.receiving = r;
      else if (r.stage === Stage.PREP) stages.prep = r;
      else if (r.stage === Stage.PACK) stages.pack = r;
      else if (r.stage === Stage.RETURNS) stages.returns = r;
    }

    const graph = new EvidenceGraph(unitId, tenantRepo.orgId, stages);

    // Assess individual record reliability
    for (const [stageName, record] of Object.entries(stages)) {
      if (record) {
        graph.recordReliability[stageName] = ReliabilityEngine.assessEvidenceRecord(record);
      }
    }

    // Assess cross-source consistency
    graph.crossSourceConsistency = ReliabilityEngine.assessCrossSourceConsistency(graph);

    return graph;
  }

  /**
   * Selects relevant evidence records for a specific charge type
   * (Explicit relevance filtering: does NOT dump all upstream records indiscriminately)
   */
  selectRelevantEvidence(chargeType) {
    const relevant = {
      charge_type: chargeType,
      required_stages: [],
      available_stages: [],
      missing_stages: [],
      records: {},
      relevance_rationales: {}
    };

    switch (chargeType) {
      case 'inbound_defect_fee':
        relevant.required_stages = [Stage.PREP];
        relevant.relevance_rationales[Stage.PREP] = 'Prep compliance audit (polybag, suffocation warning, FNSKU placement, barcode coverage, handling marks) directly disproves or confirms inbound prep defects';
        // Receiving is an authoritative cross-check to detect pre-existing supplier damage
        if (this.receiving) {
          relevant.records[Stage.RECEIVING] = this.receiving;
          relevant.relevance_rationales[Stage.RECEIVING] = 'Receiving record verifies physical package condition on arrival prior to prep handling';
        }
        break;

      case 'fulfilment_fee_weight_tier':
        relevant.required_stages = [Stage.PREP];
        relevant.relevance_rationales[Stage.PREP] = 'Prep packaging specification determines dimensional envelope and verified weight tier';
        if (this.receiving) {
          relevant.records[Stage.RECEIVING] = this.receiving;
          relevant.relevance_rationales[Stage.RECEIVING] = 'Receiving specification establishes baseline product dimensions and catalog variant specs';
        }
        break;

      case 'lost_inbound':
        relevant.required_stages = [Stage.RECEIVING];
        relevant.relevance_rationales[Stage.RECEIVING] = 'Receiving carton and unit count verifies whether inventory was delivered and checked in';
        if (this.prep) {
          relevant.records[Stage.PREP] = this.prep;
          relevant.relevance_rationales[Stage.PREP] = 'Prep timestamp proves item was actively handled inside warehouse after receipt';
        }
        break;

      case 'refund_issued_item_not_returned':
        relevant.required_stages = [Stage.RETURNS];
        relevant.relevance_rationales[Stage.RETURNS] = 'Returns inspection record establishes physical return of item and recorded disposition';
        break;

      case 'damaged_in_warehouse':
        relevant.required_stages = [Stage.RECEIVING];
        relevant.relevance_rationales[Stage.RECEIVING] = 'Receiving condition verifies whether damage occurred before arrival or inside warehouse';
        if (this.prep) {
          relevant.records[Stage.PREP] = this.prep;
          relevant.relevance_rationales[Stage.PREP] = 'Prep audit confirms item condition at time of secondary packaging';
        }
        break;

      default:
        relevant.required_stages = [];
        break;
    }

    // Determine available and missing required stages
    for (const reqStage of relevant.required_stages) {
      const stageKey = reqStage.toLowerCase();
      if (this[stageKey]) {
        relevant.available_stages.push(reqStage);
        relevant.records[reqStage] = this[stageKey];
      } else {
        relevant.missing_stages.push(reqStage);
      }
    }

    const hasAllRequired = relevant.missing_stages.length === 0;
    const coverageStatus = hasAllRequired
      ? 'COMPLETE'
      : (relevant.available_stages.length > 0 ? 'PARTIAL' : 'MISSING');

    return {
      ...relevant,
      coverage_status: coverageStatus,
      is_coverage_complete: hasAllRequired
    };
  }
}

module.exports = EvidenceGraph;
