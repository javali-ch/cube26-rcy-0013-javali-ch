# Engineering Constraints & Ground Rules (CLAUDE.md)

## Durable Constraints
1. **Never Invent Financial Values**: Dollar figures must come directly from verified channel charge lines or established SKU baselines in the tenant database. Never hallucinate amounts.
2. **Deterministic-First Core**: Ingestion, normalization, unit matching, evidence graph construction, coverage calculation, reliability audits, and policy decisions must execute deterministically without unconstrained LLM hallucinations.
3. **Tenancy Isolation Before Any Feature**: Every query must be scoped to `org_id`. Cross-tenant row access is strictly prohibited.
4. **Fail-Open Architecture**: Any runtime failure, ambiguous match, or missing evidence record must transition to `UNCERTAIN` and route to the Human Review Queue. Never silently drop rows or return a default `NO_CLAIM`.
5. **No Blind Trust in Upstream Records**: Upstream records must be checked for structural completeness, photo references, timestamp validity, and cross-source consistency. Conflicting records must be surfaced explicitly.

## Forbidden Language & Anti-Patterns
- Never claim "99.9% AI accuracy" without an audited breakdown of false positives and false negatives.
- Never use terms like "blockchain-backed" or "tamper-proof" without physical cryptographic ledger implementations.
- Never treat `UNCERTAIN` as a low-confidence pass or failure; it is an authoritative categorical verdict.

## Frontend & Styling Architecture Rules
1. **Dedicated CSS Architecture**: Do not put styling directly inside JavaScript or JSX files. All styling must live in dedicated modular CSS files in `client/css/`.
2. **Design System Custom Properties**: All colors, surfaces, borders, and geometry must reference `--rema-*` CSS variables (`--rema-primary`, `--rema-primary-dark`, `--rema-primary-light`, `--rema-background`, `--rema-surface`, `--rema-border`, `--rema-text`, `--rema-muted`).
3. **No Decorative Tropes**: Avoid excessive gradients, heavy animations, glassmorphism, or decorative AI dashboard elements. The UI must feel like a serious financial recovery/operations platform with generous spacing, subtle shadows, minimal borders, and clean typography.
4. **Responsive Breakpoints**: Provide dedicated responsive layouts for desktop, tablet (<960px), and mobile (<640px).

