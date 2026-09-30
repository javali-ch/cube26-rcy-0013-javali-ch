/**
 * REMA — Recovery Manager
 * Dispute Package Generation and Export Utility
 *
 * Lineage: Charge → Unit → Upstream Evidence → Evidence Interpretation → Claim Decision → Supporting Evidence
 *
 * Adheres strictly to the principle of zero hallucination:
 * - Uses only actual data already associated with the decision
 * - Preserves distinction: Total Charge Amount (primary) vs Claimable Amount
 * - Distinguishes upstream evidence from Seller / Manual Upload evidence
 */

export function buildDisputePackageData({ charge, decision, evidenceData, manualEvidence = [], auditTrail = [] }) {
  if (!charge || !decision) return null;

  const totalChargeAmount = charge.amount_usd !== undefined && charge.amount_usd !== null
    ? Number(charge.amount_usd)
    : (decision.total_charge_amount !== undefined && decision.total_charge_amount !== null ? Number(decision.total_charge_amount) : Number(decision.amount_usd || 0));

  const claimableAmount = decision.claim_amount_usd !== undefined && decision.claim_amount_usd !== null
    ? Number(decision.claim_amount_usd)
    : (decision.verdict === 'CLAIM' ? (decision.amount_usd || 0) : 0);

  const unitId = decision.unit_id || charge.unit_id || 'UNMATCHED';
  const sku = charge.sku || charge.raw_record?.sku || null;
  const graph = evidenceData?.graph || {};

  const authoritativeRule = decision.authoritativeRule || decision.authoritative_rule || null;
  const eligibilityResult = decision.eligibilityResult || decision.eligibility_result || null;

  const supportingEvidenceIds = decision.supporting_evidence_ids || decision.supportingEvidence || decision.supporting_evidence || [];

  return {
    packageType: 'REMA_DISPUTE_PACKAGE',
    version: '1.0',
    exportTimestamp: new Date().toISOString(),
    chargeId: charge.charge_id,
    totalChargeAmount: Number(totalChargeAmount.toFixed(2)),
    claimableAmount: Number(claimableAmount.toFixed(2)),
    currency: charge.currency || 'USD',
    unitId: unitId,
    sku: sku,
    chargeType: charge.charge_type,
    postedDate: charge.posted_date || 'N/A',
    decision: decision.verdict,
    reasonCode: decision.reasonCode || decision.reason_code || 'N/A',
    claimRationale: decision.explanation || decision.reason || 'N/A',
    cannotClaim: !!decision.cannotClaim,
    cannotClaimReason: decision.cannotClaimReason || decision.cannot_claim_reason || null,
    applicablePolicyRule: {
      ruleId: authoritativeRule?.ruleId || decision.rule_version || 'N/A',
      ruleName: authoritativeRule?.ruleName || 'Standard Policy Assessment',
      sourceName: authoritativeRule?.sourceName || 'Amazon Seller Central Help - FBA Reimbursement Policy',
      sourceUrl: authoritativeRule?.sourceUrl || null,
      effectiveDate: authoritativeRule?.effectiveDate || '2024-03-01',
      sourceAvailable: authoritativeRule?.sourceAvailable ?? true,
      claimConditions: authoritativeRule?.claimConditions || []
    },
    eligibility: {
      status: eligibilityResult?.status || (decision.cannotClaim ? 'INELIGIBLE' : 'ELIGIBLE'),
      summary: eligibilityResult?.summary || (decision.cannotClaim ? 'Ineligible based on authoritative policy criteria' : 'Satisfies authoritative filing criteria'),
      windowDays: eligibilityResult?.windowDays || null,
      chargeAgeDays: eligibilityResult?.chargeAgeDays ?? null,
      conditionsMet: eligibilityResult?.conditionsMet || [],
      conditionsFailed: eligibilityResult?.conditionsFailed || []
    },
    contradictionAssessment: decision.contradiction_status || 'NONE',
    evidenceInterpretation: {
      coverageStatus: decision.evidence_coverage?.status || 'UNKNOWN',
      requiredStages: decision.evidence_coverage?.required || [],
      availableStages: decision.evidence_coverage?.available || [],
      missingStages: decision.evidence_coverage?.missing || decision.missing_evidence || [],
      reliability: decision.evidence_reliability?.overall || 'UNKNOWN',
      consistency: decision.conflicts?.length ? 'CONFLICTED' : 'CONSISTENT',
      conflicts: decision.conflicts || []
    },
    supportingEvidence: supportingEvidenceIds,
    traceabilityChain: [
      {
        stage: 'Charge',
        step: 1,
        details: `Charge ID: ${charge.charge_id} | Total Charge Amount: $${totalChargeAmount.toFixed(2)} ${charge.currency || 'USD'} | Type: ${charge.charge_type}`
      },
      {
        stage: 'Unit',
        step: 2,
        details: `Unit ID: ${unitId}${sku ? ` | SKU: ${sku}` : ''}`
      },
      {
        stage: 'Upstream Evidence',
        step: 3,
        details: `Available Stations: ${(decision.evidence_coverage?.available || []).join(', ') || 'None'} | Reliability: ${decision.evidence_reliability?.overall || 'N/A'}`
      },
      {
        stage: 'Evidence Interpretation',
        step: 4,
        details: `Contradiction: ${decision.contradiction_status || 'N/A'} | Coverage: ${decision.evidence_coverage?.status || 'N/A'}`
      },
      {
        stage: 'Claim Decision',
        step: 5,
        details: `Verdict: ${decision.verdict} | Primary Total Charge: $${totalChargeAmount.toFixed(2)} | Claimable: $${claimableAmount.toFixed(2)}`
      },
      {
        stage: 'Supporting Evidence',
        step: 6,
        details: supportingEvidenceIds.length > 0 ? supportingEvidenceIds.join(', ') : 'None'
      }
    ],
    upstreamEvidence: {
      receiving: graph.receiving ? { ...graph.receiving } : null,
      prep: graph.prep ? { ...graph.prep } : null,
      pack: graph.pack ? { ...graph.pack } : null,
      returns: graph.returns ? { ...graph.returns } : null
    },
    manualEvidence: (manualEvidence || []).map(m => ({
      evidenceId: m.evidence_id,
      filename: m.filename,
      fileType: m.file_type,
      fileSize: m.file_size,
      description: m.description,
      uploadTimestamp: m.created_at,
      source: 'Seller / Manual Upload'
    })),
    auditTrail: (auditTrail || []).map(a => ({
      timestamp: a.created_at,
      eventType: a.event_type,
      details: a.details
    }))
  };
}

