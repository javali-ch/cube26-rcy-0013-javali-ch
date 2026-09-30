import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage({
  metrics,
  charges,
  decisions,
  onRunBatch,
  isBatchRunning,
  batchError
}) {
  const navigate = useNavigate();

  // Metrics calculation
  const totalCharges = metrics?.total_charges_reviewed || 0;
  const totalAmount = metrics?.total_amount_reviewed || 0;
  const claimableAmount = metrics?.total_claimable_amount || 0;
  const claimsCount = metrics?.claims_count || 0;
  const noClaimsCount = metrics?.no_claims_count || 0;
  const uncertainCount = metrics?.uncertain_count || 0;
  const pendingReviewsCount = metrics?.pending_reviews_count || 0;
  const precisionPct = ((metrics?.claim_precision || 0) * 100).toFixed(1);
  const correctlySupported = metrics?.correctly_supported_claims || 0;
  const totalSupported = metrics?.total_supported_claims_denominator || 0;
  const reviewRatePct = ((metrics?.review_rate || 0) * 100).toFixed(1);

  // Distribution percentages
  const claimPct = totalCharges > 0 ? ((claimsCount / totalCharges) * 100).toFixed(1) : '0.0';
  const noClaimPct = totalCharges > 0 ? ((noClaimsCount / totalCharges) * 100).toFixed(1) : '0.0';
  const uncertainPct = totalCharges > 0 ? ((uncertainCount / totalCharges) * 100).toFixed(1) : '0.0';

  // Coverage data
  const cov = metrics?.evidence_coverage;
  const lastBatch = metrics?.last_batch_run;

  // Format Evidence Status badge
  function renderEvidenceStatus(d) {
    const missing = [];
    if (d.missing_evidence && Array.isArray(d.missing_evidence) && d.missing_evidence.length > 0) {
      missing.push(...d.missing_evidence);
    } else if (d.evidence_coverage && Array.isArray(d.evidence_coverage.missing) && d.evidence_coverage.missing.length > 0) {
      missing.push(...d.evidence_coverage.missing);
    }

    const stationSet = new Set();
    if (Array.isArray(d.supporting_evidence_ids)) {
      for (const evId of d.supporting_evidence_ids) {
        if (evId.startsWith('RCV-')) stationSet.add('Receiving');
        else if (evId.startsWith('PRP-')) stationSet.add('Prep');
        else if (evId.startsWith('PCK-')) stationSet.add('Pack');
        else if (evId.startsWith('RTN-')) stationSet.add('Returns');
      }
    }
    if (d.evidence_coverage && Array.isArray(d.evidence_coverage.available)) {
      for (const st of d.evidence_coverage.available) {
        stationSet.add(st.charAt(0).toUpperCase() + st.slice(1).toLowerCase());
      }
    }

    const stations = Array.from(stationSet);

    if (missing.length > 0) {
      const missingFormatted = missing.map(m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()).join(', ');
      return <span className="badge badge-uncertain badge-evidence">Missing {missingFormatted}</span>;
    } else if (stations.length >= 4) {
      return <span className="badge badge-reliable badge-evidence">4/4 stations</span>;
    } else if (stations.length > 0) {
      return <span className="badge badge-reliable badge-evidence">{stations.length}/4 stations ({stations.join(', ')})</span>;
    } else if (d.evidence_coverage?.status) {
      return <span className="badge badge-noclaim badge-evidence">{d.evidence_coverage.status}</span>;
    }
    return <span className="badge badge-noclaim badge-evidence">—</span>;
  }

  const recentDecisions = decisions.slice(0, 8);

  return (
    <section id="view-dashboard" className="view-section active">
      <div className="page-hero">
        <h1>Financial Recovery Overview</h1>
        <p>Turn operational evidence into defensible recovery claims.</p>
      </div>

      {/* 1. KPI Metrics Strip (5 Distinct Cards) */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Total Charges Evaluated</span>
          <span className="metric-value">{totalCharges} charges</span>
          <span className="metric-sub">${totalAmount.toFixed(2)} total fee value</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Defensible Claim Value</span>
          <span className="metric-value metric-claimable">${claimableAmount.toFixed(2)}</span>
          <span className="metric-sub">{claimsCount} claims recommended</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Claim Precision</span>
          <span className="metric-value">{precisionPct}%</span>
          <span className="metric-sub">{correctlySupported} / {totalSupported} supported</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Review Queue</span>
          <span className="metric-value metric-reviews">{pendingReviewsCount}</span>
          <span className="metric-sub">Unresolved cases held</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Review Rate</span>
          <span className="metric-value">{reviewRatePct}%</span>
          <span className="metric-sub">{uncertainCount} / {totalCharges} fail-open safety</span>
        </div>
      </div>

      {/* 2. Decision Outcomes + Evidence Coverage */}
      <div className="dashboard-two-col">
        {/* Decision Outcomes Distribution */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div>
              <h3>Decision Distribution</h3>
              <p className="dashboard-card-subtitle">Tri-verdict categorization of all evaluated charges</p>
            </div>
            <span className="badge badge-noclaim">{totalCharges} Charges</span>
          </div>
          <div className="distribution-list">
            <div className="distribution-item">
              <div className="dist-label-group">
                <span className="badge badge-claim">CLAIM</span>
                <span className="dist-desc">Contradiction proven with upstream proof</span>
              </div>
              <div className="dist-metric-group">
                <span className="dist-count">{claimsCount} charges ({claimPct}%)</span>
                <span className="dist-amount">${(metrics?.claims_total_charge_amount || claimableAmount).toFixed(2)}</span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="dist-label-group">
                <span className="badge badge-noclaim">NO_CLAIM</span>
                <span className="dist-desc">Valid baseline fee or supplier defect</span>
              </div>
              <div className="dist-metric-group">
                <span className="dist-count">{noClaimsCount} charges ({noClaimPct}%)</span>
                <span className="dist-amount">${(metrics?.no_claims_total_charge_amount || 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="dist-label-group">
                <span className="badge badge-uncertain">UNCERTAIN</span>
                <span className="dist-desc">Inconclusive, conflicting, or zero valuation</span>
              </div>
              <div className="dist-metric-group">
                <span className="dist-count">{uncertainCount} charges ({uncertainPct}%)</span>
                <span className="dist-amount">${(metrics?.uncertain_total_charge_amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="distribution-footer">
            Reconciliation: {claimsCount} CLAIM (${(metrics?.claims_total_charge_amount || claimableAmount).toFixed(2)}) + {noClaimsCount} NO_CLAIM (${(metrics?.no_claims_total_charge_amount || 0).toFixed(2)}) + {uncertainCount} UNCERTAIN (${(metrics?.uncertain_total_charge_amount || 0).toFixed(2)}) = {totalCharges} Total (${totalAmount.toFixed(2)})
          </div>
        </div>

        {/* Upstream Evidence Coverage */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div>
              <h3>Evidence Coverage</h3>
              <p className="dashboard-card-subtitle">Physical operational records available by stage</p>
            </div>
            <span className="badge badge-reliable">4 Upstream Stages</span>
          </div>
          <div className="coverage-list">
            <div className="coverage-item">
              <div className="coverage-label-group">
                <span className="coverage-stage-name">Receiving Dock</span>
                <span className="coverage-stage-desc">Condition on arrival, carton check, dock check-in</span>
              </div>
              <div className="coverage-stats">
                <span className="coverage-count">{cov?.stages?.receiving?.available_charges || 0} / {cov?.total_charges || 0} charges</span>
                <span className="coverage-sub">{cov?.stages?.receiving?.unit_count || 0} / {cov?.total_units || 0} warehouse units</span>
              </div>
            </div>
            <div className="coverage-item">
              <div className="coverage-label-group">
                <span className="coverage-stage-name">Prep Station (FBA)</span>
                <span className="coverage-stage-desc">Polybag seal, suffocation warning, barcode audit</span>
              </div>
              <div className="coverage-stats">
                <span className="coverage-count">{cov?.stages?.prep?.available_charges || 0} / {cov?.total_charges || 0} charges</span>
                <span className="coverage-sub">{cov?.stages?.prep?.unit_count || 0} / {cov?.total_units || 0} FBA units</span>
              </div>
            </div>
            <div className="coverage-item">
              <div className="coverage-label-group">
                <span className="coverage-stage-name">Pack Station (MFN)</span>
                <span className="coverage-stage-desc">Direct-to-consumer packing and dispatch verification</span>
              </div>
              <div className="coverage-stats">
                <span className="coverage-count">{cov?.stages?.pack?.available_charges || 0} / {cov?.total_charges || 0} charges</span>
                <span className="coverage-sub">{cov?.stages?.pack?.unit_count || 0} / {cov?.total_units || 0} MFN units</span>
              </div>
            </div>
            <div className="coverage-item">
              <div className="coverage-label-group">
                <span className="coverage-stage-name">Returns Station</span>
                <span className="coverage-stage-desc">Physical customer return inspection and disposition</span>
              </div>
              <div className="coverage-stats">
                <span className="coverage-count">{cov?.stages?.returns?.available_charges || 0} / {cov?.total_charges || 0} charges</span>
                <span className="coverage-sub">{cov?.stages?.returns?.unit_count || 0} / {cov?.total_units || 0} return units</span>
              </div>
            </div>
          </div>
          <div className="coverage-footer">
            <span className="coverage-note">Routing invariant: Units route through Prep (FBA) or Pack (MFN); never both.</span>
          </div>
        </div>
      </div>

      {/* 3. Recent Financial Decisions Table */}
      <div className="card-section">
        <div className="card-header">
          <div>
            <h2>Recent Financial Decisions</h2>
            <p className="section-subtitle">Latest evaluated channel fee rows with operational evidence status</p>
          </div>
          <button className="btn-action" onClick={() => navigate('/decisions')}>
            View All Decisions
          </button>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Charge ID</th>
                <th>Unit ID</th>
                <th>Charge Type</th>
                <th>Total Charge Amount</th>
                <th>Verdict</th>
                <th>Evidence Status</th>
                <th>Reason Summary</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentDecisions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-empty">
                    No decisions found. Run the batch engine to evaluate charges.
                  </td>
                </tr>
              ) : (
                recentDecisions.map((d) => {
                  const charge = charges.find((c) => c.charge_id === d.charge_id) || {};
                  const badgeClass =
                    d.verdict === 'CLAIM'
                      ? 'badge-claim'
                      : d.verdict === 'NO_CLAIM'
                      ? 'badge-noclaim'
                      : 'badge-uncertain';
                  const totalCharge = d.total_charge_amount !== undefined && d.total_charge_amount !== null
                    ? d.total_charge_amount
                    : d.amount_usd;

                  return (
                    <tr key={d.charge_id}>
                      <td className="cell-id">{d.charge_id}</td>
                      <td className="cell-unit">{d.unit_id || 'N/A'}</td>
                      <td className="cell-type">{charge.charge_type || 'N/A'}</td>
                      <td className="cell-amount">${totalCharge.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>{d.verdict}</span>
                      </td>
                      <td>{renderEvidenceStatus(d)}</td>
                      <td className="cell-reason" title={d.reason}>
                        {d.reason}
                      </td>
                      <td>
                        <button
                          className="btn-action"
                          onClick={() => navigate(`/detail/${d.charge_id}`, { state: { from: 'Dashboard' } })}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Banner */}
      {batchError && (
        <div className="alert-banner alert-error">
          {batchError}
        </div>
      )}

      {/* 4. Last Batch Run */}
      <div className="last-batch-card">
        <div className="last-batch-header">
          <div className="last-batch-title-group">
            <span className="last-batch-label">Last Batch Run</span>
            <span className="last-batch-timestamp">
              {lastBatch?.created_at ? new Date(lastBatch.created_at).toLocaleString() : 'No batch run yet'}
            </span>
          </div>
          <div className="last-batch-actions">
            <button
              className="btn-action btn-batch-rerun"
              id="btn-batch-rerun"
              onClick={onRunBatch}
              disabled={isBatchRunning}
            >
              {isBatchRunning ? 'Running Batch...' : 'Re-Run Batch Engine'}
            </button>
            <span className="badge badge-reliable">
              {lastBatch ? 'Batch Verified' : 'Engine Ready'}
            </span>
          </div>
        </div>
        <div className="last-batch-metrics">
          <div className="last-batch-item">
            <span className="last-batch-item-label">Charges Evaluated</span>
            <span className="last-batch-item-value">
              {lastBatch ? `${lastBatch.total_charges} charges` : '—'}
            </span>
          </div>
          <div className="last-batch-item">
            <span className="last-batch-item-label">Claims</span>
            <span className="last-batch-item-value">
              {lastBatch ? `${lastBatch.claims_count} ($${(lastBatch.claim_amount_usd || 0).toFixed(2)})` : '—'}
            </span>
          </div>
          <div className="last-batch-item">
            <span className="last-batch-item-label">No-Claims</span>
            <span className="last-batch-item-value">
              {lastBatch ? lastBatch.no_claims_count : '—'}
            </span>
          </div>
          <div className="last-batch-item">
            <span className="last-batch-item-label">Uncertain</span>
            <span className="last-batch-item-value">
              {lastBatch ? lastBatch.uncertain_count : '—'}
            </span>
          </div>
          <div className="last-batch-item">
            <span className="last-batch-item-label">Batch Latency</span>
            <span className="last-batch-item-value">
              {lastBatch ? `${lastBatch.latency_ms} ms` : '—'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
