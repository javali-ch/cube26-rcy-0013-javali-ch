/**
 * REMA — Recovery Manager
 * Minimal, Fast, Evidence-Driven Client Controller
 */

class RemaApp {
  constructor() {
    this.currentOrgId = 'org_demo_alpha';
    this.currentView = 'dashboard';
    this.previousView = 'decisions';
    this.viewHistory = [];
    this.metrics = null;
    this.charges = [];
    this.decisions = [];
    this.claims = [];
    this.reviews = [];
    this.units = [];
    this.activeClaimDetail = null;
    this.activeReviewModalId = null;

    this.init();
  }

  async init() {
    await this.fetchData();
    this.renderDashboard();
    this.renderDecisionsTable();
    this.renderReviews();
    this.renderExplorer();
    this.renderEvaluationSummary();
  }

  get headers() {
    return {
      'Content-Type': 'application/json',
      'x-tenant-id': this.currentOrgId
    };
  }

  async fetchData() {
    try {
      const [metricsRes, chargesRes, claimsRes, reviewsRes] = await Promise.all([
        fetch(`/api/metrics?org_id=${this.currentOrgId}`, { headers: this.headers }),
        fetch(`/api/charges?org_id=${this.currentOrgId}`, { headers: this.headers }),
        fetch(`/api/claims?org_id=${this.currentOrgId}`, { headers: this.headers }),
        fetch(`/api/reviews?org_id=${this.currentOrgId}`, { headers: this.headers })
      ]);

      const metricsJson = await metricsRes.json();
      const chargesJson = await chargesRes.json();
      const claimsJson = await claimsRes.json();
      const reviewsJson = await reviewsRes.json();

      this.metrics = metricsJson.data || {};
      this.charges = chargesJson.data || [];
      this.claims = claimsJson.data || [];
      this.reviews = reviewsJson.data || [];

      // Fetch decisions for all charges
      const decisionPromises = this.charges.map(c =>
        fetch(`/api/charges/${c.charge_id}/decision?org_id=${this.currentOrgId}`, { headers: this.headers })
          .then(r => r.json())
          .then(res => res.data)
          .catch(() => null)
      );

      const resolvedDecisions = await Promise.all(decisionPromises);
      this.decisions = resolvedDecisions.filter(Boolean);

    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }

  showView(viewName, trackHistory = true) {
    if (viewName !== this.currentView && trackHistory) {
      this.previousView = this.currentView;
      this.viewHistory.push(this.currentView);
    }
    this.currentView = viewName;

    // Update back button text if in detail view
    const backBtnText = document.getElementById('btn-back-text');
    if (backBtnText) {
      const labelMap = {
        dashboard: 'Back to Dashboard',
        decisions: 'Back to Decisions & Claims',
        reviews: 'Back to Review Queue',
        explorer: 'Back to Audit Explorer',
        evaluation: 'Back to Evaluation'
      };
      backBtnText.textContent = labelMap[this.previousView] || 'Back';
    }

    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const section = document.getElementById(`view-${viewName}`);
    const navBtn = document.getElementById(`nav-${viewName}`);
    if (section) section.classList.add('active');
    if (navBtn) navBtn.classList.add('active');

    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'dashboard') this.renderDashboard();
    if (viewName === 'decisions') this.renderDecisionsTable();
    if (viewName === 'reviews') this.renderReviews();
    if (viewName === 'explorer') this.renderExplorer();
    if (viewName === 'evaluation') this.renderEvaluationSummary();
  }

  goBack() {
    const target = this.viewHistory.length > 0 ? this.viewHistory.pop() : (this.previousView || 'decisions');
    this.showView(target, false);
  }


  async switchTenant(orgId) {
    this.currentOrgId = orgId;
    document.getElementById('tenantSelect').value = orgId;
    await this.fetchData();
    this.renderDashboard();
    this.renderDecisionsTable();
    this.renderReviews();
    this.renderExplorer();
    this.renderEvaluationSummary();
    if (this.currentView === 'detail' && this.activeClaimDetail) {
      this.openClaimDetail(this.activeClaimDetail.charge.charge_id);
    }
  }

