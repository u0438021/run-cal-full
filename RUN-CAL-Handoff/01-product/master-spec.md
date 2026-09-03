# Master Product Specification

## Product

RUN|CAL is a responsive web/mobile running analytics and coaching workspace for athletes, coaches, workspace administrators, and a narrowly privileged platform operator. Its core loop is:

`Profile → Goal/Race → Plan → Recovery → Run → FIT Import → Activity Analysis → Session RPE/Log → Load → Recovery Response → Explainable AI Proposal → Human Approval → Updated Plan`

## Principles

1. Running first; avoid turning the product into a social network, medical system, full nutrition tracker, or generic team ERP.
2. Evidence before recommendation. Missing data is not a negative value.
3. Human-controlled change. AI proposes and explains; athlete/coach approves, modifies, or rejects.
4. Historical correctness. Time-varying baselines use effective dates and are never overwritten retroactively.
5. Tenant isolation and least privilege are enforced in storage and service authorization, not only in UI.
6. Source fidelity. Original FIT files, parser version, provenance, and raw decoded developer fields remain available for reprocessing.

## Personas

- Athlete: own profile, recovery, activities, logs, goals, messages, and settings.
- Coach: assigned athletes only; review, plan, comment, message, and approve/modify AI proposals.
- Workspace Admin: membership, assignments, workspace configuration, and all workspace athletes as granted.
- Platform Owner/Operator: operational metadata by default; athlete content only through explicit, audited support access.

## Functional domains

Authentication; athlete profile; workspace membership; activities/FIT; Stryd/power; training load; recovery/readiness; testing/protocols; logs; races/calendar/plans; coach dashboard; contextual messaging; settings/connections; AI reviews; help/setup/version.

## Definition of done for a requirement slice

- Requirement and release tier approved.
- Access rules and tenant boundaries defined.
- Data provenance, effective-date behavior, missing-data behavior, and audit events defined.
- Responsive and empty/error states specified.
- Tests cover authorization and historical correctness.
- Any formula cites an approved source and protocol version; otherwise the field remains unavailable/feature-flagged.

