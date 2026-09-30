/**
 * REMA — Recovery Manager
 * API Service for interacting with backend endpoints with multi-tenant scoping
 */

function getHeaders(orgId) {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': orgId
  };
}

async function parseJson(res) {
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): Backend may be unavailable. Check that the server is running on http://localhost:3000.`);
    }
    throw new Error('Unexpected response format from server.');
  }
  if (!res.ok && !json.error) {
    json.error = `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
  }
  return json;
}

export const api = {
  async getMetrics(orgId) {
    const res = await fetch(`/api/metrics?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || {};
  },

  async getCharges(orgId) {
    const res = await fetch(`/api/charges?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async getClaims(orgId) {
    const res = await fetch(`/api/claims?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async getReviews(orgId) {
    const res = await fetch(`/api/reviews?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async getChargeDecision(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/decision?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || null;
  },

  async getCharge(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || null;
  },

  async getChargeEvidence(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/evidence?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || null;
  },

  async getAuditTrail(decisionId, orgId) {
    const res = await fetch(`/api/audit/${decisionId}?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async getChargeAuditTrail(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/audit?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async getManualEvidence(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/evidence/manual?org_id=${orgId}`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || [];
  },

  async attachManualEvidence(chargeId, evidenceData, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/evidence/manual?org_id=${orgId}`, {
      method: 'POST',
      headers: getHeaders(orgId),
      body: JSON.stringify(evidenceData)
    });
    return parseJson(res);
  },

  async reEvaluateCharge(chargeId, orgId) {
    const res = await fetch(`/api/charges/${chargeId}/re-evaluate?org_id=${orgId}`, {
      method: 'POST',
      headers: getHeaders(orgId)
    });
    return parseJson(res);
  },

  async resolveReview(reviewId, orgId, notes, resolvedBy = 'OPERATOR') {
    const res = await fetch(`/api/reviews/${reviewId}/resolve?org_id=${orgId}`, {
      method: 'POST',
      headers: getHeaders(orgId),
      body: JSON.stringify({ resolution_notes: notes, resolved_by: resolvedBy })
    });
    return parseJson(res);
  },

  async runBatchProcess(orgId) {
    const res = await fetch(`/api/process/run?org_id=${orgId}`, {
      method: 'POST',
      headers: getHeaders(orgId)
    });
    return parseJson(res);
  },

  async runSyntheticBenchmark(orgId) {
    const res = await fetch(`/api/evaluation/synthetic`, { headers: getHeaders(orgId) });
    const json = await parseJson(res);
    return json.data || { details: [] };
  }
};
