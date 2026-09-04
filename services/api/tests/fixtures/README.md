# Sanitized FIT fixtures

These tiny binary fixtures are generated from deterministic synthetic values. They contain no person, device serial number, email address, real route, or real activity data.

- `synthetic_garmin_running.fit`: native Garmin-compatible record and session fields.
- `synthetic_stryd_running.fit`: the same synthetic run with Stryd-style Developer Data fields.

Regenerate both files from `services/api` with:

```powershell
uv run python tests/fixtures/generate_fit_fixtures.py
```
