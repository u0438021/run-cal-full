# Resend email setup

RUN|CAL sends invitations, Username lookup links and PIN reset links through Resend. The API key is stored only in Firebase Secret Manager; never put it in browser code, `.env`, Git, or chat.

## One-time setup

1. Create a Resend account and verify a sending domain.
2. Create an API key with **Sending access** only.
3. From this project root, run:

```powershell
node 'C:\Users\winai\AppData\Roaming\npm\node_modules\firebase-tools\lib\bin\firebase.js' functions:secrets:set RUN_CAL_EMAIL_CONFIG --project run-cal-th --format=json
```

Paste this JSON when prompted, replacing the values:

```json
{"apiKey":"re_replace_me","from":"RUN|CAL <hello@your-verified-domain.example>"}
```

4. Deploy the email functions:

```powershell
node 'C:\Users\winai\AppData\Roaming\npm\node_modules\firebase-tools\lib\bin\firebase.js' deploy --only functions:createInvite,functions:requestUsernameLookup,functions:requestPinReset --project run-cal-th
```

## Behaviour

- Email links are single-use and expire after one hour.
- Username lookup and PIN reset always return a generic result, including for unknown addresses.
- PIN reset clears a locked account and revokes its Firebase refresh tokens.
