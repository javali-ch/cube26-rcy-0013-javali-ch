/**
 * REMA - Recovery Manager
 * Charge Policies Registry
 */

const InboundDefectPolicy = require('./inboundDefect');
const WeightTierPolicy = require('./weightTier');
const LostInboundPolicy = require('./lostInbound');
const RefundUnreturnedPolicy = require('./refundUnreturned');
const DamagedWarehousePolicy = require('./damagedWarehouse');

class PolicyRegistry {
  constructor() {
    this.policies = new Map();
    this.register(InboundDefectPolicy);
    this.register(WeightTierPolicy);
    this.register(LostInboundPolicy);
    this.register(RefundUnreturnedPolicy);
    this.register(DamagedWarehousePolicy);
  }

  register(policyClass) {
    this.policies.set(policyClass.chargeType, policyClass);
  }

  getPolicy(chargeType) {
    return this.policies.get(chargeType) || null;
  }

  listSupportedChargeTypes() {
    return Array.from(this.policies.keys());
  }
}

const defaultRegistry = new PolicyRegistry();

module.exports = {
  PolicyRegistry,
  defaultRegistry
};
