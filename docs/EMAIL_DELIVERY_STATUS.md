# Email Delivery Status

Last verified: 2026-09-04 (Asia/Bangkok)

## Verified production flow

- Google Cloud project: `run-cal-th`
- Region: `asia-southeast1`
- Delivery: Gmail SMTP over TLS with a Google App Password
- Sender secret: `RUN_CAL_GMAIL_FROM`
- Credential secret: `RUN_CAL_GMAIL_APP_PASSWORD`
- Secret values are stored only in Google Secret Manager and must never be committed or logged.
- `createInvite`, `requestUsernameLookup`, and `requestPinReset` are deployed with both secrets.
- Check Username was tested end-to-end: request accepted, email received, one-time link verified, and username displayed.
- Reset PIN was tested end-to-end: request accepted, email received, one-time link opened, a new six-digit PIN set, and login confirmed with the new PIN.
- Invitation delivery was tested: an athlete invitation was created for a non-admin email address and the application confirmed that the email was sent.
- The invitation acceptance 500 error was traced to an invalid Firestore collection-group document-ID query. Production `createInvite` and `acceptInvite` now use a top-level `inviteIndex` document to resolve the workspace invitation path.
- The fixed functions were deployed successfully, and a new invitation request completed with HTTP 200 on the new revision.
- The newest invitation link was opened once and account creation completed successfully after the hotfix.

## Operational behavior

- Username and PIN-recovery links expire after one hour and are single use.
- Opening a consumed link again correctly returns invalid/expired.
- Recovery request responses remain generic to prevent account enumeration.
- When rotating a secret, create a new enabled version and redeploy the dependent functions so the revision binds the new version.

## Next verification

- [x] Request PIN reset email.
- [x] Open the newest reset link once.
- [x] Set a new six-digit PIN without exposing it in chat or logs.
- [x] Confirm login with the new PIN.
- [x] Create an athlete invitation for a non-admin test email.
- [x] Confirm that the application reports the invitation email was sent.
- [x] Open the newest invitation link once and complete account creation.
- [ ] Confirm login for the invited account.
