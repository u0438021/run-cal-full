# FIT Import and Original Storage Manual

## Pipeline

1. Authorize workspace/athlete target.
2. Stream upload to quarantine/private storage; enforce size/type limits.
3. Hash original bytes; create file/import records.
4. Validate FIT integrity/CRC when available and running sport.
5. Parse metadata first for preview and duplicate evidence.
6. User confirms import.
7. Normalize standard fields; resolve developer fields by metadata, not fixed field numbers.
8. Persist raw decoded developer fields and provenance alongside normalized output.
9. Select effective-dated CP/weight/zone/threshold records.
10. Compute only approved/versioned metrics; mark the rest unavailable.
11. Produce warnings/data-availability map and audit events.

## Original storage

Original bytes are immutable and mandatory in MVP. Use private object storage, encryption, opaque keys, checksum, size, media type, uploader/source, received time and retention state. Never expose bucket/object paths directly. Reprocessing creates a new import/analytics version and preserves prior outputs.

## Stryd behavior

Detect power, LSS, LSS Balance, Form Power, FPR and Air Power independently. `uses_stryd=false` controls navigation, not deletion or parser behavior. LSS Balance requires actual Duo/developer data. No CP means no zone classification; do not estimate silently.

## Drive Phase 2

Map `workspace_id + athlete_id → drive_folder_id`. Use least privilege, encrypted tokens, cursor/watermark, external file ID + revision/hash idempotency, retry/backoff and disconnect/revoke behavior. Renaming a folder must not break identity. Source deletion does not silently delete imported activity.

