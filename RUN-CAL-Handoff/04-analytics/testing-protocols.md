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

## BLOCKED-SOURCE formulas

Do not implement or publish calculated LTP, LTHR, sweat rate, hydration prescription, CP estimation, or zone boundaries until the owner provides the original reference and explicitly approves the exact interpretation. Manual verified values may be stored without pretending RUN|CAL calculated them.

Use `08-prompts/source-verification.md` whenever a formula/protocol request arises.

