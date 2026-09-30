# REMA — Recovery Manager: Evaluation Report
**Precision-First Financial Recovery Verification**  
*Step 5 of 5 · Money Back*

---

## 1. Evaluation Methodology

Recovery Manager evaluation differs fundamentally from vision-based agents. Vision agents measure pixel or bounding-box accuracy; Recovery Manager measures **financial decision correctness and claim defensibility**.

Submitting an invalid claim to an e-commerce channel (e.g. Amazon Seller Support or Amazon Dispute APIs) risks severe account health penalties, audit flags, and loss of reimbursement privileges. Therefore, REMA optimizes strictly for:

$$\text{Claim Precision} = \frac{\text{Correctly Supported Claims}}{\text{All Claims Recommended}}$$

A precision of **100% (1.00)** is the primary operational benchmark.

**Financial Amount Definitions**

- **Total Charge Amount**: The original monetary amount reported by the channel for the evaluated charge.
- **Claimable Amount**: The monetary amount REMA determines can be defensibly recovered.
- The Total Charge Amount is preserved regardless of whether the verdict is `CLAIM`, `NO_CLAIM`, or `UNCERTAIN`.

---

## 2. Synthetic Reference Dataset Evaluation Results

Evaluated on the official synthetic reference datasets (`data/fee_report_sample.csv` and `data/upstream/`):

### Results Breakdown by Tenant

| Metric | `org_demo_alpha` | `org_demo_bravo` | Combined / Overall |
|---|---|---|---|
| **Total Charges Evaluated** | 40 | 21 | **61** |
| **TTotal Charge Amount** | $124.00 | $54.20 | **$178.20** |
| **Defensible Claims Recommended** | 13 | 3 | **16** |
| **Total Claimable Amount** | $14.80 | $3.60 | **$18.40** |
| **Correctly Supported Claims** | 13 | 3 | **16** |
| **Incorrectly Recommended Claims** | 0 | 0 | **0** |
| **Missed Recoverable Claims** | 0 | 0 | **0** |
| **Claim Precision** | **100.0% (1.00)** | **100.0% (1.00)** | **100.0% (1.00)** |
| **No-Claim Verdicts** | 16 | 11 | **27** |
| **Uncertain / Review Cases Flagged** | 11 | 7 | **18** |
| **Review Rate (Fail-Open)** | 27.5% | 33.3% | **29.5%** |
| **Average Decision Latency** | 3.48 ms | 3.67 ms | **3.55 ms** |
| **Runtime Failures / Dropped Rows** | 0 | 0 | **0** |

```mermaid
pie title Decision Verdict Distribution (61 Total Charges)
    "Supported Claims ($18.40)" : 16
    "Valid Charges / No Claim" : 27
    "Uncertain / Held for Review" : 18
```

---

## 3. Synthetic Ground Truth Benchmark (22 Edge Cases)

To stress-test all boundary conditions, error handlers, and failure modes, REMA includes a dedicated synthetic test suite (`EvaluationEngine.runSyntheticBenchmark()`). 

> **Transparency Note**: These 22 test cases are generated synthetically to benchmark edge conditions; they are strictly labeled as synthetic benchmarks.

