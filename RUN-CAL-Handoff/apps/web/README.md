# RUN|CAL web app

Responsive RUN|CAL application with a same-host Node API. Persistent records are stored in SQLite and original FIT bytes are stored immutably on the host filesystem. It does not require Firebase or a third-party database.

## Requirements

- Node.js 22.5 or newer (Node 24 LTS recommended)
- A persistent writable directory on the host

## Production

```powershell
npm.cmd install
npm.cmd run build
$env:RUN_CAL_DATA_DIR='D:\run-cal-data'
$env:PORT='8787'
$env:RUN_CAL_PUBLIC_URL='https://run-cal.example.com'
$env:RUN_CAL_EMAIL_WEBHOOK_URL='https://mail-gateway.example.com/send'
npm.cmd start
```

Point the host's HTTPS reverse proxy to port `8787`. Back up `RUN_CAL_DATA_DIR`; it contains `run-cal.sqlite` and the immutable `fit-originals/` directory. Do not place that directory inside a public web root.

## Local development

Run the API and Vite client in separate terminals:

```powershell
npm.cmd run server
npm.cmd run dev
```

Vite proxies `/api` to `http://localhost:8787`.

## Account email delivery

Invite, Username lookup and PIN reset links are one-time links that expire after one hour. To send them, configure both `RUN_CAL_PUBLIC_URL` and `RUN_CAL_EMAIL_WEBHOOK_URL` on the host. The webhook receives a JSON POST with `fromName`, `to`, `subject` and `text`, and must send mail through the selected host-owned provider (for example a Gmail or Microsoft OAuth relay). If either setting is missing, new invites are intentionally blocked; recovery requests remain non-enumerating but cannot deliver a link.

Do not put an OAuth client secret in browser code. Register Gmail/Microsoft OAuth with the mail relay, keep its credentials on the host, and make the webhook authenticate requests from RUN|CAL before it relays mail.

## Account controls implemented

- Immutable Username: 4–8 ASCII letters, digits, `_` or `-`; PIN: exactly six digits.
- Invitee chooses their own Username and PIN; invitations expire in one hour.
- Username lookup and PIN reset use one-time, one-hour email links. Reset clears account lock and all active sessions.
- Five failed PIN attempts lock the account; the next login only succeeds after PIN reset.
- A user can have two simultaneous sessions; a third login removes the oldest.
- Team Admin transfer requires the current admin's PIN and acceptance by the selected member. The former admin loses Team Admin and any team email connection is revoked.
