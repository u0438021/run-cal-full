# Running FIT Field Specification

## Priority mapping

| Canonical field | FIT source candidates | Notes |
|---|---|---|
| timestamp | record.timestamp | UTC canonical timestamp |
| sport/subsport | session/sport sport, sub_sport | require running; keep exact subtype |
| distance_m | record.distance; session/lap totals | prefer monotonic record distance |
| duration_s | timer_time, elapsed_time | preserve both; moving uses timer events |
| speed_mps / pace | enhanced_speed, speed | store speed; derive pace safely |
| heart_rate_bpm | record.heart_rate | nullable, range checked |
| GPS | position_lat, position_long | convert semicircles to degrees |
| elevation_m | enhanced_altitude, altitude | prefer enhanced |
| grade_pct | grade or derived | label provenance and smoothing window |
| cadence_spm | cadence + fractional_cadence | running cadence; document per-leg conversion |
| laps | lap messages | retain boundaries and summaries |
| pause/events | event messages | timer start/stop/all and auto-pause |
| native_power_w | record.power | retain independently |
| Stryd power_w | developer field descriptions | resolve metadata; never assume field number |
| form_power_w | Stryd developer field | normalized alias + units |
| air_power_w | Stryd developer field | nullable; environmental/model dependent |
| leg_spring_stiffness_kn_m | Stryd developer field | normalize unit to kN/m |
| ground_contact_time_ms | developer/native dynamics | retain source |
| vertical_oscillation_mm | developer/native dynamics | normalize cm/mm carefully |
| stride_length_m | step_length/stride_length developer field | record semantic provenance |
| device/sensors | device_info, file_id, developer_data_id | manufacturer, product, serial, battery, ANT/device indexes |

## Developer data resolution

Field definition numbers are local to an app/developer data index and can change. Decode `developer_data_id` and `field_description` messages first. Registry identity:

```text
(developer_data_index, field_definition_number)
  -> developer/app identity, field_name, units, scale, offset, native_mesg_num, native_field_num
```

Normalize field names case-insensitively after removing spaces, punctuation, and unit suffixes. Accept an explicitly tested alias set (for example running power, form power, air power, leg spring stiffness), verify compatible units, and record the original description. Native overrides are hints, not sufficient proof that a field is Stryd. Identify Stryd from developer/application identity. Some valid files omit the manufacturer ID; for those files require the combined metadata signature `Power` + `Form Power` + `Air Power` + `Leg Spring Stiffness`. Otherwise retain the data as unknown developer fields. Field numbers are never treated as stable identifiers.

Native FIT `stance_time`, `vertical_oscillation`, and `step_length` are fallback sources for standardized running-dynamics fields when equivalent Developer Data is absent.

## Power selection

1. If verified Stryd running power is present and valid, set `power_w` to it and provenance `stryd_developer`.
2. Else use valid native power with provenance `native_fit`.
3. Preserve both columns and calculate discrepancy/coverage diagnostics when both exist.
4. Never zero-fill missing power; null means unknown.

## Data quality checks

- Timestamps ordered/deduplicated; distance does not materially reverse.
- Latitude/longitude bounds and impossible teleport speeds flagged.
- Physiological/dynamic range checks flag rather than silently clamp.
- Gaps, pauses, sensor dropouts, power/HR/GPS coverage, and field source reported.
- Summary totals cross-checked against record-derived totals with tolerances.
