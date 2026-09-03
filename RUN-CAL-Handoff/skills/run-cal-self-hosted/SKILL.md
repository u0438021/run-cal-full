---
name: run-cal-self-hosted
description: Build or modify the RUN|CAL self-hosted running analytics app while preserving its approved team, authentication, privacy, and data-workflow decisions.
---

# RUN|CAL self-hosted product rules

Use this skill when implementing or changing RUN|CAL. Keep athlete data, FIT bytes, sessions, and application records on the host; do not introduce Firebase or another managed data store. External OAuth is permitted only for user-authorized mail delivery or Google Drive file picking, with encrypted tokens stored on the host.

## Team model and access

- One team is one Workspace. The Platform Owner sees only each workspace's team name, Team Admin, and Coach; never athlete or training content.
- Every Workspace has exactly one Team Admin. The existing Team Admin may transfer the role after entering their PIN and the recipient accepts. Revoke the former Admin's mail connection at transfer.
- A user may combine roles. `team_admin` manages membership, invitation, roles, and team email. `coach` may view every athlete's training data and coach all athletes in that workspace. `athlete` sees only their own data.
- A Team Admin who is not also a Coach cannot view athlete training data or comment on activities. Coach-only operations must enforce the Coach role server-side.
- Athlete records and training data never cross workspaces.

## Account and invitation rules

- First launch has a one-time setup flow that creates the first Team Admin and workspace.
- Accounts use immutable Username plus a six-digit numeric PIN. Username uses only `A-Z`, `a-z`, `0-9`, `-`, and `_`, with 4–8 characters.
- Team Admin creates invitations by email. Athlete is the default role; Coach is optional. The invite expires in one hour and does not occupy one of the 120 active-user seats until accepted.
- Invitees create their own Username and PIN. Account recovery and Username lookup use a verified one-hour email link.
- Lock the account after five incorrect PIN attempts. Unlock only through PIN reset.
- Sessions persist until sign-out, PIN reset, suspension, or a role change. Permit two active devices; signing in on a third expires the oldest session without a user notification.
- The primary email is changed only by Team Admin and only after confirmation through the new email address.

## Team email and notifications

- In-app notifications are the default for product events. Users mark notifications read themselves.
- Each Team Admin connects their own sender email. Support Gmail, Outlook/Hotmail, and Custom SMTP. Prefer OAuth for Gmail and Outlook; encrypt tokens/SMTP secrets and never reveal saved credentials.
- Do not allow sending invite or reset email before the team's sender connection is verified with a test email.
- Invite and reset email content is bilingual Thai/English and sender name is `RUN|CAL`.
- Notify Coach and Team Admin when an athlete imports FIT, avoiding duplicates if the same person holds both roles.

## Athlete data and workflows

- Athlete completes their own Profile: emergency contact name/relation/phone, free-text sport goal, years of experience, and an experience note are required. Coach cannot edit it.
- Daily Recovery is due at 08:00 Asia/Bangkok every day. It has five independent 1–5 scores plus optional note. Show the equal-weight average only; never make medical or injury-risk claims. Coach can view it.
- Monthly Log is due on the first of each month. Athlete enters weight and optional coach comment. If they use Stryd, also require manually entered CP and W/kg. Entries lock after save; Coach replies in the log and neither party edits/deletes their posted record. Both can view all history.
- Athlete may indicate they use Stryd. Do not connect to or pull from Stryd. Use Power-related values only when a FIT file contains them. Show LSS, Form Power, and Form Power Ratio only when present.
- HR Zones default to LTHR. Permit Max HR as fallback when LTHR is unavailable.

## FIT and activities

- Accept running FIT activities only. If sport type is unclear, ask the Athlete to confirm it is a run before import.
- Athlete imports from their device and may select up to 10 FIT files at once. They may backfill up to 30 days before enrollment; use each FIT's actual activity date once parsing is implemented.
- Google Drive is optional and athlete-owned: allow Drive file picking only, not folder synchronization or broad Drive access. Athlete can disconnect; immediately delete stored OAuth tokens.
- Detect duplicate FIT content. Ask whether to replace the active activity; preserve the prior original for audit and mark it superseded.
- Activity detail displays only metrics that actually exist in the FIT; hide missing metrics, never substitute zero.
- Athlete and Coach may delete or restore activities. Confirm deletion, exclude it from analysis immediately, and retain it in a 30-day restore bin. Do not notify the athlete about a coach deletion/restoration, but audit it.
- Athlete and Coach can write, edit, or delete only their own activity comments. Team Admin without Coach role cannot comment.
- Athlete may edit an activity title from the dashboard.

## Calendar, coaching, AI, and lifecycle

- Calendar items are Athlete-private notes. They do not change analytics, load, recovery, AI, or a coaching plan. Athlete may edit or delete them.
- Training Load uses only duration minutes × Session RPE (AU) until a separately verified formula is approved. Prompt for RPE immediately after FIT import, allow deferral, and show the reminder only in Activity; latest corrected RPE is effective while audit history remains internal.
- Testing Protocol results always go to Coach for cross-check. Coach can adjust and approve Zone changes, then notify Athlete: “Your coach has updated your training zones. Please review the changes.”
- AI is enabled from the first release but begins only after FIT data covers more than 30 days, including approved backfill. Generate every Monday at 09:00 Asia/Bangkok. AI can only recommend; it never changes data. Coach reviews first, and approved items are visible to Athlete without a notification or history list.
- Suspend athletes with no FIT import for three months; for athletes with no FIT ever, count from invitation acceptance. Notify Coach and Team Admin weekly for 30 days, once only when they are the same person. Re-invite can restore the account and data during the grace period; otherwise permanently delete at day 30.
- Removing/ suspending a user frees an active-user seat immediately. Cap active users at 120 and stop new invitations when the cap is reached.

## Implementation boundary

Implement server-side authorization and tenant filtering; UI visibility is not sufficient. Preserve audit records for privileged actions and for data changes where the retention policy permits. Make any additional formula, external connector, or automated action explicit and seek approval before enabling it.
