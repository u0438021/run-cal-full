# Firebase Invitation Hotfix

Deployed: 2026-09-04 to Google Cloud project `run-cal-th`, region `asia-southeast1`.

## Incident

`acceptInvite` returned `INTERNAL (500)` because a collection-group query compared `FieldPath.documentId()` with a single hashed document ID. Firestore requires a full document path for that query shape.

## Production fix

- `createInvite` writes the workspace invitation and a top-level `inviteIndex/{tokenHash}` document in one batch.
- The index contains the workspace invitation path and expiry metadata, but not the plaintext invitation token.
- `acceptInvite` hashes the submitted token, reads its index document, loads the exact invitation path, and verifies that the loaded document ID matches the token hash.
- On successful acceptance, the invitation and index are both marked accepted in the account-creation batch.

The plaintext invitation token, Username, PIN, and Gmail credentials must never be logged or committed.

## Deployment result

- `createInvite`: deployed successfully.
- `acceptInvite`: deployed successfully.
- A new athlete invitation was created after deployment; the callable request returned HTTP 200.