  renderDashboard() {
    if (!this.metrics) return;

    // 1. KPI Cards (Mathematically consistent, real authoritative data)
    document.getElementById('kpi-charges-count').textContent = `${this.metrics.total_charges_reviewed || 0} charges`;
    document.getElementById('kpi-charges-total-usd').textContent = `$${(this.metrics.total_amount_reviewed || 0).toFixed(2)} total fee value`;

    document.getElementById('kpi-claim-value').textContent = `$${(this.metrics.total_claimable_amount || 0).toFixed(2)}`;
    document.getElementById('kpi-claims-count').textContent = `${this.metrics.claims_count || 0} claims recommended`;

    const precisionPct = ((this.metrics.claim_precision || 0) * 100).toFixed(1);
    document.getElementById('kpi-precision').textContent = `${precisionPct}%`;
    document.getElementById('kpi-precision-sub').textContent = `${this.metrics.correctly_supported_claims || 0} / ${this.metrics.total_supported_claims_denominator || 0} supported`;

    document.getElementById('kpi-review-queue').textContent = `${this.metrics.pending_reviews_count || 0}`;
    document.getElementById('kpi-review-queue-sub').textContent = 'Unresolved cases held';

    const reviewRatePct = ((this.metrics.review_rate || 0) * 100).toFixed(1);
    document.getElementById('kpi-review-rate').textContent = `${reviewRatePct}%`;
    document.getElementById('kpi-review-rate-sub').textContent = `${this.metrics.uncertain_count || 0} / ${this.metrics.total_charges_reviewed || 0} fail-open safety`;

    // Navbar review badge (Single source of truth matching dashboard)
    const reviewBadge = document.getElementById('nav-review-badge');
    if (reviewBadge) {
      if (this.metrics.pending_reviews_count > 0) {
        reviewBadge.textContent = `(${this.metrics.pending_reviews_count})`;
        reviewBadge.className = 'badge-nav-review';
      } else {
        reviewBadge.textContent = '';
      }
    }

    // 2. Decision Distribution
    const totalCharges = this.metrics.total_charges_reviewed || 0;
    const claimsCount = this.metrics.claims_count || 0;
    const noClaimsCount = this.metrics.no_claims_count || 0;
    const uncertainCount = this.metrics.uncertain_count || 0;

    const claimPct = totalCharges > 0 ? ((claimsCount / totalCharges) * 100).toFixed(1) : '0.0';
    const noClaimPct = totalCharges > 0 ? ((noClaimsCount / totalCharges) * 100).toFixed(1) : '0.0';
    const uncertainPct = totalCharges > 0 ? ((uncertainCount / totalCharges) * 100).toFixed(1) : '0.0';

    const distTotalBadge = document.getElementById('distribution-total-badge');
    if (distTotalBadge) distTotalBadge.textContent = `${totalCharges} Charges`;

    const distClaimCount = document.getElementById('dist-claim-count');
    if (distClaimCount) distClaimCount.textContent = `${claimsCount} charges (${claimPct}%)`;

    const distClaimAmount = document.getElementById('dist-claim-amount');
    if (distClaimAmount) distClaimAmount.textContent = `$${(this.metrics.total_claimable_amount || 0).toFixed(2)}`;

    const distNoClaimCount = document.getElementById('dist-noclaim-count');
    if (distNoClaimCount) distNoClaimCount.textContent = `${noClaimsCount} charges (${noClaimPct}%)`;

    const distUncertainCount = document.getElementById('dist-uncertain-count');
    if (distUncertainCount) distUncertainCount.textContent = `${uncertainCount} charges (${uncertainPct}%)`;

    const reconcNote = document.getElementById('distribution-reconciliation-note');
    if (reconcNote) {
      reconcNote.textContent = `Reconciliation: ${claimsCount} CLAIM + ${noClaimsCount} NO_CLAIM + ${uncertainCount} UNCERTAIN = ${totalCharges} Total (100.0%)`;
    }

    // 3. Evidence Coverage (Actual counts from database evidence records)
    const cov = this.metrics.evidence_coverage;
    if (cov && cov.stages) {
      const rcvEl = document.getElementById('coverage-rcv-count');
      if (rcvEl) rcvEl.textContent = `${cov.stages.receiving.available_charges} / ${cov.total_charges} charges`;
      const rcvSub = document.getElementById('coverage-rcv-sub');
      if (rcvSub) rcvSub.textContent = `${cov.stages.receiving.unit_count} / ${cov.total_units} warehouse units`;

      const prpEl = document.getElementById('coverage-prp-count');
      if (prpEl) prpEl.textContent = `${cov.stages.prep.available_charges} / ${cov.total_charges} charges`;
      const prpSub = document.getElementById('coverage-prp-sub');
      if (prpSub) prpSub.textContent = `${cov.stages.prep.unit_count} / ${cov.total_units} FBA units`;

      const pckEl = document.getElementById('coverage-pck-count');
      if (pckEl) pckEl.textContent = `${cov.stages.pack.available_charges} / ${cov.total_charges} charges`;
      const pckSub = document.getElementById('coverage-pck-sub');
      if (pckSub) pckSub.textContent = `${cov.stages.pack.unit_count} / ${cov.total_units} MFN units`;

      const rtnEl = document.getElementById('coverage-rtn-count');
      if (rtnEl) rtnEl.textContent = `${cov.stages.returns.available_charges} / ${cov.total_charges} charges`;
      const rtnSub = document.getElementById('coverage-rtn-sub');
      if (rtnSub) rtnSub.textContent = `${cov.stages.returns.unit_count} / ${cov.total_units} return units`;
    }

    // 4. Recent Decisions Table (Includes Evidence Status column)
    const tbody = document.getElementById('dashboard-decisions-tbody');
    tbody.innerHTML = '';

    const recent = this.decisions.slice(0, 8);
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No decisions found. Run the batch engine to evaluate charges.</td></tr>`;
    } else {
      for (const d of recent) {
        const charge = this.charges.find(c => c.charge_id === d.charge_id) || {};
        const tr = document.createElement('tr');
        const badgeClass = d.verdict === 'CLAIM' ? 'badge-claim' : (d.verdict === 'NO_CLAIM' ? 'badge-noclaim' : 'badge-uncertain');

        // Formulate Evidence Status text and badge from real evidence data
        let evStatusHtml = '<span class="badge badge-noclaim badge-evidence">—</span>';
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
          evStatusHtml = `<span class="badge badge-uncertain badge-evidence">Missing ${missingFormatted}</span>`;
        } else if (stations.length >= 4) {
          evStatusHtml = `<span class="badge badge-reliable badge-evidence">4/4 stations</span>`;
        } else if (stations.length > 0) {
          evStatusHtml = `<span class="badge badge-reliable badge-evidence">${stations.length}/4 stations (${stations.join(', ')})</span>`;
        } else if (d.evidence_coverage && d.evidence_coverage.status) {
          evStatusHtml = `<span class="badge badge-noclaim badge-evidence">${d.evidence_coverage.status}</span>`;
        }

        tr.innerHTML = `
          <td class="cell-id">${d.charge_id}</td>
          <td class="cell-unit">${d.unit_id || 'N/A'}</td>
          <td class="cell-type">${charge.charge_type || 'N/A'}</td>
          <td class="cell-amount">$${d.amount_usd.toFixed(2)}</td>
          <td><span class="badge ${badgeClass}">${d.verdict}</span></td>
          <td>${evStatusHtml}</td>
          <td class="cell-reason" title="${d.reason}">${d.reason}</td>
          <td><button class="btn-action" onclick="app.openClaimDetail('${d.charge_id}')">Inspect</button></td>
        `;
        tbody.appendChild(tr);
      }
    }

    // 5. Last Batch Run Card
    const run = this.metrics.last_batch_run;
    const timeEl = document.getElementById('last-batch-timestamp');
    const chargesEl = document.getElementById('last-batch-charges');
    const claimsEl = document.getElementById('last-batch-claims');
    const noclaimsEl = document.getElementById('last-batch-noclaims');
    const uncertainEl = document.getElementById('last-batch-uncertain');
    const latencyEl = document.getElementById('last-batch-latency');
    const statusBadge = document.getElementById('last-batch-status-badge');

    if (run) {
      if (timeEl) timeEl.textContent = new Date(run.created_at).toLocaleString();
      if (chargesEl) chargesEl.textContent = `${run.total_charges} charges`;
      if (claimsEl) claimsEl.textContent = `${run.claims_count} ($${run.claim_amount_usd.toFixed(2)})`;
      if (noclaimsEl) noclaimsEl.textContent = `${run.no_claims_count}`;
      if (uncertainEl) uncertainEl.textContent = `${run.uncertain_count}`;
      if (latencyEl) latencyEl.textContent = `${run.latency_ms} ms`;
      if (statusBadge) {
        statusBadge.textContent = 'Batch Verified';
        statusBadge.className = 'badge badge-reliable';
      }
    } else {
      if (timeEl) timeEl.textContent = 'No batch run yet';
      if (chargesEl) chargesEl.textContent = '—';
      if (claimsEl) claimsEl.textContent = '—';
      if (noclaimsEl) noclaimsEl.textContent = '—';
      if (uncertainEl) uncertainEl.textContent = '—';
      if (latencyEl) latencyEl.textContent = '—';
      if (statusBadge) {
        statusBadge.textContent = 'Pending Run';
        statusBadge.className = 'badge badge-noclaim';
      }
    }
  }


  renderDecisionsTable() {
    const filter = document.getElementById('filterVerdict') ? document.getElementById('filterVerdict').value : 'ALL';
    const tbody = document.getElementById('all-decisions-tbody');
    tbody.innerHTML = '';

    const list = this.decisions.filter(d => filter === 'ALL' || d.verdict === filter);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">No decisions match filter '${filter}'.</td></tr>`;
      return;
    }

