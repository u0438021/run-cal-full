# Multi-Tenant Workspaces and Permissions

## Isolation model

Workspace is the tenant boundary. A user may belong to multiple workspaces and uses an explicit workspace switcher. A coach may have different roles/assignments in each workspace. Membership alone does not grant athlete access unless the role policy does; coach access additionally requires an active assignment.

## Access matrix

| Resource/action | Athlete | Coach | Workspace Admin | Platform Operator |
|---|---|---|---|---|
| Own profile/data | read/edit scoped fields | assigned read; edits by policy | workspace read/edit | no content by default |
| Other athletes | no | assigned only | authorized workspace athletes | no content by default |
| Plan/comment/message | own participate | assigned create/edit/review | workspace policy | no |
| Membership/assignment | no | no | manage workspace | operational only |
| PIN | change own | never view | reset only | reset/support only, never view |
| Originals | own authorized download if policy allows | assigned authorized | workspace policy | audited break-glass only |

## Athlete movement

Do not silently “move” ownership. End the old `workspace_athletes` membership and create a new one. Apply an explicit transfer policy:

- default: prior workspace retains records it lawfully created/owns; new workspace starts with athlete-approved shared baseline or copy;
- transfer: copy/export selected records with athlete/admin authorization and an audit trail;
- never expose old workspace content merely because the same athlete joins another workspace.

Exact legal ownership/retention must be finalized before production.

## Verify permissions checklist

Test cross-workspace ID guessing, list/search aggregation, object downloads, messages, exports, background jobs, AI snapshot retrieval, and admin support. Test users with multiple roles and expired memberships/assignments. Deny by default and audit elevated access.

