# REMA — Recovery Manager
**Step 5 of 5 · Money Back**  
*Turn operational evidence into defensible recovery claims.*


## Table of Contents
1. [Problem Understanding](#1-problem-understanding)
2. [Solution Overview](#2-solution-overview)
3. [Setup Instructions](#3-setup-instructions)
4. [Usage Instructions](#4-usage-instructions)
5. [Assumptions & Limitations](#5-assumptions--limitations)

---

## 1. Problem Understanding

Amazon and major e-commerce fulfillment channels deduct fees, adjustments, and surcharges through automated warehouse detection systems. These include:
- **Inbound Defect Fees**: Charges levied when a fulfillment center flags prep non-compliance (e.g., missing or unsealed polybags, obscured suffocation warnings, uncovered original manufacturer barcodes, crooked FNSKU labels).
- **Fulfillment Fee Weight Tier Overcharges**: Mis-tiering caused by cubiscan calibration drift or package bulge that categorizes parcels into higher, more expensive fulfillment tiers.
- **Lost Inbound Inventory**: Shipments physically received at the fulfillment dock where individual units go missing before bin check-in. In channel reports, these inventory adjustments often report `$0.00` or omit financial valuation entirely, creating an *insufficient valuation* issue.
- **Customer Refunds for Unreturned Items**: Charges assessed against seller balances where the channel claims a customer failed to return merchandise, despite physical return receipt at the reverse logistics warehouse dock.
- **Damaged in Warehouse**: Inventory destroyed or damaged under channel custody without corresponding reimbursement credit.

### The Real-World Impact
Sellers routinely lose **1% to 3% of top-line revenue** to these automated deductions. Contesting deductions manually requires assembling photographic proof, dock check-in logs, and packaging audit records across disparate warehouse systems—a process that is slow, error-prone, and spreadsheet-bound.

### Why Naive & Generic Automated Systems Fail
1. **Blind Claiming (Account Suspension Risk)**: Generic bots submit blanket disputes without verifiable operational proof. E-commerce channel compliance teams penalize high-volume false claims by issuing account policy warnings or revoking reimbursement privileges.
2. **Discarding Missing or Unmatched Data**: Fragile parsers drop rows that contain syntax errors, missing unit IDs, or unfamiliar charge categories, permanently discarding recoverable dollars.
3. **Fabricating Claim Amounts**: Unconstrained models hallucinate estimated replacement costs or invented dispute amounts for adjustment lines that lack valuation, violating channel dispute terms that require exact billing reconciliation.
4. **Ignoring Cross-Source Inconsistencies**: Naive systems accept a clean prep log even when the receiving dock documented pre-existing carton damage, resulting in rejected claims and wasted dispute attempts.

---

## 2. Solution Overview

**REMA (Recovery Manager)** is an evidence-backed, deterministic financial recovery engine designed to transform raw operational proof into defensible dollar-value recovery claims. As **Step 5 of 5 ("Money Back")** in the commerce operations lifecycle (Receiving $\rightarrow$ Prep $\rightarrow$ Pack $\rightarrow$ Returns $\rightarrow$ Recovery), REMA reconciles channel fee reports with upstream physical warehouse records.

REMA compiles **defensible recovery claim packages** with supporting evidence references for seller review and dispute filing. It does not automatically submit disputes directly to Amazon or channel APIs, ensuring sellers retain full governance over their dispute processes.

> **Core Philosophy**  
> *"Other systems find matching records. Recovery Manager produces a defensible financial decision."*

```
CHANNEL CHARGE
      │
      ▼
CHARGE NORMALIZATION & VALIDATION
      │
      ▼
CHARGE → UNIT MATCHING (Exact, Secondary Keys, Ambiguity Guard)
      │
      ▼
UNIT EVIDENCE GRAPH (Receiving, Prep, Pack, Returns)
      │
      ▼
RELEVANT EVIDENCE SELECTION
      │
      ▼
EVIDENCE COVERAGE & RELIABILITY AUDIT
      │
      ▼
CROSS-SOURCE CONTRADICTION DETECTION
      │
      ▼
AUTHORITATIVE POLICY & ELIGIBILITY EVALUATION
      │
      ├───────────────────────┬────────────────────────┐
      ▼                       ▼                        ▼
    CLAIM                  NO CLAIM                UNCERTAIN
(Defensible Overcharge   (Charge Confirmed       (Missing Evidence,
 Backed by Evidence)       as Valid)              Conflict, Insufficient
      │                       │                   Valuation, or Unverified Policy)
      ▼                       ▼                        │
CLAIM BUILDER            AUDIT RECORD                  ▼
(Real Claimable Amount)  (Claimable Amount = $0)  HUMAN REVIEW QUEUE
      │                       │                   (Claimable Amount = $0)
      │                       │                        │
      │                       │            [Optional Manual Evidence &
      │                       │                 Re-Evaluation Loop]
      │                       │                        │
      └───────────────────────┴────────────────────────┘
                              │
                              ▼
                APPEND-ONLY AUDIT TRAIL (SQLite)
```

### Key Pillars of REMA

1. **Deterministic-First Decision Core**:
   - Zero hallucinated dispute policies, zero invented dollar amounts.
   - Core normalization, identifier resolution, reliability auditing, contradiction checks, and eligibility lookbacks are 100% deterministic code.
   - Designed to prioritize high claim precision and conservative uncertainty handling, achieving **100% Claim Precision (1.00)** on reference benchmarks.

2. **Total Charge Amount vs. Claimable Amount**:
   - **Total Charge Amount**: The original monetary amount reported by the channel for the charge line (e.g., $2.00 fee, $3.50 tier fee, or $0.00 adjustment). This amount is always preserved regardless of verdict.
   - **Claimable Amount**: The monetary amount REMA determines can be defensibly recovered based on operational evidence and verified policy rules (e.g., $2.00 for proven defect contradiction, $2.00 for weight tier delta over historical baseline, and $0.00 for `NO_CLAIM` or `UNCERTAIN` cases).

3. **Three Discrete Decision Verdicts**:
   - **`CLAIM`**: Operational evidence directly refutes the channel charge AND the charge satisfies all eligibility conditions under a verified policy source. Claimable amount is positive.
   - **`NO_CLAIM`**: Operational evidence corroborates the fee, OR the charge is definitively ineligible/expired under authoritative policy rules (`cannotClaim: true`). Claimable amount is $0.00.
   - **`UNCERTAIN`**: Operational evidence is inconclusive/missing, candidate unit matching is ambiguous, cross-source evidence is conflicted, the record has insufficient valuation, or the policy source is unverified/unavailable. Routes to the Human Review Queue; Claimable amount is $0.00.

4. **Upstream Evidence Graph**:
   - Unifies operational evidence across all four upstream operational managers:
     - **01 Receiving**: Arrival condition, carton crushing, moisture damage, carton unit counts.
     - **02 Prep**: Polybag seals, suffocation warnings, FNSKU barcode placement, expiry dates, handling marks, photo audits.
     - **03 Pack**: Merchant-fulfilled order contents, box verification, operator packing sign-offs.
     - **04 Returns**: Reverse logistics inspections, observed physical state, return dispositions.
   - Validates physical topology invariants, including mutual exclusivity between FBA Prep and MFN Pack paths.

5. **Categorical Reliability & Contradiction Detection**:
   - Assesses evidence quality into categorical states: `RELIABLE`, `DEGRADED`, `CONFLICTED`, or `INSUFFICIENT`.
   - Actively checks for cross-source discrepancies (e.g., Prep recorded a PASS, but Receiving logged water damage).

6. **Row-Level Tenancy Isolation (Engineering Rule 1)**:
   - All database tables enforce strict organization scoping via `org_id` (e.g., `org_demo_alpha` and `org_demo_bravo`).
   - Tenant repositories prevent cross-organization row leakage or guessable photo reference access.

7. **Fail-Open Architecture & Human Review Queue (Engineering Rules 3 & 4)**:
   - Malformed rows, unverified charge types, missing evidence, adjustments with insufficient valuation, and exceptions never crash the pipeline or drop records.
   - Non-claimable or inconclusive cases route to an actionable Human Review Queue with concrete suggested actions (e.g., *"Inspect prep photo audit"*, *"Apply SKU wholesale valuation schedule"*).
   - "Uncertain" is treated as a first-class, credible outcome.

8. **Authoritative Policy Grounding & Verified Sources (Engineering Rule 5)**:
   - Policies are grounded in official Amazon Seller Central documentation and enforce applicable policy-defined windows (such as the 90-day dispute window for inbound defects and weight tier remeasurement).
   - Automated claims are generated only for verified policy sources (`inbound_defect_fee`, `fulfilment_fee_weight_tier`). Charge types with unverified or unavailable policy sources (`lost_inbound`, `refund_issued_item_not_returned`, `damaged_in_warehouse`) fail open to `UNCERTAIN` rather than applying speculative rules.

9. **Optional Manual Evidence & Deterministic Re-Evaluation**:
   - Operators can attach optional supporting evidence (carrier proof of delivery, supplier invoices, packaging photos) to an enqueued review item.
   - Cases can be re-evaluated through the decision engine. REMA records the manual evidence and re-evaluation in the audit trail. In accordance with deterministic engine rules, `UNCERTAIN` cases remain `UNCERTAIN` unless the attached evidence satisfies deterministic policy conditions (no arbitrary automated promotions).

10. **Full Auditability & Traceability**:
    - An append-only chronological audit log records every lifecycle transition (`CHARGE_INGESTED`, `CHARGE_NORMALIZED`, `UNIT_MATCHED`, `EVIDENCE_RETRIEVED`, `DECISION_PRODUCED`, `CLAIM_CREATED`, `REVIEW_ENQUEUED`, `MANUAL_EVIDENCE_ATTACHED`, `EVIDENCE_DESCRIPTION_ADDED`, `CASE_REEVALUATED`, `DECISION_CHANGED`).

11. **Dedicated Financial Operations Console**:
    - Built with pure modular CSS (`client/css/`), semantic variables (`--rema-*`), and zero inline styles.
    - Delivers a focused, institutional financial operations aesthetic without decorative AI dashboard tropes.

### Benchmark Results on Evaluated Reference Datasets

Evaluated on the reference datasets (`data/fee_report_sample.csv` and `data/upstream/`):

| Evaluation Metric | `org_demo_alpha` | `org_demo_bravo` | Combined / Overall |
|---|---|---|---|
| **Total Charges Evaluated** | 40 | 21 | **61** |
| **Total Charge Amount** | $124.00 | $54.20 | **$178.20** |
| **Defensible Claims Recommended** | 13 | 3 | **16** |
| **Total Claimable Amount** | $14.80 | $3.60 | **$18.40** |
| **Correctly Supported Claims** | 13 | 3 | **16** |
| **Incorrectly Recommended Claims** | 0 | 0 | **0** |
| **Claim Precision (Benchmark)** | **100.0% (1.00)** | **100.0% (1.00)** | **100.0% (1.00)** |
| **Synthetic Edge Cases Benchmark** | 22 / 22 Passed | 22 / 22 Passed | **22 / 22 Passed (100.0%)** |
| **Average Decision Latency** | ~3.5 ms | ~3.7 ms | **~3.6 ms** |

*Note: 100% Claim Precision is a verified benchmark result on the evaluated reference and synthetic edge test suites, demonstrating system design and conservative uncertainty handling, rather than an unconstrained production guarantee.*

---

## 3. Setup Instructions

### Prerequisites
- **Node.js**: v20+ or v22+ (tested on Node.js v22.18.0 with native `node:sqlite` support).
- **npm**: v10+ (bundled with Node.js).
- **Git**: Modern git client.

### Step 1: Clone the Repository
```bash
git clone https://github.com/javali-ch/cube26-rcy-0013-javali-ch.git
cd cube26-rcy-0013-javali-ch
```

### Step 2: Install Dependencies
```bash
npm install
```
*Note: REMA relies on minimal production dependencies (`express`, `cors`, `dotenv`, `csv-parse`) and uses Node's native SQLite engine for zero external database configuration.*

### Step 3: Environment Configuration (Rule 6 Compliance)
No external API keys or secrets are required to run REMA. By default, the application runs on port `3000`. To customize the port, you can create a local `.env` file (which is git-ignored):
```bash
PORT=3000
```

### Step 4: Start the REMA Application
```bash
# Start server and serve web console
npm start

# Or run using development script
npm run dev
```
Once started, the server outputs:
```text
REMA - Recovery Manager server running on http://localhost:3000
```
Open **`http://localhost:3000`** in your web browser to access the REMA console.

### Step 5: Run the Automated Test Suites
REMA includes comprehensive test suites covering the end-to-end pipeline, multi-tenant row isolation, evaluation benchmarks, manual evidence handling, and decision re-evaluation:
```bash
# Run all test suites
npm test

# Run specific suites individually:
# 1. Pipeline, Batch Ingestion & Tenancy Isolation
node src/test/pipeline.test.js

# 2. Production Evaluation & 22 Synthetic Edge Cases Benchmark
node src/test/eval.test.js

# 3. Recovery Operations, Manual Evidence & Re-Evaluation
node src/test/recoveryOperations.test.js
```

---

## 4. Usage Instructions

### A. Web Console Walkthrough

The web application at `http://localhost:3000` offers an interactive financial operations interface:

1. **Organization Switcher (Multi-Tenancy)**:
   - Select between `org_demo_alpha` and `org_demo_bravo` in the top header.
   - The UI immediately re-queries and scopes all metrics, charges, claims, and reviews strictly to that organization.
2. **Execute Pipeline**:
   - Click the **"Run Pipeline"** button in the header to execute batch ingestion, unit matching, evidence graph construction, reliability auditing, and policy evaluation across all ingested charges.
3. **Three Canonical Scenarios**:
   - Quick-load buttons in the top navbar and KPI section demonstrate the three primary financial outcomes:

| Scenario | Charge ID | Type & Total Charge | Operational Finding | Decision Outcome & Claimable Amount |
|---|---|---|---|---|
| **Case 1: CLAIM** | `FEE-0014-1` | Inbound Defect Fee ($2.00) | Prep audit (`PRP-0014`) proves full compliance (sealed bag, warning, covered barcode, flat label). Receiving logs show zero defects. Operational proof contradicts charge. | **CLAIM**: Claimable Amount: **$2.00** with supporting evidence IDs attached. Total charge amount ($2.00) preserved. |
| **Case 2: NO CLAIM** | `FEE-0007-1` | Weight Tier Fee ($3.50) | Prep audit proves standard packaging for `SKU-CABLE-USBC`. Charged fee matches established SKU historical baseline. Operational proof supports billing. | **NO CLAIM**: Claimable Amount: **$0.00**. Total charge amount ($3.50) preserved as a valid fee. |
| **Case 3: UNCERTAIN** | `FEE-0035-1` | Inbound Defect Fee ($0.50) | Prep audit (`PRP-0035`) recorded `original_barcode_covered: uncertain`. Evidence is inconclusive; system declines to guess. | **UNCERTAIN**: Claimable Amount: **$0.00**. Total charge amount ($0.50) preserved. Routed to Review Queue (*"Inspect photo audit"*). |

4. **Claims View & Defensible Packages**:
   - Navigate to the **Claims** tab to view all compiled recovery claims.
   - Click any claim to inspect its full package: recoverable claimable dollar amount, original total charge amount, supporting operational record IDs, operator IDs, timestamps, and attached photos.
   - *Note*: Claim packages are compiled for seller dispute teams to review and export; REMA does not submit directly to external channel dispute APIs.
5. **Human Review Queue**:
   - Navigate to the **Review Queue** tab to view flagged items.
   - Filter by status (`PENDING`, `RESOLVED`).
   - Click a review item to open the interactive resolution drawer:
     - Review the identified `issue_type` (e.g., `MISSING_EVIDENCE`, `CONFLICTING_EVIDENCE`, `ZERO_VALUATION` for insufficient valuation) and system `suggested_action`.
     - Attach optional manual evidence (invoices, carrier PODs, packaging photos).
     - Enter resolution notes and mark the item `RESOLVED`.
     - Re-evaluate the case through the deterministic engine to verify whether newly provided data resolves uncertainty under policy rules.
6. **Synthetic Edge Cases Benchmark**:
   - Navigate to the **Synthetic Evaluation** tab or trigger `GET /api/evaluation/synthetic` to execute the 22 edge cases and view real-time pass/fail telemetries.

---

### B. REST API Reference

All endpoints support organization scoping via the `x-tenant-id` request header or `?org_id=` query parameter (defaults to `org_demo_alpha`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/metrics` | Retrieve recovery KPIs (Total Amount Reviewed, Claimable Amount, Benchmark Precision, Review Rate). |
| `POST` | `/api/process/run` | Trigger batch execution across all ingested charges for the active tenant. |
| `POST` | `/api/charges/ingest` | Ingest raw fee/adjustment report lines with automatic normalization. |
| `GET` | `/api/charges` | List normalized charges with optional `?charge_type=` and `?unit_id=` filters. |
| `GET` | `/api/charges/:id` | Retrieve normalized charge record and raw source payload. |
| `GET` | `/api/charges/:id/evidence` | Fetch the Unit Evidence Graph, relevant stage subset, and attached manual records. |
| `GET` | `/api/charges/:id/decision` | Retrieve the deterministic decision, coverage, and contradiction status. |
| `GET` | `/api/claims` | List all compiled, defensible recovery claims. |
| `GET` | `/api/claims/:id` | Fetch full claim package with supporting operational record IDs and justifications. |
| `GET` | `/api/reviews` | List Human Review Queue items with optional `?status=PENDING` filter. |
| `GET` | `/api/reviews/:id` | Retrieve specific review item details and audit context. |
| `POST` | `/api/reviews/:id/resolve` | Resolve a review item with operator notes and resolved-by metadata. |
| `POST` | `/api/charges/:id/evidence/manual` | Attach seller-provided manual evidence (PDF, invoice, image) to a charge. |
| `POST` | `/api/charges/:id/re-evaluate` | Re-evaluate a charge through the deterministic pipeline after evidence updates. |
| `GET` | `/api/charges/:id/audit` | Retrieve complete chronological audit trail for a charge. |
| `GET` | `/api/audit/:decisionId` | Trace chronological lifecycle event trail for a decision. |
| `GET` | `/api/evaluation/synthetic` | Execute the 22 synthetic edge benchmark scenarios and return metrics. |

#### Example cURL Requests

**1. Trigger Batch Processing for Tenant Bravo:**
```bash
curl -X POST http://localhost:3000/api/process/run \
  -H "x-tenant-id: org_demo_bravo"
```

**2. Query Defensible Claims for Tenant Alpha:**
```bash
curl -X GET http://localhost:3000/api/claims \
  -H "x-tenant-id: org_demo_alpha"
```

**3. Attach Manual Evidence to an Uncertain Charge:**
```bash
curl -X POST http://localhost:3000/api/charges/FEE-0035-1/evidence/manual \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: org_demo_alpha" \
  -d '{
    "filename": "vendor_bol_scan.pdf",
    "file_type": "application/pdf",
    "description": "Signed carrier bill of lading confirming manufacturer barcode covered at supplier facility."
  }'
```

**4. Re-evaluate Case After Manual Evidence Attachment:**
```bash
curl -X POST http://localhost:3000/api/charges/FEE-0035-1/re-evaluate \
  -H "x-tenant-id: org_demo_alpha"
```

---

## 5. Assumptions & Limitations

1. **Adjustments with Insufficient Valuation Require Valuation Schedules**:
   Channel inventory adjustment reports frequently log missing units with `$0.00` or absent valuation. REMA preserves the reported Total Charge Amount and identifies that the record has *insufficient valuation* to establish a claimable recovery amount without external pricing data. In accordance with Engineering Rule 4, REMA routes the record to the Human Review Queue (`issue_type: ZERO_VALUATION`) prompting the operator to supply an authoritative valuation schedule before a claim can be compiled.
2. **Channel Policy Coverage**:
   REMA ships with out-of-the-box policies for five canonical Amazon FBA categories:
   - Inbound Defect Fees (`inbound_defect_fee`)
   - Weight Tier Overcharges (`fulfilment_fee_weight_tier`)
   - Lost Inbound Inventory (`lost_inbound`)
   - Customer Refund for Unreturned Items (`refund_issued_item_not_returned`)
   - Warehouse Damaged Goods (`damaged_in_warehouse`)
   Extending coverage to other regional surcharges (e.g., aged inventory surcharges, low-inventory fees) requires registering a corresponding policy class in `src/core/policies/policyRegistry.js`.
3. **Verified Policy Sources & Fail-Open Behavior**:
   In strict adherence to Engineering Rule 5, REMA does not permit models to invent dispute rules or infer dispute criteria from sample data. Automated claims are generated only for verified policy sources. When an authoritative policy source is unverified or offline (as with current unverified references for lost inbound or customer returns), REMA safely fails open to `UNCERTAIN`.
4. **Applicable Policy-Defined Windows**:
   Eligibility lookback periods are governed by specific published policy terms (such as the 90-day dispute window for inbound defects and weight tier remeasurement) rather than a universal timeline. Where policies define mandatory waiting periods (e.g., customer return transit windows), premature disputes are held as `UNCERTAIN`.
5. **No Direct Channel Submission**:
   REMA prepares defensible claim packages with attached operational proof and audit lineage. It does not provide direct, automated submission into Amazon Seller Central or channel dispute APIs; dispute submission remains under seller operational control.
6. **FBA vs. MFN Physical Routing Invariant**:
   The system assumes an inventory unit follows either an FBA inbound flow (Receiving $\rightarrow$ Prep $\rightarrow$ Channel) or a Merchant-Fulfilled flow (Receiving $\rightarrow$ Pack $\rightarrow$ Buyer). Units possessing both Prep and Pack records are treated as physical topology anomalies and flagged as `CONFLICTED`.
7. **Single-Currency Operational Scope**:
   Current schema and valuation fields operate in USD. Cross-border multi-currency foreign exchange conversions require upstream normalization before ingestion.
8. **Upstream Evidence Dependency**:
   Claim defensibility depends on the presence of structured operational records from upstream managers (Receiving, Prep, Pack, Returns). If upstream stations fail to record inspection logs or photo references, REMA cannot synthesize proof and properly routes charges to `UNCERTAIN`.

---

*Cube Buildathon · Round 2 · Recovery Manager (`cube26-rcy-0013-javali-ch`)*
