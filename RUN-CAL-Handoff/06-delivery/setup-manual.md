# Developer Setup and Operations Manual

This handoff is stack-neutral. Adapt commands to the selected repository; do not invent secrets or production credentials.

## Environment classes

Local, test, staging and production must use separate databases, object stores, OAuth clients, secrets and AI configuration. Seed only synthetic data outside authorized environments.

## Required configuration groups

Database URL/pool; private object storage; session/signing keys; PIN pepper; allowed origins; upload limits; parser/formula/protocol versions; AI provider/model/policy and kill switch; Drive credentials/webhook/scheduler only when enabled; logging/metrics/error reporting with redaction.

## Bootstrap order

1. Install toolchain and dependencies from the repository lockfiles.
2. Create environment configuration from a committed example—never commit real secrets.
3. Start database/object-store dependencies.
4. Apply migrations.
5. Create a platform bootstrap account and first workspace through an audited one-time path.
6. Start API, workers and web client.
7. Run health, migration, authorization, FIT fixture and UI smoke tests.

## Operational versioning

Expose app/build, database migration, parser, metric/formula, protocol and AI policy/model versions in admin diagnostics; Page 15 exposes safe user-relevant versions. Reprocessing is explicit, versioned and auditable.

## New team setup

Create Workspace → Add Workspace Admin → Invite Coaches → Create/Invite Athletes → Assign Athletes → Configure profiles → Add approved baselines/zones → Configure FIT source → run the permission verification checklist → Ready.

