# REMA One-Pager
**Product**: Recovery Manager (Step 5 of 5 · Money Back)  
**Tagline**: *Turn operational evidence into defensible recovery claims.*  
**Primary Metric**: Claim Precision (100%)

---

## Executive Summary
REMA bridges the operational evidence gap between warehouse handling stations and channel financial reports. By linking Receiving, Prep, Pack, and Returns evidence to channel fee lines, REMA compiles disputable claims with complete photographic and timestamp proof.

```text
Channel Fee Ingested ──▶ Matched Unit ──▶ Evidence Graph ──▶ Contradiction Detection ──▶ Defensible Claim
```

## Performance & Metrics Table

| Metric | Target | Actual (Alpha) | Actual (Bravo) | Benchmark Suite |
|---|---|---|---|---|
| **Claim Precision** | > 95% | **100.0%** | **100.0%** | **100.0%** (13/13) |
| **False Claims Recommended** | 0 | **0** | **0** | **0** |
| **Missed Recoverable Claims** | 0 | **0** | **0** | **0** |
| **Review Rate (Fail-Open)** | 20% - 35% | **27.5%** | **33.3%** | **38.5%** |
| **Decision Processing Latency** | < 20 ms | **3.48 ms** | **3.67 ms** | **0.85 ms** |
| **Multi-Tenant Leakage** | 0 rows | **0 rows** | **0 rows** | **0 rows** |

## Kill Condition
> **Kill Condition**: If channel dispute acceptance rate for REMA-compiled claims falls below **95%** due to evidence discrepancies or lack of verifiable documentation, halt automated claim compilation and route 100% of cases to manual review.
