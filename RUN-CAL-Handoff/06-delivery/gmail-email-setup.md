# Gmail account-email setup

Use one platform-owner Gmail account as the central sender for RUN|CAL invitations, Username lookup and PIN reset. This requires no purchased domain. Do not use an athlete or Team Admin account as the central sender.

## Google Cloud setup

1. In the Google Cloud project `run-cal-th`, enable **Gmail API**.
2. Open **Google Auth Platform**. Complete Branding, choose External audience and add the sender Gmail account as a test user.
3. In Data Access, add the sensitive scope `https://www.googleapis.com/auth/gmail.send`.
4. Create an OAuth client of type **Desktop app**. Keep its Client ID and Client secret private.
5. Open Google OAuth Playground. In its settings, enable **Use your own OAuth credentials** and enter the Client ID and Client secret. Select the `https://www.googleapis.com/auth/gmail.send` scope, authorize with the sender Gmail, then exchange the authorization code for a refresh token.

Keep the OAuth app in testing while only the sender Gmail is used. Add that same Gmail as a test user. Do not send its Client secret or refresh token in chat.

## Store configuration in Firebase

From `RUN-CAL-Handoff`, run this command locally. Firebase prompts for the JSON secret value; it is not written into the repository.

```powershell
node 'C:\Users\winai\AppData\Roaming\npm\node_modules\firebase-tools\lib\bin\firebase.js' functions:secrets:set RUN_CAL_GMAIL_OAUTH_CONFIG --project run-cal-th --format=json
```

Paste this shape, replacing every placeholder yourself:

```json
{
  "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "refreshToken": "YOUR_REFRESH_TOKEN",
  "from": "your-sender@gmail.com"
}
```

After the secret exists, deploy the three email functions and Hosting together. The sender Gmail remains private: browser code receives only success/failure responses and never reads the OAuth configuration.
