/**
 * REMA - Recovery Manager
 * Policy Registry & Grounding Verification
 *
 * Official Amazon FBA Program Policies & Reimbursement Guidelines:
 * - VERIFIED: Inbound Defect Problem Investigation Policy (Amazon Seller Central GL5XA3MNXAJKJE8E)
 * - VERIFIED: FBA Fees Reimbursement Policy: Weight & Dimensions (Amazon Seller Central 90-day window)
 * - PENDING VERIFICATION / UNAVAILABLE:
 *   - Lost Inbound (Shipment to Amazon) - Unverified against linked source G200453320; marked sourceAvailable: false
 *   - Customer Return Claims - Unverified against linked source G200453320; marked sourceAvailable: false
 *   - Damaged in Warehouse - Unverified against linked source G200453320; marked sourceAvailable: false
 */

const InboundDefectPolicy = require('./inboundDefect');
const WeightTierPolicy = require('./weightTier');
const LostInboundPolicy = require('./lostInbound');
const RefundUnreturnedPolicy = require('./refundUnreturned');
const DamagedWarehousePolicy = require('./damagedWarehouse');

/**
 * Authoritative Rule Definition Class
 */
class AuthoritativeRule {
  constructor(config) {
    this.ruleId = config.ruleId;
    this.chargeType = config.chargeType;
    this.sourceName = config.sourceName;
    this.sourceUrl = config.sourceUrl;
    this.checkedAt = config.checkedAt || new Date().toISOString();
    this.effectiveDate = config.effectiveDate;
    this.sourceAvailable = config.sourceAvailable !== undefined ? config.sourceAvailable : true;
    this.eligibilityConditions = config.eligibilityConditions || [];
    this.claimConditions = config.claimConditions || [];
    this.policyClass = config.policyClass || null;
    this.ruleVersion = config.ruleVersion || '2.0.0-authoritative';
  }

  toJSON() {
    return {
      ruleId: this.ruleId,
      chargeType: this.chargeType,
      sourceName: this.sourceName,
      sourceUrl: this.sourceUrl,
      checkedAt: this.checkedAt,
      effectiveDate: this.effectiveDate,
      sourceAvailable: this.sourceAvailable,
      eligibilityConditions: this.eligibilityConditions,
      claimConditions: this.claimConditions,
      ruleVersion: this.ruleVersion
    };
  }
}

/**
 * Authoritative Policy Registry Class
 */
class AuthoritativePolicyRegistry {
  constructor() {
    this.rules = new Map();
    this.registerDefaultAuthoritativeRules();
  }

