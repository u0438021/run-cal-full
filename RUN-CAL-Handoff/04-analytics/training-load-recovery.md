# Training Load and Recovery Rules

## Approved MVP calculations

- Daily Recovery overall: arithmetic mean of the five required 1–5 components. Store components and displayed result; do not impute missing check-ins.
- Session RPE Load: session duration in minutes × Session RPE (1–10), displayed in arbitrary units with the inputs visible.
- Weekly volume: deterministic sums/counts for distance, duration and activities.
- W/kg at a point in time: effective CP watts ÷ effective weight kilograms, referencing both history records.

## Separate perspectives

Session-RPE load, HR-derived load and power-derived load are different views. Never add them directly. HR/power/primary load formulas and status thresholds are BLOCKED-SOURCE until validated and approved.

## Interpretation rules

- Prefer direction and raw evidence over labels.
- No “injury risk %”, diagnosis, or certainty unsupported by a validated model.
- A missing HR, power, recovery or threshold value is `not_available`; too short a window is `insufficient_data`.
- Any “Needs Review” trigger must identify its metric, comparison window, approved threshold/version and evidence.

