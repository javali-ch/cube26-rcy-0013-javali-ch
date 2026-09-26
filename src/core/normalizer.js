/**
 * REMA - Recovery Manager
 * Charge & Evidence Ingestion and Normalization Layer
 */

const { ChargeType, Stage } = require('./types');

class Normalizer {
  /**
   * Normalizes a raw charge row from fee/reimbursement reports
   */
  static normalizeCharge(rawRow, sourceReport = 'fee_report_sample.csv') {
    const raw = { ...rawRow };
    const chargeId = (raw.line_id || raw.charge_id || '').trim();
    const orgId = (raw.org_id || '').trim();
    const unitId = (raw.unit_id || '').trim();
    const sku = (raw.sku || '').trim();
    const fnsku = (raw.fnsku || '').trim();
    const fbaShipmentId = (raw.fba_shipment_id || '').trim();
    const orderId = (raw.order_id || '').trim();
    const rawChargeType = (raw.charge_type || '').trim().toLowerCase();
    const reportType = (raw.report_type || 'fee_report').trim().toLowerCase();
    const rawAmount = raw.amount_usd !== undefined ? String(raw.amount_usd).trim() : '0.00';
    const postedDate = (raw.posted_date || raw.charge_date || '').trim();
    const quantity = parseInt(raw.quantity || '1', 10);

    const validationErrors = [];

    if (!chargeId) {
      validationErrors.push('Missing charge_id / line_id');
    }
    if (!orgId) {
      validationErrors.push('Missing org_id (tenancy requirement)');
    }

    // Amount validation
    const parsedAmount = parseFloat(rawAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      validationErrors.push(`Invalid amount: '${rawAmount}'`);
    }

    // Date validation
    if (!postedDate || isNaN(Date.parse(postedDate))) {
      validationErrors.push(`Invalid posted_date: '${postedDate}'`);
    }

    // Supported charge types
    const knownChargeTypes = Object.values(ChargeType);
    let chargeType = rawChargeType;
    let isUnsupported = false;
    if (!knownChargeTypes.includes(rawChargeType)) {
      isUnsupported = true;
    }

    let parsingStatus = 'PARSED';
    if (validationErrors.length > 0) {
      parsingStatus = 'MALFORMED';
    } else if (isUnsupported) {
      parsingStatus = 'UNSUPPORTED_TYPE';
    } else if (!unitId) {
      parsingStatus = 'MISSING_UNIT_ID';
    }

    return {
      charge_id: chargeId,
      org_id: orgId,
      unit_id: unitId || null,
      sku: sku || null,
      fnsku: fnsku || null,
      fba_shipment_id: fbaShipmentId || null,
      order_id: orderId || null,
      charge_type: chargeType,
      report_type: reportType,
      quantity: isNaN(quantity) ? 1 : quantity,
      amount_usd: isNaN(parsedAmount) ? 0.00 : parsedAmount,
      currency: 'USD',
      posted_date: postedDate,
      source_report: sourceReport,
      raw_record: raw,
      parsing_status: parsingStatus,
      validation_errors: validationErrors,
      is_malformed: validationErrors.length > 0
    };
  }

  /**
   * Normalizes upstream Receiving record
   */
  static normalizeReceiving(rawRow) {
    const raw = { ...rawRow };
    return {
      evidence_id: raw.record_id,
      org_id: raw.org_id,
      unit_id: raw.unit_id,
      stage: Stage.RECEIVING,
      operator_id: raw.operator_id,
      captured_at: raw.captured_at,
      photo_refs: raw.photo_refs,
      raw_record: raw,
      normalized_data: {
        po_number: raw.po_number,
        po_line: raw.po_line,
        supplier: raw.supplier,
        sku: raw.sku,
        asin: raw.asin,
        product_title: raw.product_title,
        spec_colour: raw.spec_colour,
        spec_variant: raw.spec_variant,
        cartons_ordered: parseInt(raw.cartons_ordered || '0', 10),
        cartons_received: parseInt(raw.cartons_received || '0', 10),
        units_per_carton_ordered: parseInt(raw.units_per_carton_ordered || '0', 10),
        units_per_carton_counted: parseInt(raw.units_per_carton_counted || '0', 10),
        qty_ordered: parseInt(raw.qty_ordered || '0', 10),
        qty_received: parseInt(raw.qty_received || '0', 10),
        identity_match: (raw.identity_match || '').toLowerCase() === 'yes',
        carton_damage: (raw.carton_damage || 'none').toLowerCase(),
        unit_damage: (raw.unit_damage || 'none').toLowerCase(),
        quality_flags: (raw.quality_flags || '').trim().toLowerCase()
      }
    };
  }

