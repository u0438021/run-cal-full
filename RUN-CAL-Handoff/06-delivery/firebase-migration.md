# Firebase-only migration plan

Status: approved 2026-09-03. Firebase Project: `run-cal-th`.

## Chosen architecture

| Concern | Firebase service |
|---|---|
| Web application | Firebase Hosting |
| Trusted API, Gmail relay, scheduled jobs | Cloud Functions (2nd gen) |
| Application records | Cloud Firestore |
| Original FIT files | Cloud Storage, private bucket |
| Session identity | Firebase Authentication custom tokens |
| Secrets | Google Cloud Secret Manager |

The original host-owned SQLite and filesystem design is superseded. No Firebase Auth email/password account is exposed to users: a callable/HTTPS Function verifies the immutable Username and six-digit PIN, then returns a Firebase custom token. PIN hashes and recovery tokens stay in trusted server code only.

## Security requirements retained

- Username: immutable, ASCII letters/digits/`_`/`-`, 4–8 characters.
- PIN: exactly six digits; hash only with a strong password hash.
- Lock after five failed attempts; PIN reset clears lock and sessions.
- Maximum two sessions; a third revokes the oldest.
- Role and workspace authorization enforced by Functions and Firestore/Storage Rules.
- Invite, Username lookup and PIN reset are single-use, one-hour Gmail links.
- FIT files are private; no direct public Storage access.

## Firestore shape

Use one document per independently managed record:

```text
users/{uid}                         public-safe account profile + status
privateAccounts/{uid}               username index, PIN hash, lock/session state (Functions only)
workspaces/{workspaceId}            team metadata and current Team Admin UID
workspaces/{workspaceId}/members/{uid}
workspaces/{workspaceId}/invites/{inviteId}
workspaces/{workspaceId}/activities/{activityId}
workspaces/{workspaceId}/recovery/{uid_date}
workspaces/{workspaceId}/monthlyLogs/{uid_month}
workspaces/{workspaceId}/notifications/{notificationId}
```

Cloud Storage path: `fit-originals/{workspaceId}/{uid}/{activityId}.fit`.

## Migration order

1. Upgrade Firebase Project to Blaze and set a budget alert.
2. Choose one Google Cloud region for Firestore, Functions and Storage.
3. Create Firestore and Storage with locked-down rules; enable Firebase Authentication.
4. Build Functions: account/login/session/invite/recovery/admin-transfer and Gmail sender.
5. Replace the current browser `/api` client with Firebase Auth + callable Functions.
6. Move FIT upload to a signed/function-authorized Storage flow and implement parsing.
7. Add scheduled recovery/monthly/inactivity/AI jobs.
8. Test Rules, account flows and role boundaries in Firebase Emulator Suite before production deployment.

## Current deployment

- Hosting URL: `https://run-cal-th.web.app`
- Hosting is deployed successfully.
- It currently serves only the client bundle. Authentication and data endpoints remain unavailable until steps 1–5 are complete.
