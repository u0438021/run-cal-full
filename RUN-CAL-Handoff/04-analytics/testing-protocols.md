# Athlete Testing & Protocols

Unified types: Critical Power, Lactate Threshold Pace, Lactate Threshold Heart Rate, Hydration/Sweat Rate. Each record stores value/unit, tested/effective dates, source, quality, protocol name/version, conditions, evidence and approver.

## Data quality

- VERIFIED: lab or verified structured test.
- FIELD TEST: completed under an approved RUN|CAL protocol.
- MANUAL: athlete/coach entered.
- ESTIMATED: system-derived by an approved versioned formula.

Quality guides weighting and disclosure; it must never erase provenance.

## Historical behavior

LTP/LTHR/CP and hydration tests retain history. Activity analysis uses the record effective on activity date. Hydration tests additionally record duration, pre/post body mass if approved, intake/output assumptions, temperature, humidity, conditions, notes and protocol version.

## Protocol registry

The owner supplied `20260903_RUN_CAL_Testing_Protocols_Module.html` on 2026-09-03 as the approved source module for the LTP, LTHR, Pace/HR Zone and Hydration protocols below. Its module extraction date is 2026-09-03; RUN|CAL must persist the source file name, protocol identifier, version and approval status with every calculated record.

| Protocol family | Approved source / version | Status |
|---|---|---|
| LTP: Critical Pace, RAMP, 30-minute run, 5K run | `RUN-CAL-TEST-PROTOCOLS/2026.09.03` | Source adopted; implementation must use the exact formulas in `protocol-registry.md` |
| LTHR: 5K and 30-minute methods | `RUN-CAL-TEST-PROTOCOLS/2026.09.03` | Source adopted; implementation must use the exact formulas in `protocol-registry.md` |
| Pace Zones and HR Zones | `RUN-CAL-TEST-PROTOCOLS/2026.09.03` | Source adopted; boundaries are tied to the LTP/LTHR record used |
| Hydration sweat-rate and race-day arithmetic | `RUN-CAL-TEST-PROTOCOLS/2026.09.03` | Source adopted; recommendations remain starting points, not medical prescriptions |
| Training Load: Session-RPE | `RUN-CAL-SRPE-LOAD/1.0` | Approved MVP calculation; `duration_min × session_rpe` in arbitrary units |
| HR-derived / power-derived Training Load | No approved formula | BLOCKED-SOURCE |
| Stryd/Coach-sourced CP and Power Zone profile | `RUN-CAL-CP-PROFILE/1.0` | Approved as a versioned imported/manual source profile; no RUN|CAL estimation or zone calculation |
| Power Zones / CP estimation by RUN|CAL | No source in supplied module | BLOCKED-SOURCE |

See `protocol-registry.md` for the exact calculation and validation contract. Use `08-prompts/source-verification.md` whenever a new formula/protocol request arises.