  /**
   * Normalizes upstream Prep record
   */
  static normalizePrep(rawRow) {
    const raw = { ...rawRow };
    return {
      evidence_id: raw.record_id,
      org_id: raw.org_id,
      unit_id: raw.unit_id,
      stage: Stage.PREP,
      operator_id: raw.operator_id,
      captured_at: raw.captured_at,
      photo_refs: raw.photo_refs,
      raw_record: raw,
      normalized_data: {
        work_order_id: raw.work_order_id,
        fba_shipment_id: raw.fba_shipment_id,
        sku: raw.sku,
        asin: raw.asin,
        fnsku: raw.fnsku,
        prep_price_usd: parseFloat(raw.prep_price_usd || '0'),
        wo_polybag: String(raw.wo_polybag).toLowerCase() === 'true',
        wo_suffocation_warning: String(raw.wo_suffocation_warning).toLowerCase() === 'true',
        wo_expiry_date: String(raw.wo_expiry_date).toLowerCase() === 'true',
        wo_handling_marks: (raw.wo_handling_marks || '').trim().toLowerCase(),
        polybag_present_sealed: (raw.polybag_present_sealed || 'not_required').trim().toLowerCase(),
        suffocation_warning: (raw.suffocation_warning || 'not_required').trim().toLowerCase(),
        fnsku_label_placement: (raw.fnsku_label_placement || 'flat').trim().toLowerCase(),
        original_barcode_covered: (raw.original_barcode_covered || 'yes').trim().toLowerCase(),
        expiry_date: (raw.expiry_date || 'not_required').trim().toLowerCase(),
        handling_marks: (raw.handling_marks || 'not_required').trim().toLowerCase()
      }
    };
  }

  /**
   * Normalizes upstream Pack record
   */
  static normalizePack(rawRow) {
    const raw = { ...rawRow };
    return {
      evidence_id: raw.record_id,
      org_id: raw.org_id,
      unit_id: raw.unit_id,
      stage: Stage.PACK,
      operator_id: raw.operator_id,
      captured_at: raw.captured_at,
      photo_refs: raw.photo_refs,
      raw_record: raw,
      normalized_data: {
        order_id: raw.order_id,
        channel: (raw.channel || '').trim().toLowerCase(),
        order_lines: (raw.order_lines || '').trim(),
        observed_in_box: (raw.observed_in_box || '').trim(),
        operator_verdict: (raw.operator_verdict || 'seal').trim().toLowerCase()
      }
    };
  }

  /**
   * Normalizes upstream Returns record
   */
  static normalizeReturns(rawRow) {
    const raw = { ...rawRow };
    return {
      evidence_id: raw.record_id,
      org_id: raw.org_id,
      unit_id: raw.unit_id,
      stage: Stage.RETURNS,
      operator_id: raw.operator_id,
      captured_at: raw.captured_at,
      photo_refs: raw.photo_refs,
      raw_record: raw,
      normalized_data: {
        order_id: raw.order_id,
        ordered_sku: raw.ordered_sku,
        ordered_asin: raw.ordered_asin,
        identity_match: (raw.identity_match || '').toLowerCase() === 'yes',
        parts_list: (raw.parts_list || '').trim(),
        parts_missing: (raw.parts_missing || '').trim(),
        observed_state: (raw.observed_state || 'uncertain').trim().toLowerCase(),
        amazon_condition: (raw.amazon_condition || '').trim(),
        operator_disposition: (raw.operator_disposition || 'pending_review').trim().toLowerCase()
      }
    };
  }
}

module.exports = Normalizer;
