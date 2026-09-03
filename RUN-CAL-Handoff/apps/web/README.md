# RUN|CAL web app

Responsive RUN|CAL application hosted on Firebase. Application records use Firestore, private FIT originals use Cloud Storage, and trusted Cloud Functions enforce account and workspace access.

## Requirements

- Node.js 22.5 or newer (Node 24 LTS recommended)
- A Firebase project on the Blaze plan, with Firestore, Storage, Functions and Hosting enabled

## Production

Run `npm.cmd run build` in this folder, then deploy Hosting and Functions through the Firebase CLI. See `../../06-delivery/gmail-email-setup.md` before deploying account-email functions.

## Local development

Run the Vite client:

```powershell
npm.cmd run dev
```

## Account email delivery

Invite, Username lookup and PIN reset links are one-time links that expire after one hour. They are sent by a single Gmail account controlled by the platform owner through Gmail API. The Gmail OAuth client secret and refresh token must be stored only in the Firebase Secret Manager secret `RUN_CAL_GMAIL_OAUTH_CONFIG`; never place either in browser code or Firestore.

## Account controls implemented

- Immutable Username: 4–8 ASCII letters, digits, `_` or `-`; PIN: exactly six digits.
- Invitee chooses their own Username and PIN; invitations expire in one hour.
- Username lookup and PIN reset use one-time, one-hour email links. Reset clears account lock and all active sessions.
- Five failed PIN attempts lock the account; the next login only succeeds after PIN reset.
- A user can have two simultaneous sessions; a third login removes the oldest.
- Team Admin transfer requires the current admin's PIN and acceptance by the selected member. The former admin loses Team Admin and any team email connection is revoked.