  /**
   * Initializes authoritative rules retrieved from Amazon Seller Central policy references
   */
  registerDefaultAuthoritativeRules() {
    // 1. Inbound Defect Fee Rule
    this.registerRule(new AuthoritativeRule({
      ruleId: 'AMZ-FBA-RULE-INBOUND-DEFECT-001',
      chargeType: 'inbound_defect_fee',
      sourceName: 'Amazon Seller Central - Inbound Defect Problem Investigation Policy & FBA Inbound Placement Service Fees',
      sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/GL5XA3MNXAJKJE8E',
      checkedAt: '2026-09-26T12:00:00Z',
      effectiveDate: '2024-03-01',
      sourceAvailable: true,
      ruleVersion: '2.0.0-inbound-defect',
      policyClass: InboundDefectPolicy,
      eligibilityConditions: [
        {
          conditionId: 'ELIG-DEFECT-90D-WINDOW',
          name: '90-Day Dispute Lookback Window',
          description: 'Dispute investigation must be initiated within 90 calendar days of shipment problem notification date.',
          maxAgeDays: 90
        },
        {
          conditionId: 'ELIG-DEFECT-UNIQUE-UNIT',
          name: 'Unambiguous Unit Identification',
          description: 'Charge record must resolve unambiguously to a specific tracked unit in internal prep systems.'
        },
        {
          conditionId: 'ELIG-DEFECT-UPSTREAM-LOG',
          name: 'Upstream Prep Compliance Audit Available',
          description: 'Audit requires verified operator prep station compliance record with physical packaging checks.'
        }
      ],
      claimConditions: [
        {
          conditionId: 'CLAIM-PREP-STANDARDS-MET',
          name: 'Prep Packaging Verification',
          description: 'Internal prep audit verifies polybagging, suffocation warnings, flat FNSKU placement, covered original barcodes, and handling marks all passed.'
        },
        {
          conditionId: 'CLAIM-NO-RECEIVING-DESTRUCTION',
          name: 'Absence of Severe Inbound Damage',
          description: 'Receiving dock inspection logs contain no unrefuted obvious defects or destroyed cartons originating from seller.'
        },
        {
          conditionId: 'CLAIM-POSITIVE-RECOVERY',
          name: 'Positive Line Charge Assessment',
          description: 'Charge amount on record must be greater than $0.00 to construct defensible financial recovery.'
        }
      ]
    }));

    // 2. Fulfillment Fee Weight Tier Rule
    this.registerRule(new AuthoritativeRule({
      ruleId: 'AMZ-FBA-RULE-WEIGHT-TIER-002',
      chargeType: 'fulfilment_fee_weight_tier',
      sourceName: 'Amazon Seller Central - FBA Fulfillment Fee Remeasurement and Reimbursement Policy',
      sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200453320',
      checkedAt: '2026-09-26T12:00:00Z',
      effectiveDate: '2024-04-15',
      sourceAvailable: true,
      ruleVersion: '2.0.0-weight-tier',
      policyClass: WeightTierPolicy,
      eligibilityConditions: [
        {
          conditionId: 'ELIG-TIER-90D-WINDOW',
          name: '90-Day Remeasurement Lookback Window',
          description: 'Overcharge reimbursement is applicable to orders dispatched within 90 calendar days prior to audit request.',
          maxAgeDays: 90
        },
        {
          conditionId: 'ELIG-TIER-CATALOG-SKU',
          name: 'Catalog SKU Baseline History',
          description: 'Product SKU must have verifiable baseline packaging dimensions and established historical fee tier.'
        }
      ],
      claimConditions: [
        {
          conditionId: 'CLAIM-PACKAGING-DIMENSIONS',
          name: 'Standard Packaging Compliance',
          description: 'Prep and pack operational logs prove packaging conforms to standard dimensional weight tier specifications.'
        },
        {
          conditionId: 'CLAIM-EXCEEDS-BASELINE-FEE',
          name: 'Elevated Fee vs Historical Baseline',
          description: 'Reported fee exceeds lowest documented baseline fee for identical SKU in tenant organization.'
        },
        {
          conditionId: 'CLAIM-DISPUTABLE-DELTA',
          name: 'Positive Overcharge Delta',
          description: 'Disputable recovery amount must represent positive variance between reported fee and baseline tier.'
        }
      ]
    }));

    // 3. Lost Inbound Inventory Rule (Policy Source Unverified - Marked Unavailable)
    this.registerRule(new AuthoritativeRule({
      ruleId: 'AMZ-FBA-RULE-LOST-INBOUND-003',
      chargeType: 'lost_inbound',
      sourceName: 'Amazon Seller Central - FBA Inventory Reimbursement Policy: Shipment to Amazon',
      sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200453320',
      checkedAt: '2026-09-26T12:00:00Z',
      effectiveDate: null,
      sourceAvailable: false,
      ruleVersion: '2.0.0-lost-inbound-unverified',
      policyClass: LostInboundPolicy,
      eligibilityConditions: [
        {
          conditionId: 'ELIG-LOST-DOCK-RECEIPT',
          name: 'Receiving Dock Check-In',
          description: 'Upstream receiving log or carrier proof of delivery confirms physical arrival at Amazon fulfillment facility.'
        },
        {
          conditionId: 'ELIG-LOST-ACTIVE-SHIPMENT',
          name: 'Shipment Not Canceled or Abandoned',
          description: 'Inbound shipping plan must be in valid delivered/closed status, not deleted or canceled.'
        }
      ],
      claimConditions: [
        {
          conditionId: 'CLAIM-FULL-RECEIPT-VERIFIED',
          name: 'Full Quantity Receipt Confirmed',
          description: 'Receiving audit proves supplier fulfilled full order (qty_received >= qty_ordered), ruling out vendor shortage.'
        },
        {
          conditionId: 'CLAIM-CHANNEL-NETWORK-LOSS',
          name: 'Loss Occurred in Channel Network',
          description: 'Discrepancy occurred subsequent to dock intake while inventory was in channel custody.'
        },
        {
          conditionId: 'CLAIM-POSITIVE-VALUATION',
          name: 'Substantiated Valuation',
          description: 'Charge has explicit positive dollar valuation; zero-dollar channel adjustments require valuation review.'
        }
      ]
    }));

    // 4. Customer Refund Issued Item Not Returned Rule (Policy Source Unverified - Marked Unavailable)
    this.registerRule(new AuthoritativeRule({
      ruleId: 'AMZ-FBA-RULE-RETURN-UNRETURNED-004',
      chargeType: 'refund_issued_item_not_returned',
      sourceName: 'Amazon Seller Central - FBA Inventory Reimbursement Policy: Customer Return Claims',
      sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200453320',
      checkedAt: '2026-09-26T12:00:00Z',
      effectiveDate: null,
      sourceAvailable: false,
      ruleVersion: '2.0.0-refund-unreturned-unverified',
      policyClass: RefundUnreturnedPolicy,
      eligibilityConditions: [
        {
          conditionId: 'ELIG-RETURN-STATION-SCAN',
          name: 'Returns Station Dock Record',
          description: 'Reverse logistics scanner or return dock disposition log available in tenant audit store.'
        }
      ],
      claimConditions: [
        {
          conditionId: 'CLAIM-PHYSICAL-ARRIVAL-PROVEN',
          name: 'Physical Arrival at Fulfillment Center',
          description: 'Internal Returns Station audit verifies item was physically received back, directly contradicting unreturned classification.'
        },
        {
          conditionId: 'CLAIM-FINANCIAL-VALUATION',
          name: 'Valid Dollar Value on Record',
          description: 'Charge record reflects positive dollar deduction or order line item value.'
        }
      ]
    }));

    // 5. Damaged in Warehouse Rule (Policy Source Unverified - Marked Unavailable)
    this.registerRule(new AuthoritativeRule({
      ruleId: 'AMZ-FBA-RULE-DAMAGED-WH-005',
      chargeType: 'damaged_in_warehouse',
      sourceName: 'Amazon Seller Central - FBA Inventory Reimbursement Policy: Fulfillment Center Operations',
      sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200453320',
      checkedAt: '2026-09-26T12:00:00Z',
      effectiveDate: null,
      sourceAvailable: false,
      ruleVersion: '2.0.0-damaged-warehouse-unverified',
      policyClass: DamagedWarehousePolicy,
      eligibilityConditions: [
        {
          conditionId: 'ELIG-DAMAGE-ACTIVE-CUSTODY',
          name: 'Active FBA Inventory Custody',
          description: 'Unit was under Amazon fulfillment center custody at the time of the damage incident.'
        }
      ],
      claimConditions: [
        {
          conditionId: 'CLAIM-INTACT-INBOUND-DELIVERY',
          name: 'Verified Intact Supplier Inbound',
          description: 'Upstream receiving dock inspection logs confirm unit and carton arrived with zero damage (carton: none, unit: none).'
        },
        {
          conditionId: 'CLAIM-NOT-ALREADY-REIMBURSED',
          name: 'No Prior Reimbursement Payout',
          description: 'Channel has not already disbursed reimbursement in an official reimbursement settlement report.'
        }
      ]
    }));
  }

