# Gmail SMTP account-email setup

Use one platform-owner Gmail account as the central sender for RUN|CAL invitations, Username lookup and PIN reset. This requires no purchased domain and does not require a recurring OAuth reauthorization.

## Create an App Password

1. Turn on 2-Step Verification for the sender Gmail account.
2. Open <https://myaccount.google.com/apppasswords> while signed in to that Gmail.
3. Create an App Password named `RUN-CAL Firebase` and copy the generated 16-character value. The value is shown once only. Do not put it in chat or in a repository file.

App Passwords are not available to accounts using only security keys, Advanced Protection, or accounts whose organization blocks them. Changing the Gmail password revokes every App Password, so create a new one and replace the Firebase secret if that happens.

## Store configuration in Firebase

From `RUN-CAL-Handoff`, run these commands locally. Firebase prompts for each value; neither value is written into the repository.

```powershell
node 'C:\Users\winai\AppData\Roaming\npm\node_modules\firebase-tools\lib\bin\firebase.js' functions:secrets:set RUN_CAL_GMAIL_FROM --project run-cal-th

node 'C:\Users\winai\AppData\Roaming\npm\node_modules\firebase-tools\lib\bin\firebase.js' functions:secrets:set RUN_CAL_GMAIL_APP_PASSWORD --project run-cal-th
```

For the first command, enter only the sender Gmail address. For the second command, enter only the 16-character App Password, with or without the spaces Google displays.

After both secrets exist, deploy the account-email functions and Hosting together. Browser code never reads the sender email or App Password.
