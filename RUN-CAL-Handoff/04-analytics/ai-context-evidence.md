# AI Training Context, Readiness and Evidence

## Readiness gate

Weekly advice is unavailable until there are at least four weeks of usable training history plus explicit current objective/phase and sufficient evidence for the claims being made. Race/date/goal, plan, recovery, RPE, thresholds and Stryd are included only when available and applicable.

States are explicit: `available`, `not_available`, `insufficient_data`, `excluded_not_applicable`, `blocked_unapproved_formula`.

## Review contract

Every review records:

- athlete/workspace, generation time, data window and weekly snapshot IDs;
- objective, phase, primary race and days-to-race when available;
- metrics used with values, units, dates, source/quality/version;
- missing/excluded data;
- observations separated from recommendations;
- WHY evidence list;
- KEEP / ADJUST / WATCH / NEXT WEEK sections when relevant;
- confidence/limitations in plain language;
- proposal diff, human decision, actor and timestamps.

## Safety/control

AI may propose a calendar/plan change but may not apply it. Flow: `Generate → Explain → Coach/Athlete Review → Approve/Modify/Reject → Authorized update`. Preserve original proposal and final change. No medical diagnosis, autonomous CP/threshold update, invented evidence, or inference that missing data is favorable/unfavorable.

The AI service receives curated versioned snapshots and selected relevant activity/comment evidence. Access is constrained by the same workspace/athlete authorization as the UI.