  /**
   * Registers or updates an authoritative rule
   */
  registerRule(rule) {
    const authoritativeRule = rule instanceof AuthoritativeRule ? rule : new AuthoritativeRule(rule);
    this.rules.set(authoritativeRule.chargeType, authoritativeRule);
  }

  /**
   * Retrieves the authoritative rule for a charge type
   */
  getRule(chargeType) {
    return this.rules.get(chargeType) || null;
  }

  /**
   * Retrieves the policy evaluation class for backwards compatibility
   */
  getPolicy(chargeType) {
    const rule = this.rules.get(chargeType);
    return rule ? rule.policyClass : null;
  }

  /**
   * Toggles source availability for testing or operational state changes
   */
  setSourceAvailable(chargeType, isAvailable) {
    const rule = this.rules.get(chargeType);
    if (rule) {
      rule.sourceAvailable = Boolean(isAvailable);
    }
  }

  /**
   * Lists all supported charge types
   */
  listSupportedChargeTypes() {
    return Array.from(this.rules.keys());
  }

  /**
   * Lists all registered authoritative rules
   */
  listRules() {
    return Array.from(this.rules.values()).map(r => r.toJSON());
  }
}

const authoritativePolicyRegistry = new AuthoritativePolicyRegistry();

module.exports = {
  AuthoritativeRule,
  AuthoritativePolicyRegistry,
  authoritativePolicyRegistry,
  // Backwards compatibility aliases
  PolicyRegistry: AuthoritativePolicyRegistry,
  defaultRegistry: authoritativePolicyRegistry
};
