import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ReviewModal from './components/ReviewModal';
import DashboardPage from './pages/DashboardPage';
import DecisionsPage from './pages/DecisionsPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import AuditExplorerPage from './pages/AuditExplorerPage';
import EvaluationPage from './pages/EvaluationPage';
import ClaimDetailPage from './pages/ClaimDetailPage';
import { api } from './services/api';

export default function App() {
  const [currentOrgId, setCurrentOrgId] = useState('org_demo_alpha');
  const [metrics, setMetrics] = useState(null);
  const [charges, setCharges] = useState([]);
  const [claims, setClaims] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Batch process execution state
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchError, setBatchError] = useState(null);

  // Review modal state
  const [activeReviewModalItem, setActiveReviewModalItem] = useState(null);

  const loadData = useCallback(async (orgId) => {
    setLoading(true);
    try {
      const [m, ch, cl, rev] = await Promise.all([
        api.getMetrics(orgId),
        api.getCharges(orgId),
        api.getClaims(orgId),
        api.getReviews(orgId)
      ]);

      setMetrics(m);
      setCharges(ch);
      setClaims(cl);
      setReviews(rev);

      // Fetch decisions for all charges
      const decisionPromises = ch.map((c) =>
        api.getChargeDecision(c.charge_id, orgId).catch(() => null)
      );
      const decs = (await Promise.all(decisionPromises)).filter(Boolean);
      setDecisions(decs);
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(currentOrgId);
  }, [currentOrgId, loadData]);

  const handleTenantChange = (newOrgId) => {
    setCurrentOrgId(newOrgId);
  };

  const handleRunBatch = async () => {
    setBatchError(null);
    setIsBatchRunning(true);
    try {
      const json = await api.runBatchProcess(currentOrgId);
      if (json.success) {
        await loadData(currentOrgId);
      } else {
        setBatchError(
          `Batch processing failed: ${json.error || 'Server error'}. Previous valid results have been preserved.`
        );
      }
    } catch (err) {
      setBatchError(
        `Batch processing failed: ${err.message}. Previous valid results have been preserved.`
      );
    } finally {
      setIsBatchRunning(false);
    }
  };

  const handleReviewSubmit = async (notes) => {
    if (!activeReviewModalItem) return;
    try {
      const res = await api.resolveReview(activeReviewModalItem.review_id, currentOrgId, notes);
      if (res.success) {
        setActiveReviewModalItem(null);
        await loadData(currentOrgId);
      }
    } catch (err) {
      console.error('Failed to resolve review:', err);
    }
  };

  return (
    <>
      <Header
        currentOrgId={currentOrgId}
        onTenantChange={handleTenantChange}
        reviewCount={metrics?.pending_reviews_count || 0}
      />

      <main className="app-main">
        {loading && !metrics ? (
          <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--rema-muted)' }}>
            Loading REMA operational evidence and financial recovery engine...
          </div>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <DashboardPage
                  metrics={metrics}
                  charges={charges}
                  decisions={decisions}
                  onRunBatch={handleRunBatch}
                  isBatchRunning={isBatchRunning}
                  batchError={batchError}
                />
              }
            />
            <Route
              path="/decisions"
              element={<DecisionsPage decisions={decisions} charges={charges} />}
            />
            <Route
              path="/reviews"
              element={
                <ReviewQueuePage
                  reviews={reviews}
                  onOpenReviewModal={(item) => setActiveReviewModalItem(item)}
                />
              }
            />
            <Route
              path="/explorer"
              element={<AuditExplorerPage charges={charges} />}
            />
            <Route
              path="/evaluation"
              element={<EvaluationPage metrics={metrics} currentOrgId={currentOrgId} />}
            />
            <Route
              path="/detail/:chargeId"
              element={<ClaimDetailPage currentOrgId={currentOrgId} />}
            />
          </Routes>
        )}
      </main>

      <ReviewModal
        isOpen={!!activeReviewModalItem}
        review={activeReviewModalItem}
        onClose={() => setActiveReviewModalItem(null)}
        onSubmit={handleReviewSubmit}
      />
    </>
  );
}
