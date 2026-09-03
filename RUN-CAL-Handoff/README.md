# RUN|CAL Project Handoff Package

Version: 1.0 (requirements baseline, 2026-09-02)

This package is the implementation source of truth for the RUN|CAL responsive running analytics product. It consolidates the approved Page 1–15 product scope, architecture, data model, privacy rules, analytics guardrails, design system, delivery sequence, and reusable approval-before-code skill.

## Start here

1. Read `01-product/master-spec.md` and `01-product/locked-decisions.md`.
2. Read `02-pages/page-01-15.md` for the page contract.
3. Read `03-architecture/` before changing persistence, tenancy, FIT processing, or permissions.
4. Read `04-analytics/` before implementing calculations or AI behavior.
5. Install or copy `07-skills/run-cal-approval-workflow/` into the target agent's skills directory.
6. Follow `06-delivery/development-sequence.md`; approval is required before implementation of each page or requirement slice.

## Non-negotiable guardrails

- Running-first product; unsupported sports are rejected clearly.
- Every tenant-owned record is scoped by `workspace_id`; every athlete-owned record also carries `athlete_id`.
- Original FIT bytes are retained privately and immutably for audit/reprocessing.
- Stryd UI is conditional. Missing metrics are unavailable, never zero.
- Historical analysis uses the CP, weight, phase, threshold, and zone configuration effective on the activity date.
- AI recommendations require sufficient evidence, show why, preserve missing-data states, and never silently change the calendar.
- LTP, LTHR, hydration/sweat-rate, primary load, HR-load, power-load, zone percentages, readiness labels, and risk thresholds remain unresolved until their original source and formula are verified and explicitly approved.

## Package map

```text
01-product/       vision, scope, locked decisions, release matrix
02-pages/         Page 1–15 functional specifications
03-architecture/  system, data, tenancy, permissions, FIT, security
04-analytics/     testing protocols, load/recovery, AI evidence rules
05-design/        design system and responsive behavior
06-delivery/      development sequence and technical manuals
07-skills/        reusable approval-before-code skill
08-prompts/       source-verification prompt
```

## Status vocabulary

- **LOCKED**: approved requirement; preserve unless the owner explicitly reopens it.
- **PROPOSED**: documented recommendation; requires page/slice approval before code.
- **BLOCKED-SOURCE**: must not be implemented until the original reference source and exact formula are supplied, verified, versioned, and approved.
- **LATER**: intentionally outside MVP.