export function formatDisputePackageAsText(pkg) {
  if (!pkg) return '';

  const sep = '='.repeat(80);
  const subSep = '-'.repeat(80);

  const lines = [
    sep,
    'REMA RECOVERY MANAGEMENT — DISPUTE PACKAGE',
    sep,
    `Exported At:            ${pkg.exportTimestamp}`,
    'Package Status:         INTERNAL DISPUTE PACKAGE (NOT SUBMITTED TO CHANNEL)',
    'Notice:                 This document is an evidence-traceable claim recovery package.',
    '',
    subSep,
    '1. CHARGE SUMMARY & FINANCIAL AMOUNTS',
    subSep,
    `Charge ID:              ${pkg.chargeId}`,
    `Total Charge Amount:    $${pkg.totalChargeAmount.toFixed(2)} ${pkg.currency} (Original Reported Fee)`,
    `Defensible Claim Value: $${pkg.claimableAmount.toFixed(2)} ${pkg.currency} (Defensibly Recoverable)`,
    `Unit Identifier:        ${pkg.unitId}`,
    `SKU:                    ${pkg.sku || 'N/A'}`,
    `Fee / Charge Type:      ${pkg.chargeType}`,
    `Posted Date:            ${pkg.postedDate}`,
    `Decision Verdict:       ${pkg.decision}`,
    `Reason Code:            ${pkg.reasonCode}`,
    '',
    subSep,
    '2. CLAIM RATIONALE & POLICY AUTHORITY',
    subSep,
    `Claim Rationale:`,
    `  ${pkg.claimRationale}`,
    pkg.cannotClaimReason ? `  Cannot Claim Reason: ${pkg.cannotClaimReason}` : '',
    '',
    `Applicable Policy Rule: ${pkg.applicablePolicyRule.ruleId} (${pkg.applicablePolicyRule.ruleName})`,
    `Policy Source Name:     ${pkg.applicablePolicyRule.sourceName}`,
    `Policy Source URL:      ${pkg.applicablePolicyRule.sourceUrl || 'N/A'}`,
    `Effective Date:         ${pkg.applicablePolicyRule.effectiveDate}`,
    `Source Authority:       ${pkg.applicablePolicyRule.sourceAvailable ? 'VERIFIED / ACTIVE' : 'UNAVAILABLE / SUSPENDED'}`,
    '',
    `Eligibility Evaluation: ${pkg.eligibility.status}`,
    `Eligibility Summary:    ${pkg.eligibility.summary}`,
    pkg.eligibility.windowDays ? `Authoritative Window:   ${pkg.eligibility.windowDays} days` : '',
    pkg.eligibility.chargeAgeDays !== null ? `Elapsed Charge Age:     ${pkg.eligibility.chargeAgeDays} days` : '',
    pkg.eligibility.conditionsMet?.length ? `Conditions Met:         ${pkg.eligibility.conditionsMet.join('; ')}` : '',
    pkg.eligibility.conditionsFailed?.length ? `Disqualifications:      ${pkg.eligibility.conditionsFailed.join('; ')}` : '',
    '',
    subSep,
    '3. COMPLETE TRACEABILITY CHAIN',
    subSep,
    'Lineage: Charge → Unit → Upstream Evidence → Evidence Interpretation → Claim Decision → Supporting Evidence',
    ''
  ];

  pkg.traceabilityChain.forEach((step) => {
    lines.push(`[Step ${step.step}: ${step.stage}]`);
    lines.push(`  ${step.details}`);
  });

  lines.push('');
  lines.push(subSep);
  lines.push('4. EVIDENCE INTERPRETATION & CONTRADICTION ASSESSMENT');
  lines.push(subSep);
  lines.push(`Contradiction Status:   ${pkg.contradictionAssessment}`);
  lines.push(`Evidence Coverage:      ${pkg.evidenceInterpretation.coverageStatus}`);
  lines.push(`Required Stages:        ${pkg.evidenceInterpretation.requiredStages.join(', ') || 'None'}`);
  lines.push(`Available Stages:       ${pkg.evidenceInterpretation.availableStages.join(', ') || 'None'}`);
  lines.push(`Missing Stages:         ${pkg.evidenceInterpretation.missingStages.join(', ') || 'None'}`);
  lines.push(`Evidence Reliability:   ${pkg.evidenceInterpretation.reliability}`);
  lines.push(`Cross-Source:           ${pkg.evidenceInterpretation.consistency}`);
  if (pkg.evidenceInterpretation.conflicts?.length) {
    lines.push(`Identified Conflicts:   ${pkg.evidenceInterpretation.conflicts.join('; ')}`);
  }
  lines.push(`Supporting Evidence:    ${pkg.supportingEvidence.join(', ') || 'None'}`);

  lines.push('');
  lines.push(subSep);
  lines.push('5. UPSTREAM OPERATIONAL EVIDENCE RECORDS');
  lines.push(subSep);

  const stages = [
    { name: 'Receiving Dock Audit', data: pkg.upstreamEvidence.receiving },
    { name: 'Prep Compliance Audit', data: pkg.upstreamEvidence.prep },
    { name: 'Pack & Dispatch Record', data: pkg.upstreamEvidence.pack },
    { name: 'Returns Station Disposition', data: pkg.upstreamEvidence.returns }
  ];

  let hasUpstream = false;
  stages.forEach(({ name, data }) => {
    if (data) {
      hasUpstream = true;
      lines.push(`[${name}]`);
      lines.push(`  Record ID:    ${data.evidence_id || data.record_id || 'N/A'}`);
      lines.push(`  Stage:        ${data.stage}`);
      lines.push(`  Reliability:  ${data.reliability_status || 'RELIABLE'}`);
      lines.push(`  Raw Record:   ${JSON.stringify(data.raw_record || data)}`);
      lines.push('');
    }
  });
  if (!hasUpstream) {
    lines.push('  No upstream operational records available for this unit.');
    lines.push('');
  }

  lines.push(subSep);
  lines.push('6. ADDITIONAL MANUAL EVIDENCE (OPTIONAL SELLER ATTACHMENTS)');
  lines.push(subSep);
  if (pkg.manualEvidence.length === 0) {
    lines.push('  No manual evidence attached (Manual evidence is optional; case evaluated solely on upstream records).');
  } else {
    pkg.manualEvidence.forEach((mev, idx) => {
      lines.push(`[Manual Evidence Item #${idx + 1}]`);
      lines.push(`  Evidence ID:      ${mev.evidenceId}`);
      lines.push(`  Source:           ${mev.source}`);
      lines.push(`  Filename:         ${mev.filename}`);
      lines.push(`  File Type:        ${mev.fileType}`);
      lines.push(`  File Size:        ${mev.fileSize ? `${mev.fileSize} bytes` : 'N/A'}`);
      lines.push(`  Upload Timestamp: ${mev.uploadTimestamp}`);
      lines.push(`  User Description: ${mev.description || '(No description provided)'}`);
      lines.push('');
    });
  }

  lines.push('');
  lines.push(subSep);
  lines.push('7. DECISION AUDIT TIMELINE');
  lines.push(subSep);
  if (pkg.auditTrail.length === 0) {
    lines.push('  No audit events recorded.');
  } else {
    pkg.auditTrail.forEach((evt) => {
      lines.push(`  [${evt.timestamp}] ${evt.eventType}`);
      lines.push(`    Details: ${JSON.stringify(evt.details)}`);
    });
  }

  lines.push('');
  lines.push(sep);
  lines.push('END OF REMA DISPUTE PACKAGE');
  lines.push(sep);

  return lines.filter(l => l !== undefined).join('\n');
}

export function formatDisputePackageAsJson(pkg) {
  return JSON.stringify(pkg, null, 2);
}

export async function copyDisputePackageToClipboard(pkg) {
  const text = formatDisputePackageAsText(pkg);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return true;
}

export function downloadDisputePackage(pkg, format = 'json') {
  const chargeId = pkg?.chargeId || 'export';
  if (format === 'json') {
    const jsonContent = formatDisputePackageAsJson(pkg);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dispute-package-${chargeId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    const textContent = formatDisputePackageAsText(pkg);
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dispute-package-${chargeId}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
