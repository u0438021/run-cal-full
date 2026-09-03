# RUN|CAL — Codex project instructions

## Source of truth

- Read `MANIFEST.md` before changing product behaviour. It indexes the approved product, architecture, analytics, design and delivery documents.
- Treat `01-product/locked-decisions.md` as the decision register and `01-product/master-spec.md` as the product source of truth.
- Do not silently change a locked decision. Record a proposed change in the appropriate product document and ask the user when it needs a product decision.
- Treat `sources/` as read-only synced reference material. Do not edit, move, rename or delete it.

## Current implementation

- The runnable app is in `apps/web`.
- It is migrating to Firebase-only: Hosting for the client, Cloud Functions for the API and scheduled work, Firestore for application records, and Cloud Storage for private FIT originals.
- Use Firebase Authentication plus trusted Cloud Functions for account security. Never expose PIN hashes, recovery tokens, OAuth tokens or privileged data through browser-accessible Firestore documents.
- Account policy: immutable Username (ASCII letters, digits, `_`, `-`; 4–8 chars), six-digit PIN, five failures lock the account, and a maximum of two active sessions.
- Keep all authorization checks server-side. Workspace and role boundaries are security requirements, not UI-only behaviour.

## Required checks

From `apps/web`, run these after relevant changes:

```powershell
npm.cmd run build
node --check server.mjs
```

Use an isolated temporary `RUN_CAL_DATA_DIR` for API smoke tests. Never test against production data.

## Email and deployment

- Invite, Username lookup and PIN reset require `RUN_CAL_PUBLIC_URL` and `RUN_CAL_EMAIL_WEBHOOK_URL`.
- Never put SMTP passwords, OAuth client secrets, access tokens, or host credentials in browser code, committed files, logs, or test output.
- Keep secrets only in the host's protected environment or secret manager.
- Follow `apps/web/README.md` for runtime configuration and deployment.

## Editing discipline

- Preserve unrelated worktree changes.
- Prefer small, reviewable changes; update documentation when a configuration contract or user-visible behaviour changes.
- Do not claim a capability has been tested unless its relevant build, API flow, or manual test has actually completed.
