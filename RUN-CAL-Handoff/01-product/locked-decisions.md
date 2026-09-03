# Locked Decisions Register

| ID | Decision | Status |
|---|---|---|
| LD-01 | Page 1–15 structure in `02-pages/page-01-15.md` | LOCKED |
| LD-02 | Username + six-digit PIN; hash only; rate limit/temporary lock; admins reset but never view PIN | LOCKED |
| LD-03 | Page 2 uses five steps: Account, Personal, Running, Goal, Review | LOCKED |
| LD-04 | Daily Recovery has five independent 1–5 metrics; MVP overall is their equal-weight mean | LOCKED |
| LD-05 | Session RPE is a separate post-session 1–10 value | LOCKED |
| LD-06 | Manual FIT pipeline includes validation, duplicate check, preview, confirm, parse, original retention, analytics | LOCKED |
| LD-07 | Original FIT retention is ON/mandatory for MVP | LOCKED |
| LD-08 | Stryd Page 7/navigation is conditional; historical data is retained when disabled | LOCKED |
| LD-09 | CP, weight, thresholds, phases, and zones use history/effective dates; activity analysis uses values effective on activity date | LOCKED |
| LD-10 | W/kg is derived from CP ÷ weight; do not separately enter authoritative W/kg | LOCKED |
| LD-11 | AI weekly review requires at least four weeks of data and explicit training context/readiness | LOCKED |
| LD-12 | AI proposal never changes a calendar automatically; preserve original AI proposal and human action | LOCKED |
| LD-13 | Activity comments and general conversations/messages are separate models | LOCKED |
| LD-14 | Multi-tenant workspace architecture; athlete data never leaks across workspaces | LOCKED |
| LD-15 | Google Drive mapping uses folder ID, never folder name as identity | LOCKED |
| LD-16 | Testing data records source, quality, environment, effective date, and protocol version | LOCKED |
| LD-17 | No formula invention. LTP/LTHR, Pace/HR Zones and Hydration use `RUN-CAL-TEST-PROTOCOLS/2026.09.03`; Session-RPE Load uses `RUN-CAL-SRPE-LOAD/1.0`; Stryd/Coach CP and Power Zone profiles use `RUN-CAL-CP-PROFILE/1.0`; all other load, CP-estimation and power-zone formulas remain BLOCKED-SOURCE | LOCKED |
| LD-18 | The app supports English (`en`) and Thai (`th`). The language selector is in Page 14 and applies to the full user interface, Help/FAQ and release notes; it never changes stored raw data, units or protocol versions | LOCKED |
| LD-19 | Testing Protocols is a Page 14 / Athlete Profile calculator subpage. Test results are isolated by default; only Pace and HR Zone profiles may be updated after an explicit proposed-versus-current confirmation. No automatic or retrospective changes are allowed | LOCKED |

## Open decisions (do not silently resolve)

- HR-load and power-load formulas; CTL/ATL/ACWR/ramp-rate use.
- Stryd/coach/RUN|CAL power-zone percentage definitions and licensing/attribution.
- HR-zone model and readiness/status thresholds.
- Final production authentication posture beyond controlled PIN access (passkey/MFA/admin requirements).
- Data retention/export/deletion periods and jurisdiction-specific privacy policy.
