---
name: run-cal-approval-workflow
description: Plan or implement RUN|CAL product pages and analytics while preserving locked requirements, tenant isolation, effective-dated history, source verification, and explicit approval before code.
---

# RUN|CAL Approval Workflow

Use this skill for RUN|CAL planning, page design, architecture changes, data/analytics work, or implementation.

## Load the right references

Treat the handoff package root as the source of truth. Always read:

- `01-product/locked-decisions.md`
- the relevant section of `02-pages/page-01-15.md`

Also read the relevant architecture/analytics file for persistence, FIT, permissions, formulas, recovery, or AI work.

## Before code or schema changes

Present a compact requirement slice containing objective, user flow, in/out of scope, release tier, roles/permissions, data/effective-date behavior, missing/error states, dependencies, tests, and unresolved decisions. Ask for explicit approval of that slice. Do not code until approved.

Approval applies only to the presented slice. A material scope/formula/permission change requires renewed approval.

## Formula gate

Search `01-product/locked-decisions.md` and `04-analytics/`. If a calculation is `BLOCKED-SOURCE`, stop implementation of that calculation and use `08-prompts/source-verification.md`. Require the original source, exact version/page/section, units, population/context, edge cases and explicit owner approval. Never fill gaps from memory or invent percentages/thresholds. A feature may ship with manual values or “Unavailable” if the blocked calculation is safely isolated.

## Implementation invariants

- Scope all tenant data by `workspace_id`, athlete data by `athlete_id`, and authorize server-side.
- Keep original FIT immutable with checksum/parser provenance.
- Use configurations effective on the activity date; append history rather than overwrite.
- Missing metrics are unavailable, not zero.
- AI shows evidence and proposes only; no automatic calendar/CP/threshold mutation.
- Preserve existing user changes and avoid unrelated refactors.

## Verification and handoff

Run focused tests for the approved slice, including cross-tenant denial and historical-date cases when relevant. Report changed files, behavior, tests, remaining blocked items and the next slice needing approval.

