# REMA — Recovery Manager
**Step 5 of 5 · Money Back**  
*Turn operational evidence into defensible recovery claims.*

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Claim Precision](https://img.shields.io/badge/claim%20precision-100%25-success.svg)]()
[![Multi--Tenancy](https://img.shields.io/badge/tenancy-isolated%20RLS-blue.svg)]()
[![Evaluation](https://img.shields.io/badge/synthetic%20benchmark-13%2F13%20passed-brightgreen.svg)]()

---

## 1. Problem Statement

Amazon and major e-commerce fulfillment channels frequently charge inbound defect fees, mis-weigh parcels into elevated fulfillment tiers, lose units in warehouse networks, and withhold reimbursements for unreturned items. Sellers lose an estimated 1% to 3% of top-line revenue because contesting these deductions requires hard operational proof across multiple warehouse handling points that sellers simply cannot aggregate.

Historically, this has been handled through manual spreadsheet joins or third-party recovery agencies taking a percentage cut. Naive automated systems fail because they either:
1. **Blindly file claims without proof**, triggering account suspensions from channel compliance teams.
2. **Treat missing data as proof of failure**, discarding recoverable dollars.
3. **Fabricate estimated claim amounts**, violating channel dispute criteria.

---

## 2. The Solution: REMA

**REMA** is an evidence-driven financial recovery system that bridges channel reports and upstream warehouse records. It ingests fee and reimbursement reports, matches charges to inventory units, traverses an integrated operational evidence graph (Receiving $\rightarrow$ Prep $\rightarrow$ Pack $\rightarrow$ Returns), assesses evidence reliability, detects contradictions between operational facts and channel charges, and produces **defensible dollar-value claims** backed by complete audit traceability.

### Product Philosophy
> *"Other systems find matching records. Recovery Manager produces a defensible financial decision."*

```text
CHANNEL CHARGE
      ↓
CHARGE PARSING / NORMALIZATION
      ↓
CHARGE → UNIT MATCHING
      ↓
UNIT EVIDENCE GRAPH (Receiving, Prep, Pack, Returns)
      ↓
RELEVANT EVIDENCE SELECTION
      ↓
EVIDENCE COVERAGE & RELIABILITY AUDIT
      ↓
CONTRADICTION DETECTION
      ↓
CHARGE-SPECIFIC DECISION POLICY
      ↓
CLAIM / NO CLAIM / UNCERTAIN
      ↓
CLAIM BUILDER OR HUMAN REVIEW QUEUE
      ↓
AUDIT TRAIL
```

---

## 3. Core Architecture & Features

1. **Deterministic-First Core**: Zero hallucinated rules, zero invented dollar amounts. Core normalization, unit matching, coverage calculation, reliability checks, and policy evaluations are 100% deterministic.
2. **Row-Level Tenancy Isolation**: In accordance with Engineering Rule 1, all data is partitioned and enforced by `org_id` (`org_demo_alpha` and `org_demo_bravo`). No cross-tenant data leakage is possible.
3. **Evidence Graph**: Preserves raw source records and links units across all 4 upstream managers:
   - **Receiving**: Condition on arrival, carton damage, unit damage, quality flags, carton counts.
   - **Prep**: Polybag seal, suffocation warning, FNSKU label placement, barcode coverage, expiry date, handling marks.
   - **Pack**: Merchant-fulfilled order contents, box verification, operator verdict.
   - **Returns**: Physical return inspection, parts missing, observed state, disposition.
4. **Categorical Reliability & Conflict Detection**: Evaluates whether records are `RELIABLE`, `DEGRADED`, `CONFLICTED`, or `INSUFFICIENT`. Identifies cross-source discrepancies (e.g. Prep says PASS, but Receiving flagged water damage).
5. **Fail-Open Architecture & Human Review Queue**: Conforms to Engineering Rule 3 & Rule 4. Inconclusive records, missing evidence, zero-valuation lines, and system failures route to an actionable Human Review Queue with concrete suggested actions.
6. **Dedicated CSS Architecture & Financial Operations Aesthetic**: Strict separation of concerns with zero styles in JS/JSX. A modular CSS design system (`client/css/`) utilizing `--rema-*` custom properties (`--rema-primary`, `--rema-primary-dark`, `--rema-primary-light`, `--rema-background`, `--rema-surface`, `--rema-border`, `--rema-text`, `--rema-muted`), generous spacing, subtle shadows, minimal borders, clean typography, responsive layouts (desktop, tablet, mobile), and a focused financial operations aesthetic without decorative gimmicks or AI dashboard tropes.

---

## 4. Setup & Quickstart

### Prerequisites
- Node.js v20+ or v22+ (tested on Node v22.18.0 with native SQLite support)
- npm v10+

### Installation & Launch
```bash
# 1. Clone your fork
git clone https://github.com/javali-ch/cube26-rcy-0013-javali-ch.git
cd cube26-rcy-0013-javali-ch

# 2. Install dependencies
npm install

# 3. Start REMA Server & UI
node src/api/server.js
```
Open **`http://localhost:3000`** in your browser to access the REMA application.

### Running Test Suites
```bash
# Run End-to-End Pipeline & Tenancy Isolation Tests
node src/test/pipeline.test.js

# Run Production & Synthetic Evaluation Benchmark
node src/test/eval.test.js
```

---

## 5. Three Canonical Demo Scenarios

The REMA interface provides quick-access buttons in the top navbar and dashboard to demonstrate the 3 fundamental financial outcomes:

| Scenario | Charge ID | Charge Type & Amount | Operational Evidence Finding | System Decision |
|---|---|---|---|---|
| **Case 1: CLAIM** | `FEE-0014-1` | Inbound Defect Fee ($2.00) | Prep audit (`PRP-0014`) proves 100% compliance (polybag sealed, warning legible, barcode covered, label flat). Receiving reports no defects. Evidence contradicts charge. | **CLAIM ($2.00)** with supporting evidence IDs attached. |
| **Case 2: NO CLAIM** | `FEE-0007-1` | Weight Tier Fee ($3.50) | Prep logs prove standard packaging for `SKU-CABLE-USBC`, and charged fee ($3.50) conforms exactly to the established baseline tier. Evidence supports billing. | **NO CLAIM** ($0.00). Valid channel fee. |
| **Case 3: UNCERTAIN** | `FEE-0035-1` | Inbound Defect Fee ($0.50) | Prep audit (`PRP-0035`) recorded `original_barcode_covered: uncertain`. Evidence is inconclusive; system declines to guess. | **UNCERTAIN** ($0.00). Routed to Review Queue with suggested action: *"Inspect photo audit"*. |

---

## 6. REST API Reference

All endpoints support the `x-tenant-id` header or `?org_id=` query parameter.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/metrics` | Returns financial KPIs ($ Amount Reviewed, $ Claimable, Claim Precision, Review Rate). |
| `POST` | `/api/charges/ingest` | Ingests an array of raw fee/adjustment report lines. |
| `GET` | `/api/charges` | Lists charges for the tenant with optional `charge_type` or `unit_id` filters. |
| `GET` | `/api/charges/:id` | Returns a single normalized charge record. |
| `GET` | `/api/charges/:id/evidence` | Returns the complete Unit Evidence Graph and relevant evidence subset. |
| `GET` | `/api/charges/:id/decision` | Returns the deterministic decision, coverage, and contradiction status. |
| `GET` | `/api/claims` | Lists all compiled, defensible recovery claims. |
| `GET` | `/api/claims/:id` | Returns full claim package with supporting record IDs and summaries. |
| `GET` | `/api/reviews` | Lists all pending or resolved human review items. |
| `GET` | `/api/reviews/:id` | Returns specific review item details. |
| `POST` | `/api/reviews/:id/resolve` | Resolves a review item with operator notes. |
| `GET` | `/api/audit/:decisionId` | Returns the complete chronological lifecycle event trail. |
| `POST` | `/api/process/run` | Triggers batch pipeline execution across all ingested charges. |
| `GET` | `/api/evaluation/synthetic` | Executes the 13 synthetic edge test cases and returns pass/fail metrics. |

---

## 7. Limitations & Future Work

1. **Zero-Valuation Channel Adjustments**: Inventory adjustment reports that log $0.00 require attaching an authoritative catalog valuation schedule before converting into an active claim.
2. **Channel Policy Extensibility**: Adding new custom fee categories requires defining a policy in `src/core/policies/` implementing required stage selection and contradiction rules.

---

*Cube Buildathon · Round 2 · Recovery Manager (`cube26-rcy-0013-javali-ch`)*
