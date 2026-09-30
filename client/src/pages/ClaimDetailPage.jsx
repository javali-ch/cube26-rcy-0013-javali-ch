import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import {
  buildDisputePackageData,
  copyDisputePackageToClipboard,
  downloadDisputePackage
} from '../services/disputePackage';

export default function ClaimDetailPage({ currentOrgId }) {
  const { chargeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [manualEvidence, setManualEvidence] = useState([]);
  const [openAccordions, setOpenAccordions] = useState({});
  const [toast, setToast] = useState(null);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Manual Evidence Modal state
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState(null);

  const fileInputRef = useRef(null);
  const exportMenuRef = useRef(null);

  const backLabel = location.state?.from ? `Back to ${location.state.from}` : 'Back';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  async function loadDetail() {
    try {
      const [charge, evidenceData, decision, manualList] = await Promise.all([
        api.getCharge(chargeId, currentOrgId),
        api.getChargeEvidence(chargeId, currentOrgId),
        api.getChargeDecision(chargeId, currentOrgId),
        api.getManualEvidence(chargeId, currentOrgId)
      ]);

      // Correlate audit trail for this charge and decision
      const auditTrail = await api.getChargeAuditTrail(chargeId, currentOrgId);

      setData({
        charge,
        evidenceData,
        decision,
        auditTrail: auditTrail || []
      });
      setManualEvidence(manualList || evidenceData?.manual_evidence || []);
    } catch (err) {
      console.error('Failed to load claim detail:', err);
    }
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    loadDetail().finally(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [chargeId, currentOrgId]);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAccordion = (key) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 1. Copy Dispute Package as Formatted Text
  const handleCopyPackage = async () => {
    if (!data?.charge || !data?.decision) return;
    try {
      const pkg = buildDisputePackageData({
        charge: data.charge,
        decision: data.decision,
        evidenceData: data.evidenceData,
        manualEvidence,
        auditTrail: data.auditTrail
      });
      await copyDisputePackageToClipboard(pkg);
      showToast('✓ Dispute Package copied to clipboard as formatted text!', 'success');
    } catch (err) {
      console.error('Failed to copy dispute package:', err);
      showToast('Failed to copy dispute package to clipboard.', 'warning');
    }
  };

  // 2. Export Claim (JSON or TXT)
  const handleExportClaim = (format) => {
    if (!data?.charge || !data?.decision) return;
    try {
      const pkg = buildDisputePackageData({
        charge: data.charge,
        decision: data.decision,
        evidenceData: data.evidenceData,
        manualEvidence,
        auditTrail: data.auditTrail
      });
      downloadDisputePackage(pkg, format);
      setExportMenuOpen(false);
      showToast(
        format === 'json'
          ? '✓ Claim dispute package downloaded as JSON.'
          : '✓ Claim dispute package downloaded as TXT.',
        'success'
      );
    } catch (err) {
      console.error('Failed to download dispute package:', err);
      showToast('Failed to download dispute package.', 'warning');
    }
  };

  // 3. Re-evaluate Case using Existing Engine
  const handleReevaluate = async () => {
    if (!data?.charge) return;
    setReEvaluating(true);
    try {
      const res = await api.reEvaluateCharge(chargeId, currentOrgId);
      if (res.success) {
        await loadDetail();
        const newVerdict = res.data?.decision?.verdict;
        showToast(`✓ Case re-evaluated successfully using decision engine. Verdict: ${newVerdict}`, 'info');
      } else {
        showToast(res.error || 'Failed to re-evaluate case.', 'warning');
      }
    } catch (err) {
      console.error('Error during re-evaluation:', err);
      showToast('Re-evaluation encountered an unexpected error.', 'warning');
    } finally {
      setReEvaluating(false);
    }
  };

  // 4. Attach Manual Evidence Handler
  const handleAttachSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setAttachError('Please select a file to attach (PDF, JPG, PNG, CSV, JSON).');
      return;
    }

    setAttaching(true);
    setAttachError(null);

    try {
      const reader = new FileReader();

      const readFilePromise = new Promise((resolve) => {
        // For text files, read as text; for binary, read as dataURL
        const isText = selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.json');
        if (isText && selectedFile.size < 500000) {
          reader.readAsText(selectedFile);
        } else if (selectedFile.size < 2000000) {
          reader.readAsDataURL(selectedFile);
        } else {
          resolve(null);
          return;
        }
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
      });

      const fileData = await readFilePromise;

      const res = await api.attachManualEvidence(
        chargeId,
        {
          filename: selectedFile.name,
          file_type: selectedFile.type || 'application/octet-stream',
          file_size: selectedFile.size,
          description: evidenceDescription,
          file_data: typeof fileData === 'string' ? fileData : null
        },
        currentOrgId
      );

      if (res.success) {
        showToast(`✓ Manual evidence attached: ${selectedFile.name}`, 'success');
        setSelectedFile(null);
        setEvidenceDescription('');
        setShowAttachModal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadDetail();
      } else {
        setAttachError(res.error || 'Failed to attach evidence.');
      }
    } catch (err) {
      console.error('Failed to attach evidence:', err);
      setAttachError('Failed to attach evidence file. Please try again.');
    } finally {
      setAttaching(false);
    }
  };

  if (loading) {
    return (
      <section id="view-detail" className="view-section active">
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--rema-muted)' }}>
          Loading decision and operational evidence trace...
        </div>
      </section>
    );
  }

  if (!data || !data.charge || !data.decision) {
    return (
      <section id="view-detail" className="view-section active">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <span className="back-arrow">←</span> <span>{backLabel}</span>
        </button>
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--rema-muted)' }}>
          No claim details found for charge '{chargeId}'.
        </div>
      </section>
    );
  }

  const { charge, evidenceData, decision, auditTrail } = data;
  const isClaim = decision.verdict === 'CLAIM';
  const isNoClaim = decision.verdict === 'NO_CLAIM';

  const badgeClass = isClaim
    ? 'badge-claim'
    : isNoClaim
    ? 'badge-noclaim'
    : 'badge-uncertain';

  let rationaleTitle = 'CANNOT CLAIM: INSUFFICIENT OR CONFLICTING EVIDENCE';
  let rationaleColor = 'var(--rema-uncertain-text)';
  if (isClaim) {
    rationaleTitle = 'WHY THIS IS CLAIMABLE';
    rationaleColor = 'var(--rema-primary)';
  } else if (isNoClaim) {
    rationaleTitle = 'WHY THIS CANNOT BE CLAIMED (VALID CHARGE)';
    rationaleColor = 'var(--rema-muted)';
  }

  const hasConflicts = decision.conflicts && decision.conflicts.length > 0;
  const graph = evidenceData?.graph || {};
  const stages = [
    { key: 'receiving', name: 'Receiving Dock Audit', data: graph.receiving },
    { key: 'prep', name: 'Prep Compliance Audit', data: graph.prep },
    { key: 'pack', name: 'Pack & Dispatch Record', data: graph.pack },
    { key: 'returns', name: 'Returns Station Disposition', data: graph.returns }
  ];

  const totalChargeAmount = charge.amount_usd !== undefined && charge.amount_usd !== null
    ? charge.amount_usd
    : (decision.total_charge_amount !== undefined && decision.total_charge_amount !== null ? decision.total_charge_amount : decision.amount_usd || 0);

  const claimableAmount = decision.claim_amount_usd !== undefined && decision.claim_amount_usd !== null
    ? decision.claim_amount_usd
    : (isClaim ? (decision.amount_usd || 0) : 0);

  return (
    <section id="view-detail" className="view-section active">
      <button className="btn-back" id="btn-back-detail" onClick={() => navigate(-1)}>
        <span className="back-arrow">←</span> <span>{backLabel}</span>
      </button>

      {/* Toast Notification Banner */}
      {toast && (
        <div className={`action-notification-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Claim Detail Hero */}
      <div className="page-hero">
        <div className="flex-between">
          <div>
            <h1>
              ${totalChargeAmount.toFixed(2)} Total Charge Amount
            </h1>
            <p>
              {charge.unit_id || 'UNKNOWN'} · {charge.charge_type} · Posted {charge.posted_date || 'N/A'}
              {isClaim ? ` · Defensible Claim Value: $${claimableAmount.toFixed(2)}` : ''}
              {charge.sku ? ` · SKU: ${charge.sku}` : ''}
            </p>
          </div>
          <span className={`badge ${badgeClass} badge-detail`}>{decision.verdict}</span>
        </div>
      </div>

      <div className="claim-detail-card">
        {/* Rationale Callout */}
        <div className="rationale-callout">
          <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
            <h4 style={{ color: rationaleColor, margin: 0 }}>{rationaleTitle}</h4>
            <span className="badge-reason-code">{decision.reasonCode || decision.reason_code || 'DECISION_EVALUATED'}</span>
          </div>
          <p>{decision.explanation || decision.reason}</p>
          {decision.cannotClaim && decision.cannotClaimReason && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: 'var(--rema-uncertain-text)', fontWeight: 600 }}>
              ⚠ Cannot Claim Justification: {decision.cannotClaimReason || decision.cannot_claim_reason}
            </div>
          )}
        </div>

        {/* Visual Trace Lineage Stepper - 9 Sequential Operational Stages */}
        <div className="lineage-stepper">
          <div className="stepper-header">Defensible Traceability Chain (Charge → Unit → Upstream Evidence → Evidence Interpretation → Claim Decision → Supporting Evidence)</div>
          <div className="stepper-track">
            {/* 1. Charge */}
            <div className="step-node completed">
              <div className="step-circle">1</div>
              <div className="step-name">Charge</div>
              <div className="step-desc">{charge.charge_id} (${totalChargeAmount.toFixed(2)})</div>
            </div>
            <div className="step-arrow">→</div>

            {/* 2. Unit */}
            <div className="step-node completed">
              <div className="step-circle">2</div>
              <div className="step-name">Unit</div>
              <div className="step-desc">{decision.unit_id || charge.unit_id || 'Unmatched'}</div>
            </div>
            <div className="step-arrow">→</div>

            {/* 3. Upstream Evidence */}
            <div className="step-node completed">
              <div className="step-circle">3</div>
              <div className="step-name">Upstream Evidence</div>
              <div className="step-desc">
                {decision.evidence_coverage?.available?.join(', ') || (decision.supporting_evidence_ids?.length ? `${decision.supporting_evidence_ids.length} Records` : 'Available')}
              </div>
            </div>
            <div className="step-arrow">→</div>

            {/* 4. Evidence Interpretation */}
            <div className="step-node completed">
              <div className="step-circle">4</div>
              <div className="step-name">Evidence Interpretation</div>
              <div className="step-desc">{decision.contradiction_status}</div>
            </div>
            <div className="step-arrow">→</div>

            {/* 5. Claim Decision */}
            <div className="step-node completed">
              <div className="step-circle">5</div>
              <div className="step-name">Claim Decision</div>
              <div className="step-desc">
                {decision.verdict} (${totalChargeAmount.toFixed(2)})
              </div>
            </div>
            <div className="step-arrow">→</div>

            {/* 6. Supporting Evidence */}
            <div className="step-node completed">
              <div className="step-circle">6</div>
              <div className="step-name">Supporting Evidence</div>
              <div className="step-desc">
                {isClaim ? `$${claimableAmount.toFixed(2)} Defensible` : (decision.cannotClaim ? 'Ineligible' : 'Inconclusive')}
              </div>
            </div>
          </div>
        </div>

        {/* Authoritative Rule & Eligibility Detail Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', margin: '1.5rem 0' }}>
          {/* Authoritative Policy Rule Card */}
          <div className="policy-rule-card">
            <div className="policy-rule-header">
              <h4>Authoritative Policy Rule</h4>
              <span className="badge-reason-code">{decision.authoritativeRule?.ruleId || decision.authoritative_rule?.ruleId || 'AMZ Policy'}</span>
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--rema-text)', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                {decision.authoritativeRule?.sourceName || decision.authoritative_rule?.sourceName || 'Amazon Seller Central Help - FBA Reimbursement Policy'}
              </p>
              {(decision.authoritativeRule?.sourceUrl || decision.authoritative_rule?.sourceUrl) && (
                <p style={{ margin: '0 0 0.75rem 0' }}>
                  <a
                    href={decision.authoritativeRule?.sourceUrl || decision.authoritative_rule?.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="link-authoritative"
                  >
                    ↗ Authoritative Policy Source Reference
                  </a>
                </p>
              )}
              <div style={{ fontSize: '0.78rem', color: 'var(--rema-muted)', marginBottom: '0.75rem' }}>
                Effective Date: {decision.authoritativeRule?.effectiveDate || decision.authoritative_rule?.effectiveDate || '2024-03-01'} · Verified:{' '}
                {decision.authoritativeRule?.checkedAt ? new Date(decision.authoritativeRule.checkedAt).toLocaleDateString() : 'Active'}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--rema-primary-dark)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Authoritative Claim Conditions
              </div>
              <ul className="condition-list">
                {(decision.authoritativeRule?.claimConditions || decision.authoritative_rule?.claimConditions || []).map((cond, i) => (
                  <li key={i}>
                    <span className="condition-icon">✓</span>
                    <span><strong>{cond.name}:</strong> {cond.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Authoritative Eligibility Result Card */}
          <div className="policy-rule-card">
            <div className="policy-rule-header">
              <h4>Eligibility Evaluator Trace</h4>
              <span className={`badge ${decision.cannotClaim ? 'badge-uncertain' : 'badge-claim'}`}>
                {decision.eligibilityResult?.status || decision.eligibility_result?.status || (decision.cannotClaim ? 'INELIGIBLE' : 'ELIGIBLE')}
              </span>
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--rema-text)', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                {decision.eligibilityResult?.summary || decision.eligibility_result?.summary || (decision.cannotClaim ? 'Charge does not satisfy all authoritative eligibility rules.' : 'Charge satisfies authoritative filing window and eligibility criteria.')}
              </p>
              <div style={{ fontSize: '0.78rem', color: 'var(--rema-muted)', marginBottom: '0.75rem' }}>
                {decision.eligibilityResult?.windowDays ? `Authoritative Window: ${decision.eligibilityResult.windowDays} days` : 'Standard Window'} · Elapsed Charge Age:{' '}
                {decision.eligibilityResult?.chargeAgeDays !== null && decision.eligibilityResult?.chargeAgeDays !== undefined
                  ? `${decision.eligibilityResult.chargeAgeDays} days`
                  : 'Current'}
              </div>

              {/* Conditions Met / Failed */}
              {(decision.eligibilityResult?.conditionsMet?.length > 0 || decision.eligibility_result?.conditionsMet?.length > 0) && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--rema-primary-dark)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Conditions Verified Met
                  </div>
                  <ul className="condition-list">
                    {(decision.eligibilityResult?.conditionsMet || decision.eligibility_result?.conditionsMet || []).map((c, i) => (
                      <li key={i}>
                        <span className="condition-icon">✓</span> <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(decision.eligibilityResult?.conditionsFailed?.length > 0 || decision.eligibility_result?.conditionsFailed?.length > 0) && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#C62828', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Eligibility Disqualifications
                  </div>
                  <ul className="condition-list">
                    {(decision.eligibilityResult?.conditionsFailed || decision.eligibility_result?.conditionsFailed || []).map((c, i) => (
                      <li key={i}>
                        <span className="condition-icon fail">✗</span> <span style={{ color: '#C62828' }}>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Categorical Evidence Health Grid */}
        <div className="assessment-grid">
          <div className="assessment-box">
            <h5>Evidence Coverage</h5>
            <div className="assessment-val">{decision.evidence_coverage?.status}</div>
            <p>
              Required: {decision.evidence_coverage?.required?.join(', ') || 'None'} · Missing:{' '}
              {decision.evidence_coverage?.missing?.join(', ') || 'None'}
            </p>
          </div>
          <div className="assessment-box">
            <h5>Evidence Reliability</h5>
            <div className="assessment-val">{decision.evidence_reliability?.overall}</div>
            <p>
              Audit integrity verified across{' '}
              {decision.evidence_coverage?.available?.length || 0} upstream stations.
            </p>
          </div>
          <div className="assessment-box">
            <h5>Cross-Source Consistency</h5>
            <div className="assessment-val">{hasConflicts ? 'CONFLICTED' : 'CONSISTENT'}</div>
            <p>{hasConflicts ? decision.conflicts[0] : 'Zero cross-source discrepancies.'}</p>
          </div>
          <div className="assessment-box">
            <h5>Contradiction Assessment</h5>
            <div className="assessment-val">{decision.contradiction_status}</div>
            <p>
              {decision.contradiction_status === 'CONTRADICTS_CHARGE'
                ? 'Internal evidence disproves the charge.'
                : decision.contradiction_status === 'SUPPORTS_CHARGE'
                ? 'Evidence supports the charge.'
                : 'Inconclusive or requires valuation.'}
            </p>
          </div>
        </div>

        {/* Upstream Operational Evidence Records Accordion */}
        <h3 className="section-subheading">Upstream Operational Records</h3>
        <div>
          {stages.map((s) => {
            if (!s.data) return null;
            const isOpen = !!openAccordions[s.key];
            return (
              <div key={s.key} className={`raw-accordion ${isOpen ? 'open' : ''}`}>
                <div className="raw-accordion-header" onClick={() => toggleAccordion(s.key)}>
                  <span>
                    {s.name} ({s.data.evidence_id || s.data.record_id}) ·{' '}
                    {s.data.reliability_status || 'RELIABLE'}
                  </span>
                  <span>▼</span>
                </div>
                <div className="raw-accordion-content">
                  {JSON.stringify(s.data.raw_record || s.data, null, 2)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Additional Evidence (Optional) Section */}
        <div className="additional-evidence-section">
          <div className="additional-evidence-header">
            <div>
              <h4>Additional Evidence (Optional)</h4>
              <p className="additional-evidence-subtext">
                Have supporting documentation? Attach it to this case to provide additional evidence.
              </p>
              <div className="additional-evidence-note">
                You can continue without adding evidence.
              </div>
            </div>
            <button
              className="btn-attach-evidence"
              onClick={() => setShowAttachModal(true)}
            >
              <span>+</span> <span>Attach Evidence</span>
            </button>
          </div>

          {/* Attached Manual Evidence List */}
          {manualEvidence.length === 0 ? (
            <div style={{ padding: '0.85rem 1rem', background: 'var(--rema-background)', border: '1px dashed var(--rema-border)', borderRadius: 'var(--rema-radius-sm)', color: 'var(--rema-muted)', fontSize: '0.83rem', marginTop: '1rem' }}>
              No manual evidence attached. (REMA operates deterministically on upstream records without requiring manual attachments).
            </div>
          ) : (
            <div className="manual-evidence-list">
              {manualEvidence.map((mev, idx) => (
                <div key={mev.evidence_id || idx} className="manual-evidence-card">
                  <div className="manual-evidence-card-header">
                    <span className="badge-manual-source">Source: Seller / Manual Upload</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--rema-muted)', fontFamily: 'var(--rema-font-mono)' }}>
                      ID: {mev.evidence_id}
                    </span>
                  </div>
                  <div className="manual-evidence-title">
                    <span>📄 {mev.filename}</span>
                  </div>
                  <div className="manual-evidence-meta">
                    Type: {mev.file_type || 'Generic Document'} · Size: {mev.file_size ? `${(mev.file_size / 1024).toFixed(1)} KB` : 'N/A'} · Uploaded: {new Date(mev.created_at).toLocaleString()}
                  </div>
                  {mev.description && (
                    <div className="manual-evidence-desc">
                      <strong>Description:</strong> {mev.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operational Recovery Actions Toolbar */}
        <div className="claim-actions-toolbar">
          {/* Re-evaluate Case Action */}
          <button
            className="btn-action-primary"
            onClick={handleReevaluate}
            disabled={reEvaluating}
            title="Re-evaluate case through the deterministic decision engine"
          >
            {reEvaluating ? '⚙ Re-evaluating Case...' : '🔄 Re-evaluate Case'}
          </button>

          {/* Copy Dispute Package */}
          <button
            className="btn-action-secondary"
            onClick={handleCopyPackage}
            title="Copy complete traceable dispute package formatted text to clipboard"
          >
            📋 Copy Dispute Package
          </button>

          {/* Export Claim Dropdown */}
          <div className="export-menu-container" ref={exportMenuRef}>
            <button
              className="btn-action-secondary"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              title="Export complete claim package to local file"
            >
              📥 Export Claim ▾
            </button>
            {exportMenuOpen && (
              <div className="export-dropdown-menu">
                <button
                  className="export-dropdown-item"
                  onClick={() => handleExportClaim('json')}
                >
                  <span>JSON</span> <span>Download (.json)</span>
                </button>
                <button
                  className="export-dropdown-item"
                  onClick={() => handleExportClaim('txt')}
                >
                  <span>TXT</span> <span>Download (.txt)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Audit Event History */}
        <h3 className="section-subheading">Decision Audit Timeline</h3>
        <div className="audit-timeline">
          {auditTrail.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--rema-muted)' }}>
              No audit log events available.
            </p>
          ) : (
            auditTrail.map((evt, idx) => (
              <div
                key={evt.audit_id || idx}
                style={{
                  borderLeft: '2px solid var(--rema-primary)',
                  paddingLeft: '1rem',
                  paddingBottom: '0.75rem',
                  marginBottom: '0.5rem'
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--rema-muted)'
                  }}
                >
                  {new Date(evt.created_at).toLocaleTimeString()} · {evt.event_type}
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--rema-text)',
                    marginTop: '0.15rem'
                  }}
                >
                  {typeof evt.details === 'object' ? JSON.stringify(evt.details) : evt.details}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Attach Evidence Modal Dialog */}
      {showAttachModal && (
        <div className="modal-backdrop" onClick={() => setShowAttachModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Attach Additional Evidence</h3>
                <p>Supporting documentation is optional. Generic files supported (PDF, JPG, PNG, CSV, JSON).</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowAttachModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAttachSubmit}>
              <div className="modal-body">
                {attachError && (
                  <div style={{ color: '#C62828', background: '#FFEBEE', padding: '0.6rem 0.8rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                    {attachError}
                  </div>
                )}

                <div className="modal-form-group">
                  <label htmlFor="manual-file-input">Select File (Optional Supporting Proof)</label>
                  <input
                    id="manual-file-input"
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.jpg,.jpeg,.png,.csv,.json,application/pdf,image/jpeg,image/png,text/csv,application/json"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        setAttachError(null);
                      }
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--rema-muted)' }}>
                    Accepted formats: PDF, JPG, PNG, CSV, JSON
                  </span>
                </div>

                <div className="modal-form-group">
                  <label htmlFor="evidence-description">Evidence Description (Optional)</label>
                  <textarea
                    id="evidence-description"
                    placeholder="Provide a short description of what this documentation represents (e.g. Carrier POD, supplier packaging invoice)..."
                    value={evidenceDescription}
                    onChange={(e) => setEvidenceDescription(e.target.value)}
                  />
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--rema-muted)', fontStyle: 'italic' }}>
                  "You can continue without adding evidence."
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={() => setShowAttachModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action-primary"
                  disabled={attaching || !selectedFile}
                >
                  {attaching ? 'Attaching Evidence...' : 'Attach Evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
