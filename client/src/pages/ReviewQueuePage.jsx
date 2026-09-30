import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ReviewQueuePage({ reviews, onOpenReviewModal }) {
  const navigate = useNavigate();

  return (
    <section id="view-reviews" className="view-section active">
      <div className="page-hero">
        <h1>Human Review Queue</h1>
        <p>
          Uncertain cases, missing evidence, zero-valuation adjustments, and cross-source conflicts held for operator
          review.
        </p>
      </div>

      <div className="card-section">
        <div className="card-header">
          <h2>Pending Review Items</h2>
          <span className="safety-caption">Fail-Open Safety Enabled</span>
        </div>
        <div className="review-cards-grid">
          {reviews.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--rema-muted)' }}>
              No items currently require human review. All decisions are conclusively resolved.
            </p>
          ) : (
            reviews.map((r) => {
              const isResolved = r.status === 'RESOLVED';
              return (
                <div key={r.review_id} className="review-item-card">
                  <div className="review-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                      <h4>
                        {r.charge_id} · Unit {r.unit_id || 'UNMAPPED'}
                      </h4>
                      <span className={`badge ${isResolved ? 'badge-claim' : 'badge-uncertain'}`}>
                        {r.status}
                      </span>
                      <span className="badge badge-noclaim" style={{ fontSize: '0.7rem' }}>
                        {r.issue_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--rema-muted)' }}>
                        Severity: {r.severity}
                      </span>
                    </div>
                    <p className="review-reason">
                      Missing / Conflicting Evidence:{' '}
                      <strong>
                        {r.missing_evidence || r.conflicting_evidence || 'Inconclusive upstream record'}
                      </strong>
                    </p>
                    <div className="suggested-action-box">
                      <strong>Suggested Action:</strong> {r.suggested_action}
                    </div>
                    {isResolved && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--rema-primary)', marginTop: '0.5rem' }}>
                        <strong>Resolution:</strong> {r.resolution_notes} (by {r.resolved_by})
                      </p>
                    )}
                  </div>
                  <div className="review-actions-column">
                    <button
                      className="btn-action"
                      onClick={() => navigate(`/detail/${r.charge_id}`, { state: { from: 'Review Queue' } })}
                    >
                      View Trace
                    </button>
                    {!isResolved && (
                      <button className="btn-resolve" onClick={() => onOpenReviewModal(r)}>
                        Resolve Item
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
