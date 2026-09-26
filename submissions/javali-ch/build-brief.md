# REMA Build Brief

## Problem Decomposition
The Recovery Manager problem statement is divided into five operational boundaries:
1. **Ingestion & Normalization**: Ingesting messy CSV/JSON channel fee and reimbursement reports, validating formats, isolating tenants, and flagging malformed records.
2. **Charge-to-Unit Matching**: Linking charge records to specific physical inventory units (`UNIT-XXXX`) while detecting missing IDs and candidate ambiguities.
3. **Unit Evidence Graph Assembly**: Traversing operational events from Receiving, Prep, Pack, and Returns, applying explicit relevance filtering per charge type.
4. **Reliability & Consistency Engine**: Evaluating evidence completeness, timestamp order, photo references, and cross-source contradictions (e.g. Prep vs. Receiving).
5. **Charge-Specific Decision Policies**: Executing deterministic financial decision logic for inbound defect fees, weight-tier overcharges, lost inbound inventory, unreturned refunds, and warehouse damages.

## System Outputs
- Legally defensible claim packages with real dollar figures, supporting record IDs, and contradiction summaries.
- Human review queue items with specific actionable next steps.
- Immutable chronological audit trail tracing every decision from charge ingestion to claim assembly.
