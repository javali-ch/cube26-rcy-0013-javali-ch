import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DecisionsPage({ decisions, charges }) {
  const [filter, setFilter] = useState('ALL');
  const navigate = useNavigate();

  const filteredDecisions = decisions.filter(
    (d) => filter === 'ALL' || d.verdict === filter
  );

  return (
    <section id="view-decisions" className="view-section active">
      <div className="page-hero">
        <h1>All Channel Decisions &amp; Claims</h1>
        <p>Complete record of evaluated fee reports, reconciliation verdicts, and compiled recovery claims.</p>
      </div>

      <div className="card-section">
        <div className="card-header">
          <h2>Evaluated Channel Line Items</h2>
          <div className="flex-gap-sm">
            <select
              id="filterVerdict"
              className="tenant-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">All Verdicts</option>
              <option value="CLAIM">CLAIM Only</option>
              <option value="NO_CLAIM">NO_CLAIM Only</option>
              <option value="UNCERTAIN">UNCERTAIN Only</option>
            </select>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Charge ID</th>
                <th>Unit ID</th>
                <th>Type</th>
                <th>Total Charge Amount</th>
                <th>Verdict</th>
                <th>Contradiction</th>
                <th>Coverage</th>
                <th>Reliability</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDecisions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="table-empty">
                    No decisions match filter '{filter}'.
                  </td>
                </tr>
              ) : (
                filteredDecisions.map((d) => {
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
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{d.charge_id}</td>
                      <td style={{ fontWeight: 600, color: 'var(--rema-primary-dark)' }}>
                        {d.unit_id || 'N/A'}
                      </td>
                      <td style={{ fontSize: '0.82rem', textTransform: 'uppercase', color: 'var(--rema-muted)' }}>
                        {charge.charge_type || 'N/A'}
                      </td>
                      <td style={{ fontWeight: 700 }}>${totalCharge.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>{d.verdict}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{d.contradiction_status}</td>
                      <td style={{ fontSize: '0.8rem' }}>{d.evidence_coverage?.status}</td>
                      <td style={{ fontSize: '0.8rem' }}>{d.evidence_reliability?.overall}</td>
                      <td>
                        <button
                          className="btn-action"
                          onClick={() => navigate(`/detail/${d.charge_id}`, { state: { from: 'Decisions & Claims' } })}
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
    </section>
  );
}