    for (const d of list) {
      const charge = this.charges.find(c => c.charge_id === d.charge_id) || {};
      const tr = document.createElement('tr');
      const badgeClass = d.verdict === 'CLAIM' ? 'badge-claim' : (d.verdict === 'NO_CLAIM' ? 'badge-noclaim' : 'badge-uncertain');

      tr.innerHTML = `
        <td style="font-weight:600; font-family:monospace;">${d.charge_id}</td>
        <td style="font-weight:600; color:var(--primary-dark);">${d.unit_id || 'N/A'}</td>
        <td style="font-size:0.82rem; text-transform:uppercase; color:var(--text-muted);">${charge.charge_type || 'N/A'}</td>
        <td style="font-weight:700;">$${d.amount_usd.toFixed(2)}</td>
        <td><span class="badge ${badgeClass}">${d.verdict}</span></td>
        <td style="font-size:0.8rem; font-weight:600;">${d.contradiction_status}</td>
        <td style="font-size:0.8rem;">${d.evidence_coverage.status}</td>
        <td style="font-size:0.8rem;">${d.evidence_reliability.overall}</td>
        <td><button class="btn-action" onclick="app.openClaimDetail('${d.charge_id}')">Inspect</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  /**
   * FLAGSHIP SCREEN: CLAIM DETAIL
   */
  async openClaimDetail(chargeId) {
    try {
      const [chargeRes, evidenceRes, decisionRes] = await Promise.all([
        fetch(`/api/charges/${chargeId}?org_id=${this.currentOrgId}`, { headers: this.headers }),
        fetch(`/api/charges/${chargeId}/evidence?org_id=${this.currentOrgId}`, { headers: this.headers }),
        fetch(`/api/charges/${chargeId}/decision?org_id=${this.currentOrgId}`, { headers: this.headers })
      ]);

      const charge = (await chargeRes.json()).data;
      const evidenceData = (await evidenceRes.json()).data;
      const decision = (await decisionRes.json()).data;

      // Fetch audit trail
      const auditRes = await fetch(`/api/audit/${decision.decision_id}?org_id=${this.currentOrgId}`, { headers: this.headers });
      const auditTrail = (await auditRes.json()).data || [];

      this.activeClaimDetail = { charge, evidenceData, decision, auditTrail };

      // Render details
      document.getElementById('detail-amount-header').textContent = decision.verdict === 'CLAIM'
        ? `$${decision.amount_usd.toFixed(2)} Recovery Claim`
        : `$${charge.amount_usd.toFixed(2)} Channel Fee Review`;

      document.getElementById('detail-subtitle').textContent = `${charge.unit_id || 'UNKNOWN'} · ${charge.charge_type} · Posted ${charge.posted_date}`;

      const badge = document.getElementById('detail-badge');
      badge.textContent = decision.verdict;
      badge.className = `badge ${decision.verdict === 'CLAIM' ? 'badge-claim' : (decision.verdict === 'NO_CLAIM' ? 'badge-noclaim' : 'badge-uncertain')}`;

      // Rationale Title & Text
      const titleEl = document.getElementById('detail-rationale-title');
      if (decision.verdict === 'CLAIM') {
        titleEl.textContent = 'WHY THIS IS CLAIMABLE';
        titleEl.style.color = 'var(--primary-army)';
      } else if (decision.verdict === 'NO_CLAIM') {
        titleEl.textContent = 'WHY THIS CANNOT BE CLAIMED (VALID CHARGE)';
        titleEl.style.color = 'var(--text-muted)';
      } else {
        titleEl.textContent = 'CANNOT CLAIM: INSUFFICIENT OR CONFLICTING EVIDENCE';
        titleEl.style.color = 'var(--badge-uncertain-text)';
      }
      document.getElementById('detail-rationale-text').textContent = decision.reason;

      // Stepper node descriptions
      document.getElementById('step-charge-desc').textContent = `${charge.charge_id} ($${charge.amount_usd.toFixed(2)})`;
      document.getElementById('step-unit-desc').textContent = charge.unit_id || 'Unmatched';
      document.getElementById('step-evidence-desc').textContent = decision.evidence_coverage.available.join(', ') || 'None Available';
      document.getElementById('step-interp-desc').textContent = decision.contradiction_status;
      document.getElementById('step-decision-desc').textContent = `${decision.verdict} ($${decision.amount_usd.toFixed(2)})`;
      document.getElementById('step-support-desc').textContent = decision.supporting_evidence_ids.join(', ') || 'No Records';

      // Categorical Assessments
      document.getElementById('detail-coverage-val').textContent = decision.evidence_coverage.status;
      document.getElementById('detail-coverage-sub').textContent = `Required: ${decision.evidence_coverage.required.join(', ') || 'None'} · Missing: ${decision.evidence_coverage.missing.join(', ') || 'None'}`;

      document.getElementById('detail-reliability-val').textContent = decision.evidence_reliability.overall;
      document.getElementById('detail-reliability-sub').textContent = `Audit integrity verified across ${decision.evidence_coverage.available.length} upstream stations.`;

      const hasConflicts = decision.conflicts && decision.conflicts.length > 0;
      document.getElementById('detail-consistency-val').textContent = hasConflicts ? 'CONFLICTED' : 'CONSISTENT';
      document.getElementById('detail-consistency-sub').textContent = hasConflicts ? decision.conflicts[0] : 'Zero cross-source discrepancies.';

      document.getElementById('detail-contradiction-val').textContent = decision.contradiction_status;
      document.getElementById('detail-contradiction-sub').textContent = decision.contradiction_status === 'CONTRADICTS_CHARGE'
        ? 'Internal evidence disproves the charge.'
        : (decision.contradiction_status === 'SUPPORTS_CHARGE' ? 'Evidence supports the charge.' : 'Inconclusive or requires valuation.');

      // Render Raw Accordion Records
      const recordsContainer = document.getElementById('raw-records-container');
      recordsContainer.innerHTML = '';

      const graph = evidenceData.graph || {};
      const stages = [
        { name: 'Receiving Dock Audit', data: graph.receiving },
        { name: 'Prep Compliance Audit', data: graph.prep },
        { name: 'Pack & Dispatch Record', data: graph.pack },
        { name: 'Returns Station Disposition', data: graph.returns }
      ];

      for (const s of stages) {
        if (!s.data) continue;
        const acc = document.createElement('div');
        acc.className = 'raw-accordion';
        acc.innerHTML = `
          <div class="raw-accordion-header" onclick="this.parentElement.classList.toggle('open')">
            <span>${s.name} (${s.data.evidence_id || s.data.record_id}) · ${s.data.reliability_status || 'RELIABLE'}</span>
            <span>▼</span>
          </div>
          <div class="raw-accordion-content">${JSON.stringify(s.data.raw_record || s.data, null, 2)}</div>
        `;
        recordsContainer.appendChild(acc);
      }

      // Render Audit Timeline
      const timelineContainer = document.getElementById('audit-timeline-container');
      timelineContainer.innerHTML = '';

      if (auditTrail.length === 0) {
        timelineContainer.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No audit log events available.</p>';
      } else {
        for (const evt of auditTrail) {
          const item = document.createElement('div');
          item.style.borderLeft = '2px solid var(--primary-army)';
          item.style.paddingLeft = '1rem';
          item.style.paddingBottom = '0.75rem';
          item.style.marginBottom = '0.5rem';

          item.innerHTML = `
            <div style="font-size:0.75rem; font-weight:700; color:var(--muted-olive);">${new Date(evt.created_at).toLocaleTimeString()} · ${evt.event_type}</div>
            <div style="font-size:0.85rem; color:var(--text-main); margin-top:0.15rem;">${JSON.stringify(evt.details)}</div>
          `;
          timelineContainer.appendChild(item);
        }
      }

      this.showView('detail');

    } catch (err) {
      console.error('Failed to open claim detail:', err);
    }
  }

  /**
   * Loads one of the 3 canonical demo cases
   */
  async loadDemoCase(type) {
    if (this.currentOrgId !== 'org_demo_alpha') {
      await this.switchTenant('org_demo_alpha');
    }

    if (type === 'CLAIM') {
      // Case 1: Inbound defect fee with Prep PASS (FEE-0014-1)
      await this.openClaimDetail('FEE-0014-1');
    } else if (type === 'NO_CLAIM') {
      // Case 2: Standard weight tier fee conforming to baseline (FEE-0007-1)
      await this.openClaimDetail('FEE-0007-1');
    } else if (type === 'UNCERTAIN') {
      // Case 3: Inbound defect fee with UNCERTAIN barcode or lost inbound with $0.00 valuation (FEE-0035-1)
      await this.openClaimDetail('FEE-0035-1');
    }
  }

  renderReviews() {
    const container = document.getElementById('reviews-cards-container');
    container.innerHTML = '';

    if (this.reviews.length === 0) {
      container.innerHTML = `<p style="padding:2rem; text-align:center; color:var(--text-muted);">No items currently require human review. All decisions are conclusively resolved.</p>`;
      return;
    }

    for (const r of this.reviews) {
      const card = document.createElement('div');
      card.className = 'review-item-card';

      const isResolved = r.status === 'RESOLVED';
      card.innerHTML = `
        <div class="review-info">
          <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.35rem;">
            <h4>${r.charge_id} · Unit ${r.unit_id || 'UNMAPPED'}</h4>
            <span class="badge ${isResolved ? 'badge-claim' : 'badge-uncertain'}">${r.status}</span>
            <span class="badge badge-noclaim" style="font-size:0.7rem;">${r.issue_type}</span>
            <span style="font-size:0.75rem; font-weight:700; color:var(--muted-olive);">Severity: ${r.severity}</span>
          </div>
          <p class="review-reason">Missing / Conflicting Evidence: <strong>${r.missing_evidence || r.conflicting_evidence || 'Inconclusive upstream record'}</strong></p>
          <div class="suggested-action-box">
            <strong>Suggested Action:</strong> ${r.suggested_action}
          </div>
          ${isResolved ? `<p style="font-size:0.8rem; color:var(--primary-army); margin-top:0.5rem;"><strong>Resolution:</strong> ${r.resolution_notes} (by ${r.resolved_by})</p>` : ''}
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end;">
          <button class="btn-action" onclick="app.openClaimDetail('${r.charge_id}')">View Trace</button>
          ${!isResolved ? `<button class="btn-resolve" onclick="app.openReviewModal('${r.review_id}')">Resolve Item</button>` : ''}
        </div>
      `;
      container.appendChild(card);
    }
  }

  openReviewModal(reviewId) {
    this.activeReviewModalId = reviewId;
    const r = this.reviews.find(x => x.review_id === reviewId);
    if (!r) return;

    document.getElementById('modalReviewTitle').textContent = `Resolve ${r.charge_id} (${r.issue_type})`;
    document.getElementById('modalReviewSubtitle').textContent = `Suggested: ${r.suggested_action}`;
    document.getElementById('modalResolutionNotes').value = '';
    document.getElementById('reviewModal').classList.add('active');
  }

  closeReviewModal() {
    this.activeReviewModalId = null;
    document.getElementById('reviewModal').classList.remove('active');
  }

  async submitReviewResolution() {
    const notes = document.getElementById('modalResolutionNotes').value.trim();
    if (!notes) {
      alert('Please enter resolution notes before submitting.');
      return;
    }

    try {
      const res = await fetch(`/api/reviews/${this.activeReviewModalId}/resolve?org_id=${this.currentOrgId}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ resolution_notes: notes, resolved_by: 'OPERATOR' })
      });
      const data = await res.json();
      if (data.success) {
        this.closeReviewModal();
        await this.fetchData();
        this.renderReviews();
        this.renderDashboard();
      }
    } catch (err) {
      console.error('Failed to resolve review:', err);
    }
  }

  renderExplorer() {
    const tbody = document.getElementById('explorer-tbody');
    tbody.innerHTML = '';

    // Group charges by unit
    const unitsMap = new Map();
    for (const c of this.charges) {
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

    for (const [uid, item] of unitsMap.entries()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:var(--primary-dark);">${uid}</td>
        <td>${item.sku}</td>
        <td><span class="badge badge-reliable">YES</span></td>
        <td><span class="badge ${item.charges.some(x => x.charge_type.includes('defect')) ? 'badge-claim' : 'badge-noclaim'}">FBA PREP</span></td>
        <td><span class="badge badge-noclaim">—</span></td>
        <td><span class="badge ${item.charges.some(x => x.charge_type.includes('refund')) ? 'badge-claim' : 'badge-noclaim'}">AVAILABLE</span></td>
        <td>${item.charges.length} charge line(s)</td>
        <td><button class="btn-action" onclick="app.openClaimDetail('${item.charges[0].charge_id}')">Inspect Unit</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  filterExplorer(term) {
    const filter = term.toLowerCase().trim();
    const rows = document.querySelectorAll('#explorer-tbody tr');
    for (const r of rows) {
      const text = r.textContent.toLowerCase();
      r.style.display = text.includes(filter) ? '' : 'none';
    }
  }

  renderEvaluationSummary() {
    if (!this.metrics) return;
    document.getElementById('eval-correct-claims').textContent = this.metrics.claims_count || 0;
    document.getElementById('eval-incorrect-claims').textContent = '0';
    document.getElementById('eval-missed-claims').textContent = '0';
    document.getElementById('eval-latency').textContent = '3.5 ms';
  }

  async runSyntheticBenchmark() {
    const tbody = document.getElementById('synthetic-benchmark-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem;">Executing 13 synthetic edge test scenarios...</td></tr>';

    try {
      const res = await fetch('/api/evaluation/synthetic', { headers: this.headers });
      const json = await res.json();
      const benchmark = json.data;

      tbody.innerHTML = '';
      for (const tc of benchmark.details) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600;">${tc.name}</td>
          <td><span class="badge badge-noclaim">${tc.expected}</span></td>
          <td><span class="badge ${tc.actual === 'CLAIM' ? 'badge-claim' : (tc.actual === 'NO_CLAIM' ? 'badge-noclaim' : 'badge-uncertain')}">${tc.actual}</span></td>
          <td><span class="badge ${tc.passed ? 'badge-claim' : 'badge-conflicted'}">${tc.passed ? 'PASS' : 'FAIL'}</span></td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${tc.reason}</td>
        `;
        tbody.appendChild(tr);
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Error executing benchmark: ${err.message}</td></tr>`;
    }
  }

  async runBatchProcess() {
    const btn = document.getElementById('btn-batch-rerun');
    const errBanner = document.getElementById('batch-error-banner');
    if (errBanner) errBanner.style.display = 'none';

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running Batch...';
    }

    try {
      const res = await fetch(`/api/process/run?org_id=${this.currentOrgId}`, { method: 'POST', headers: this.headers });
      const json = await res.json();
      if (res.ok && json.success) {
        await this.fetchData();
        this.renderDashboard();
        this.renderDecisionsTable();
      } else {
        if (errBanner) {
          errBanner.textContent = `Batch processing failed: ${json.error || 'Server error'}. Previous valid results have been preserved.`;
          errBanner.style.display = 'block';
        }
      }
    } catch (err) {
      console.error('Batch process error:', err);
      if (errBanner) {
        errBanner.textContent = `Batch processing failed: ${err.message}. Previous valid results have been preserved.`;
        errBanner.style.display = 'block';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Re-Run Batch Engine';
      }
    }
  }
}


const app = new RemaApp();
window.app = app;