| Test Case ID | Description / Edge Case Scenario | Expected Verdict | Actual Verdict | Status | Defensible Rationale / Failure Mode Handled |
|---|---|---|---|---|---|
| **TC-1** | Valid recoverable claim: Inbound defect fee with Prep PASS | `CLAIM` | `CLAIM` | **PASS** | Prep audit verifies all 6 compliance points. Fee contradicted. |
| **TC-2** | Valid non-recoverable charge: Prep audit FAIL | `NO_CLAIM` | `NO_CLAIM` | **PASS** | Prep audit noted unsealed polybag. Charge supported. |
| **TC-3** | Missing evidence: Charge with no prep audit record | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Fails open: missing prep evidence cannot be assumed a claim or fail. |
| **TC-4** | Conflicting evidence: Prep PASS but Receiving noted obvious defect | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Upstream ambiguity prevents defensible claim. Routed to review. |
| **TC-5** | Invalid unit ID syntax (`INVALID_ID_999`) | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Syntax validation prevents fabricating matches. |
| **TC-6** | Ambiguous unit match: Missing unit_id with multiple candidate FNSKUs | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Ambiguity flags trigger review rather than guessing candidate. |
| **TC-7** | Malformed charge: Non-numeric amount & missing line_id | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Preserves raw charge; enqueues review for data correction. |
| **TC-8** | Unsupported charge type: Unknown vendor assessment | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Prevents arbitrary rule application to unknown charge categories. |
| **TC-9** | Reliable PASS against weight tier overcharge ($5.50 vs $3.50 baseline) | `CLAIM` | `CLAIM` | **PASS** | Recovers $2.00 overcharge backed by standard prep packaging. |
| **TC-10** | Reliable charge billed at baseline tier ($3.50) | `NO_CLAIM` | `NO_CLAIM` | **PASS** | Confirms charge conforms to established SKU baseline. |
| **TC-11** | Cross-source inconsistency: Chronological inversion | `CLAIM` | `CLAIM` | **PASS** | Warning captured in audit trail; valid prep evidence preserved. |
| **TC-12** | Zero-valuation lost inventory with verified dock check-in | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Disallows fabricating financial figures; prompts valuation schedule. |
| **TC-13** | System fail-open: Runtime exception simulation | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Preserves record in PENDING state; records error stack trace. |
| **TC-14** | Definitely expired eligibility: Prep PASS outside 90-day window | `NO_CLAIM` | `NO_CLAIM` | **PASS** | Filing deadline expired under authoritative Amazon policy (`cannotClaim=true`). |
| **TC-15** | Missing authoritative rule: Unregistered freight concession | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Routes to human review to prevent applying non-authoritative rules. |
| **TC-16** | Ambiguous unit match: Multiple candidate units for single FNSKU | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Ambiguous secondary identifier match halts automated claiming. |
| **TC-17** | Ambiguous SKU match: Multiple candidate units for single SKU | `UNCERTAIN` | `UNCERTAIN` | **PASS** | SKU mapping ambiguity halts automated claiming. |
| **TC-18** | Definitely eligible: Prep PASS within 90-day window | `CLAIM` | `CLAIM` | **PASS** | Evidence contradicts charge AND authoritative eligibility is satisfied. |
| **TC-19** | Definitely ineligible: Disqualified seller account | `NO_CLAIM` | `NO_CLAIM` | **PASS** | Ineligibility disqualifies claim from recovery (`cannotClaim=true`). |
| **TC-20** | Unavailable policy source: Authoritative policy offline | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Fails open to review when authoritative policy endpoint is unreachable. |
| **TC-21** | Missing eligibility date: Charge posted date is missing | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Cannot establish filing deadline window without authoritative date. |
| **TC-22** | Conflicting dates: Chronological contradiction between charge and milestones | `UNCERTAIN` | `UNCERTAIN` | **PASS** | Contradictory event timestamps route to review for timeline validation. |

**Synthetic Benchmark Score: 22 / 22 Passed (100.0%)**

---

## 4. Key Failure Modes Identified & Mitigated

### 1. The Zero-Valuation Trap

- **Risk**: Some channel adjustments may have $0.00 or insufficient valuation for determining the recoverable claim amount.
- **Naive Agent Failure**: Fabricating an estimated replacement value or silently discarding the charge.
- **REMA Solution**: Preserves the original Total Charge Amount and routes cases without sufficient valuation to `UNCERTAIN / REVIEW` rather than inventing a claimable amount. When appropriate, the operator is prompted to provide the required valuation.

### 2. Upstream Cross-Source Contradictions
- **Risk**: Prep Manager records a clean pass, but Receiving dock recorded `carton_damage: crushing` or `unit_damage: water`.
- **Naive Agent Failure**: Silently picking Prep Manager's PASS and filing a claim that gets rejected by Amazon inspectors who observe water damage.
- **REMA Solution**: Evaluates cross-source consistency. High-severity conflicts route to `UNCERTAIN / REVIEW` with both evidence IDs attached.

### 3. Ambiguous Candidate Mapping
- **Risk**: Charge record lacks `unit_id` and secondary keys map to multiple candidates.
- **REMA Solution**: Never guesses. Transitions to `AMBIGUOUS` matching status and enqueues human review with candidate listings.

---

## 5. System Limitations

1. **Valuation Schedules**: REMA preserves the original Total Charge Amount from the channel report. When a charge lacks sufficient valuation to determine the Claimable Amount, an operator must supply the required replacement/item valuation.
2. **Channel Policy Evolution**: Current charge policies reflect standard Amazon FBA schedules. New custom surcharge types require registering a corresponding policy class in `src/core/policies/`.
