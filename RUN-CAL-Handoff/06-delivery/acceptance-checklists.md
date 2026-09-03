# Acceptance Checklists

## Every page

- Approved requirement ID and release tier.
- Athlete/coach/admin states, responsive layout, loading/empty/error/permission states.
- Keyboard/focus/contrast and screen-reader labels.
- Analytics display has unit, period, availability, source/version where relevant.
- Cross-workspace access attempts denied and audited.

## FIT

- Original checksum matches uploaded bytes; duplicate is idempotent.
- Corrupt/non-running files fail clearly; partial metrics do not become zero.
- Parser reprocessing preserves previous version/output and source link.
- Stryd developer fields are metadata-resolved.

## History

- Activity before/after CP, weight, phase and zone effective dates uses the correct records.
- Updates append history; no retroactive overwrite.
- W/kg references selected CP and weight records.

## AI

- No weekly advice before readiness.
- Evidence values trace to stored metrics/dates.
- Missing/excluded data is shown.
- Calendar remains unchanged before authorized approval.
- Original proposal, modification/rejection and actor are preserved.

