import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuditExplorerPage({ charges }) {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // Group charges by unit_id
  const unitsMap = new Map();
  for (const c of charges) {
    const uid = c.unit_id || 'UNMAPPED';
    if (!unitsMap.has(uid)) {
      unitsMap.set(uid, {
        unit_id: uid,
        sku: c.sku || 'N/A',
        charges: []
      });
    }
    unitsMap.get(uid).charges.push(c);
  }

  const allUnits = Array.from(unitsMap.values());
  const filter = searchTerm.toLowerCase().trim();

  const filteredUnits = allUnits.filter((item) => {
    if (!filter) return true;
    const matchesUnit = item.unit_id.toLowerCase().includes(filter);
    const matchesSku = item.sku.toLowerCase().includes(filter);
    const matchesCharge = item.charges.some((c) => c.charge_id.toLowerCase().includes(filter));
    return matchesUnit || matchesSku || matchesCharge;
  });

  return (
    <section id="view-explorer" className="view-section active">
      <div className="page-hero">
        <h1>Evidence Explorer &amp; Audit Trail</h1>
        <p>Explore all 100 units across Receiving, Prep, Pack, and Returns, with end-to-end lifecycle event logs.</p>
      </div>

      <div className="card-section">
        <div className="card-header">
          <h2>Search Unit Evidence Graph</h2>
          <input
            type="text"
            id="explorerSearch"
            className="explorer-search-input"
            placeholder="Search UNIT-0014, SKU, Charge..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit ID</th>
                <th>SKU</th>
                <th>Receiving</th>
                <th>Prep (FBA)</th>
                <th>Pack (MFN)</th>
                <th>Returns</th>
                <th>Charges Evaluated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-empty">
                    No units match search query '{searchTerm}'.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((item) => {
                  const hasDefect = item.charges.some((x) => x.charge_type?.includes('defect'));
                  const hasRefund = item.charges.some((x) => x.charge_type?.includes('refund'));
                  const firstChargeId = item.charges[0]?.charge_id;

                  return (
                    <tr key={item.unit_id}>
                      <td style={{ fontWeight: 700, color: 'var(--rema-primary-dark)' }}>{item.unit_id}</td>
                      <td>{item.sku}</td>
                      <td>
                        <span className="badge badge-reliable">YES</span>
                      </td>
                      <td>
                        <span className={`badge ${hasDefect ? 'badge-claim' : 'badge-noclaim'}`}>
                          FBA PREP
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-noclaim">—</span>
                      </td>
                      <td>
                        <span className={`badge ${hasRefund ? 'badge-claim' : 'badge-noclaim'}`}>
                          AVAILABLE
                        </span>
                      </td>
                      <td>{item.charges.length} charge line(s)</td>
                      <td>
                        <button
                          className="btn-action"
                          onClick={() => {
                            if (firstChargeId) {
                              navigate(`/detail/${firstChargeId}`, { state: { from: 'Audit Explorer' } });
                            }
                          }}
                        >
                          Inspect Unit
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
