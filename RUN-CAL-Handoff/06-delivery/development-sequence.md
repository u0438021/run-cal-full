# Recommended Development Sequence

Each slice follows: **Present requirement/page → resolve open decisions → explicit approval → implement → verify → demo/acceptance**. Approval of this documentation does not authorize all code automatically.

1. Foundations: workspace tenancy, identity, roles, audit, design tokens, shared contracts.
2. Page 1 production access plus Page 2 profile and workspace membership.
3. Effective-dated athlete context: weight, objective/phase, manual CP/threshold records and zone model container (no blocked formulas).
4. FIT object storage/import job/parser provenance; Page 5 manual upload.
5. Page 6 activity detail and activity comments/RPE.
6. Page 3 Home/navigation aggregation and recovery entry.
7. Page 9 recovery history; lightweight Page 10 logs.
8. Page 11 races/calendar/planned-vs-actual and approval workflow.
9. Page 4 dashboard using deterministic approved summaries.
10. Page 7 conditional Stryd views and effective CP/Wkg history.
11. Page 8 load/trends using approved metrics only.
12. Weekly snapshots, AI readiness/evidence/review/proposal decision flow.
13. Page 12 coach dashboard and Page 13 contextual messaging/notifications.
14. Page 14 settings, privacy controls and Page 15 help/version/setup.
15. Phase 2: Google Drive sync, export/delete automation, device-derived recovery, push/email and only then approved advanced analytics.

## Release gates

Before pilot: cross-tenant authorization tests, FIT idempotency/reprocessing tests, effective-date regression tests, backup/restore, audit review, AI no-auto-apply test, accessibility/responsive smoke tests, privacy notice and support path.

