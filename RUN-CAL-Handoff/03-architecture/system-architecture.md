# System Architecture

## Logical components

- Responsive web client with role/athlete/workspace context.
- API/service layer enforcing authorization on every request.
- Relational database for identities, effective-dated configuration, normalized summaries, workflow and audit data.
- Private object storage for immutable original FIT files and optional derived artifacts.
- Asynchronous import workers for validation/parse/normalization/reprocessing.
- Analytics jobs that generate versioned deterministic metrics and weekly snapshots.
- AI review service consuming curated snapshots/evidence, not unbounded raw access.
- Phase 2 Drive connector with least-privilege OAuth and folder-ID mappings.

## Boundaries

Browser never decides authorization. Object keys are opaque and downloads use short-lived authorized URLs. Import is idempotent. Analytics outputs record formula/version/input window. AI outputs record evidence IDs, prompt/model/policy version and human disposition.

## Suggested repository shape

```text
apps/web/
services/api/
services/worker/
packages/contracts/
infra/migrations/
docs/
```

Technology choices are not locked by this package. Preserve contracts and invariants if changing stack.

