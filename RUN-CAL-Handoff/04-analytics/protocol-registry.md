# RUN|CAL Protocol Registry

## Registry metadata

| Field | Value |
|---|---|
| Registry version | `RUN-CAL-TEST-PROTOCOLS/2026.09.03` |
| Source artifact | `20260903_RUN_CAL_Testing_Protocols_Module.html` |
| Source supplied by | Product owner |
| Module extraction date | 2026-09-03 |
| LTP source named in module | `https://www.aixsurge.com/blog/calculate-lactate-threshold` |
| LTHR source named in module | `https://www.aixsurge.com/blog/calculate-threshold-heart-rate` |
| Hydration provenance named in module | RUN|CAL direct formula: sweat loss = weight loss + fluid in - urine out |
| Scope | LTP, LTHR, Pace/HR Zones, Hydration sweat-rate and race-day arithmetic |

Every calculated test must persist: `protocol_id`, `protocol_version`, `source_artifact`, `calculated_at`, `effective_date`, raw inputs, normalized inputs, result, units, quality, conditions, and approver/reviewer where applicable. Never overwrite historical results.

## Application boundary

Calculated testing results are isolated from the athlete's normal application data. Saving a test or viewing a result must not update Training Load, Recovery, Readiness, AI context/proposals, Calendar, FIT-derived metrics, CP, W/kg, Power Zones or historical activities.

The only permitted downstream action is an explicit user confirmation to apply the proposed Pace Zone profile and/or HR Zone profile in Athlete Profile. The UI must show a proposed-versus-current comparison, source test ID, protocol/version and selected effective date. The default is `Keep current`; cancelling or declining preserves the test record only. Applying creates a new immutable effective-dated profile record and never alters an older profile record or recalculates historical activities.

## Approved calculation contracts

### LTP / Pace Zones

All LTP calculations use speed in metres per second (`m/s`). Display pace as `mm:ss /km`.

| ID | Test input / procedure | Exact calculation |
|---|---|---|
| `LTP-CRITICAL-PACE` | Two maximal steady efforts: 3-5 min, then 12-20 min; at least 15 min recovery or perform the second on the next day. | `CPspeed = (v2*t2 - v1*t1) / (t2 - t1)`; `LTPspeed = CPspeed * 0.94`, where `v = distance_m / time_s`. Reject equal effort times. |
| `LTP-RAMP-3MIN` | Start 8 km/h; increase 1 km/h every 3 min until unable to continue. | `peak_kmh = last_completed_kmh + incomplete_stage_seconds / 180`; `LTPspeed = (peak_kmh / 3.6) * 0.824`. |
| `LTP-30MIN-RUN` | 30 min maximal steady run. | `LTPspeed = distance_m / 1800`. |
| `LTP-5K-RUN` | Maximal steady 5K time trial or race. | `LTPspeed = (5000 / time_s) * 0.90`. |

Pace zone boundaries are multipliers of the LTP speed:

| Zone | Name | Lower | Upper |
|---|---|---:|---:|
| 1 | Recovery | 65% | 78% |
| 2 | Endurance | 78% | 88% |
| 3 | Tempo | 88% | 94% |
| 4 | Threshold | 95% | 103% |
| 5 | Anaerobic / VO2max | 104% | 140% |

### LTHR / HR Zones

| ID | Test input / procedure | Exact calculation |
|---|---|---|
| `LTHR-5K` | Average HR across a maximal, steady 5K. | `LTHR_bpm = average_hr_5k / 1.04`. |
| `LTHR-30MIN` | Average HR for minutes 10-30 of a continuous maximal, steady 30-minute run. | `LTHR_bpm = average_hr_minutes_10_to_30`. |

Round HR-zone values to the nearest whole BPM. The approved boundaries are: Zone 1 `0-85%`; Zone 2 `85-89%`; Zone 3 `90-94%`; Zone 4 `95-102%`; Zone 5 `103-140%` (display as above Zone 5 lower bound where the open-ended UI is used).

### Hydration / Sweat-rate

Required inputs: test date, exercise duration, pre-exercise weight, post-exercise weight. Optional inputs: fluid consumed, urine produced, sport, environment, intensity, temperature, humidity, sodium concentration, manual sodium target, carbohydrate target, expected race duration and bottle capacity.

```text
weight_change_kg       = pre_weight_kg - post_weight_kg
weight_change_percent  = weight_change_kg / pre_weight_kg * 100
sweat_loss_l           = weight_change_kg + fluid_consumed_ml/1000 - urine_ml/1000
sweat_rate_l_per_hr    = sweat_loss_l / (duration_min/60)
sweat_rate_ml_per_hr   = sweat_rate_l_per_hr * 1000
fluid_target_ml_per_hr = sweat_rate_ml_per_hr * replacement_percent/100
sodium_loss_mg_per_hr  = sweat_rate_l_per_hr * sweat_sodium_concentration_mg_per_l
race_total_fluid_ml    = fluid_target_ml_per_hr * expected_race_duration_hr
bottles_needed         = ceil(race_total_fluid_ml / bottle_capacity_ml)
```

The default replacement percentage is 75%; the supplied module describes 70-80% as typical. Sodium and carbohydrate targets are manually prescribed and stored separately; neither may be inferred from the other.

Show a review warning when: post-weight exceeds pre-weight; weight change is greater than 3%; fluid consumed exceeds estimated sweat loss; or the test is shorter than 30 minutes. The module notes 45-60+ minutes tends to give more consistent estimates.

## Explicitly out of scope / still blocked

- HR-derived and power-derived Training Load, including CTL, ATL, ACWR and ramp-rate formulas.
- Critical Power estimation from FIT or automatic CP updates.
- Power-zone percentages and power-zone calculation.
- Readiness score, medical interpretation, injury risk and automatic training-plan changes.

Do not use an unavailable value as zero. Missing inputs produce an unavailable result and an explanation. Hydration outputs must be labelled as a starting point for review, not an absolute requirement or medical prescription.

## Approved non-protocol analytics

### `RUN-CAL-SRPE-LOAD/1.0`

`session_load_au = session_duration_minutes × session_rpe_0_to_10`

This is RUN|CAL's MVP internal training-load measure. Persist the two raw inputs, calculation version and result in arbitrary units (`AU`). It may be summed by a selected calendar period. Do not calculate it if either input is unavailable; do not merge it with HR-derived or power-derived load; and do not label it as readiness, injury risk or a medical assessment.

### `RUN-CAL-CP-PROFILE/1.0`

A CP/Power Zone profile may be recorded only from a Stryd-provided value or a Coach-entered value. It must store source type (`stryd` or `coach`), CP watts, weight record reference where W/kg is displayed, zone lower/upper watt boundaries as supplied, effective date, captured date, actor, source evidence and profile version.

RUN|CAL does not infer CP from FIT, calculate replacement power-zone percentages, or auto-accept a changed Stryd value. A proposed imported change requires Athlete or Coach acceptance, then creates a new immutable effective-dated profile. Historical activities always resolve the CP/zone profile effective on their activity date.
