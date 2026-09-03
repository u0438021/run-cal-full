# RUN|CAL — Latest Approved Baseline

**Status:** Approved for Work implementation planning
**Last consolidated:** 2026-09-03

This file is the concise starting point for a new Work session. The documents it links are the authoritative detailed specifications.

## Product and delivery scope

- All 15 RUN|CAL pages and the end-to-end workflow are approved. See `02-pages/page-01-15.md`.
- Target is a responsive web app, reviewed locally before any deployment. **Do not deploy to Firebase.**
- The approved review mockups are 15 JPG files under `artifacts/run-cal-page-mockups/`, also bundled in `artifacts/RUN-CAL-Web-App-Mockups-JPG.zip`.
- The application supports English (`en`) and Thai (`th`) throughout the UI, Help/FAQ and release notes. The language selector is in Page 14.
- Architecture remains multi-tenant; roles are Athlete, Coach and Workspace Admin. Data never crosses Workspace boundaries.

## Approved testing protocol source

- Registry version: `RUN-CAL-TEST-PROTOCOLS/2026.09.03`
- Owner-supplied source artifact: `20260903_RUN_CAL_Testing_Protocols_Module.html`
- Approved scope: LTP (Critical Pace, RAMP, 30-Minute Run, 5K Run), LTHR (5K, 30-Minute), Pace Zones, HR Zones, and Hydration sweat-rate/race-day arithmetic.
- Exact formulas, validation and warning behavior: `04-analytics/protocol-registry.md`.

## Testing calculator boundary

- Implement **Testing Protocols Calculator** as an Athlete Profile / Page 14 subpage, not as a new primary page.
- Flow: choose protocol → enter raw inputs → validate → calculate preview → save test history → optionally propose Pace Zone and/or HR Zone update → compare current versus proposed → confirm update or keep current.
- Test results are isolated by default. They must not update Training Load, Recovery, Readiness, AI, Calendar, FIT metrics, CP, W/kg, Power Zones or historical activities.
- Only an explicit confirmed action may create a new effective-dated Pace Zone profile and/or HR Zone profile. The confirmation shows the source test, protocol version, effective date and current versus proposed values. Default action is **Keep current**.

## Approved analytics/data behavior

- `RUN-CAL-SRPE-LOAD/1.0`: `duration_minutes × Session RPE (0–10)`, stored as AU with raw inputs. It is not readiness, injury risk or a medical assessment.
- `RUN-CAL-CP-PROFILE/1.0`: CP and Power Zone ranges originate from Stryd or a Coach. An imported CP change needs Athlete or Coach acceptance before a new effective-dated profile is created.
- Original FIT files are private, retained and immutable. Missing values are `not_available`, never zero.
- AI may explain evidence and propose changes but may never auto-change a plan, message in a person's name, diagnose, or determine injury risk.

## Explicitly blocked

- HR-derived and power-derived Training Load, CTL, ATL, ACWR and ramp-rate formulas.
- RUN|CAL CP estimation from FIT, automatic CP updates, and RUN|CAL-generated Power Zone percentages.
- Readiness/risk scores, medical interpretations, injury diagnosis and automatic training-plan changes.

## Primary documents

- `01-product/locked-decisions.md`
- `02-pages/page-01-15.md`
- `04-analytics/protocol-registry.md`
- `04-analytics/testing-protocols.md`
- `05-design/design-system.md`
- `07-skills/run-cal-approval-workflow/SKILL.md`
