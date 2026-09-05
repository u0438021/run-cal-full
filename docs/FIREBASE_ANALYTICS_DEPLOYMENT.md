# Firebase analytics deployment

The live Firebase source was intentionally removed from this repository during
workspace cleanup and is not recreated here. The new service is additive: it
uses existing Firebase Authentication, Firestore documents, and private FIT
objects. It does not replace login, Gmail recovery, invitations, or Hosting.

## Runtime

- Entry point: `app.firebase_main:app`
- Region: `asia-southeast1`
- Bucket: `run-cal-th.firebasestorage.app`
- Browser origin: `https://run-cal-th.web.app`
- Authentication: Firebase ID token in `Authorization: Bearer <token>`
- Endpoints: `POST /v1/activities/{activityId}/analyze` and
  `GET /v1/activities/{activityId}/analytics`; authenticated activity detail can
  request a maximum 2,000-point series from `GET /v1/activities/{activityId}/series`.
- Optional AI: `POST /v1/activities/{activityId}/insights`. The athlete document
  must explicitly contain `aiInsightsEnabled: true`; missing/false remains disabled.

The application validates the token and the live `users`, workspace member,
athlete activity, and FIT object path before reading data. The runtime service
account needs only Firestore read/write and object read/create permissions for
the project. Do not grant owner/editor roles.

## Deployment command

Run from the repository root in an authenticated Google Cloud Shell or a machine
with Google Cloud CLI. Review the pending source diff and project first.

```powershell
gcloud config set project run-cal-th
gcloud run deploy run-cal-analytics `
  --source services/api `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --service-account run-cal-analytics@run-cal-th.iam.gserviceaccount.com `
  --set-env-vars FIREBASE_STORAGE_BUCKET=run-cal-th.firebasestorage.app,WEB_ORIGIN=https://run-cal-th.web.app `
  --memory 1Gi `
  --cpu 1 `
  --concurrency 8 `
  --max-instances 2 `
  --timeout 300
```

`--allow-unauthenticated` lets the browser reach Cloud Run; application data is
still protected by Firebase ID-token and membership checks. Set a billing budget
and alerts before production use. Firebase App Check/rate limiting are remaining
hardening work.

AI additionally requires `OPENAI_MODEL` and an `OPENAI_API_KEY` environment value
mounted from Google Secret Manager. Never put the key in source, a browser, or a
plain `--set-env-vars` command. The service uses Structured Outputs and sets
`store:false`; see https://developers.openai.com/api/reference/cli/resources/responses/methods/create.

## Existing web integration

After deployment, add the tested client contract from
`apps/web/lib/firebase-analytics.ts` to the maintained Firebase web source.
Obtain the token immediately before each request; do not store it outside the
Firebase SDK session.

```ts
const token = await auth.currentUser?.getIdToken()
const response = await fetch(
  `${analyticsOrigin}/v1/activities/${activityId}/analyze`,
  { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
)
```

Call the analytics GET endpoint to render stored results. It does not return GPS
or the private object key. The separate, owner-scoped series endpoint may include
GPS for an activity map; it never returns raw FIT fields. The current production web source must
be recovered from its maintained deployment source before this UI call can be
added safely; replacing the live app with the incomplete local Next.js dashboard
would remove existing account and team features.

## Verification gates

1. Build the container and call `/health`.
2. A valid athlete can analyze their own known activity.
3. Missing, expired, and revoked tokens return 401.
4. Another athlete's activity returns 404/403 without reading its object.
5. Repeating the same parser/source hash returns `cached: true`.
6. A source hash mismatch returns 409 and writes no analytics.
7. Firestore analytics contains no GPS, token, username, PIN, or object key in
   the browser response.
8. Confirm budget alerts, logs, rollback revision, and least-privilege IAM.

Do not deploy until the maintained Firebase frontend source and Cloud project
credentials are available. Deployment changes live infrastructure and may incur cost.
