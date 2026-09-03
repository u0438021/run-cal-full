import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const dist = join(root, 'dist')
const dataDir = resolve(process.env.RUN_CAL_DATA_DIR || join(root, 'data'))
const uploadDir = join(dataDir, 'fit-originals')
mkdirSync(uploadDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'run-cal.sqlite'))

db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, pin_hash TEXT NOT NULL, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', failed_attempts INTEGER NOT NULL DEFAULT 0, locked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, team_admin_id TEXT UNIQUE, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, roles TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id,user_id));
  CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, roles TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', invited_by TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS email_actions (id TEXT PRIMARY KEY, user_id TEXT, email TEXT NOT NULL, action_type TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admin_transfers (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS team_email_connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_user_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'disconnected', encrypted_secret TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
  CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, workspace_id TEXT, actor_id TEXT, action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS athlete_profiles (user_id TEXT PRIMARY KEY, emergency_name TEXT NOT NULL, emergency_relation TEXT NOT NULL, emergency_phone TEXT NOT NULL, sport_goal TEXT NOT NULL, experience_years INTEGER NOT NULL, experience_note TEXT NOT NULL DEFAULT '', uses_stryd INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recovery_checkins (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, athlete_id TEXT NOT NULL, sleep INTEGER NOT NULL, energy INTEGER NOT NULL, soreness INTEGER NOT NULL, stress INTEGER NOT NULL, mood INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', checkin_date TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id,athlete_id,checkin_date));
  CREATE TABLE IF NOT EXISTS monthly_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, athlete_id TEXT NOT NULL, month TEXT NOT NULL, weight_kg REAL NOT NULL, cp_watts REAL, wkg REAL, comment TEXT NOT NULL DEFAULT '', coach_reply TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(workspace_id,athlete_id,month));
  CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, href TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, athlete_id TEXT NOT NULL, title TEXT NOT NULL, activity_date TEXT NOT NULL, original_name TEXT NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL, UNIQUE(workspace_id,athlete_id,sha256));
  CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,read_at,created_at);
`)

const now = () => new Date().toISOString()
const isoDay = () => now().slice(0, 10)
const tokenHash = token => createHash('sha256').update(token).digest('hex')
const hashPin = pin => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pin, salt, 64).toString('hex')}` }
const verifyPin = (pin, stored) => { const [salt, hash] = stored.split(':'); const next = scryptSync(pin, salt, 64); return timingSafeEqual(next, Buffer.from(hash, 'hex')) }
const json = (res, status, value, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value)) }
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const readBody = (req, max = 1_000_000) => new Promise((resolveBody, reject) => { const chunks=[]; let size=0; req.on('data', c => { size += c.length; if(size > max) { reject(fail('Payload too large',413)); req.destroy() } else chunks.push(c) }); req.on('end',()=>resolveBody(Buffer.concat(chunks))); req.on('error',reject) })
const bodyJson = async req => { try { return JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { throw fail('Invalid JSON') } }
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => { const i=part.indexOf('='); return [part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1))] }))
const roleList = value => String(value || '').split(',').filter(Boolean)
const validUsername = username => /^[A-Za-z0-9_-]{4,8}$/.test(username)
const validPin = pin => /^\d{6}$/.test(pin)
const sessionCookie = token => `run_cal_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV==='production'?'; Secure':''}`
const clearCookie = 'run_cal_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
const actionExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
function audit(workspaceId, actorId, action, objectType, objectId, metadata = {}) { db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),workspaceId || null,actorId || null,action,objectType,objectId || null,JSON.stringify(metadata),now()) }
function createEmailAction(userId, email, actionType) { const token=randomBytes(24).toString('base64url'); db.prepare('INSERT INTO email_actions VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),userId || null,String(email).toLowerCase(),actionType,tokenHash(token),actionExpiry(),null,now()); return token }
function getAction(token, type) { const row=db.prepare('SELECT * FROM email_actions WHERE token_hash=? AND action_type=?').get(tokenHash(token),type); if(!row || row.used_at || new Date(row.expires_at) < new Date()) throw fail('This link is invalid or has expired',410); return row }
const publicUrl = () => String(process.env.RUN_CAL_PUBLIC_URL || '').replace(/\/$/, '')
async function sendTransactionalEmail(to, subject, text) {
  const webhook=String(process.env.RUN_CAL_EMAIL_WEBHOOK_URL || '')
  if(!webhook || !publicUrl()) return false
  const response=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromName:'RUN|CAL',to,subject,text})})
  if(!response.ok) throw fail('Email delivery failed. Please try again later.',502)
  return true
}

function currentUser(req) {
  const token = cookies(req).run_cal_session
  if (!token) throw fail('Sign in required',401)
  const user = db.prepare(`SELECT u.id,u.username,u.email,u.display_name AS displayName,u.status,s.id AS sessionId,s.last_seen_at AS lastSeenAt
    FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(tokenHash(token))
  if (!user || user.status !== 'active') throw fail('Sign in required',401)
  db.prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=?').run(now(),user.sessionId)
  return user
}
function membership(userId) {
  const row = db.prepare(`SELECT m.workspace_id AS workspaceId,m.roles,w.name AS workspaceName,w.team_admin_id AS teamAdminId FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? LIMIT 1`).get(userId)
  if (!row) throw fail('No workspace membership',403)
  return { ...row, roles: roleList(row.roles) }
}
function requireRole(user, required) { const member=membership(user.id); if(!member.roles.includes(required)) throw fail('Insufficient permission',403); return member }
function notification(userId,title,body,href='') { db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?,?)').run(randomUUID(),userId,title,body,href,null,now()) }
function appState(user) {
  const member=membership(user.id)
  const profile=db.prepare('SELECT emergency_name AS emergencyName,emergency_relation AS emergencyRelation,emergency_phone AS emergencyPhone,sport_goal AS sportGoal,experience_years AS experienceYears,experience_note AS experienceNote,uses_stryd AS usesStryd FROM athlete_profiles WHERE user_id=?').get(user.id) || null
  const notifications=db.prepare('SELECT id,title,body,href,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(user.id)
  const recovery=db.prepare('SELECT sleep,energy,soreness,stress,mood,note,checkin_date AS checkinDate FROM recovery_checkins WHERE workspace_id=? AND athlete_id=? ORDER BY checkin_date DESC LIMIT 1').get(member.workspaceId,user.id) || null
  const monthly=db.prepare('SELECT id,month,weight_kg AS weightKg,cp_watts AS cpWatts,wkg,comment,coach_reply AS coachReply,created_at AS createdAt FROM monthly_logs WHERE workspace_id=? AND athlete_id=? ORDER BY month DESC LIMIT 12').all(member.workspaceId,user.id)
  const activities=db.prepare('SELECT id,title,activity_date AS activityDate,original_name AS originalName,byte_size AS byteSize,deleted_at AS deletedAt FROM activities WHERE workspace_id=? AND athlete_id=? ORDER BY activity_date DESC LIMIT 40').all(member.workspaceId,user.id)
  const athletes=member.roles.includes('coach') ? db.prepare(`SELECT u.id,u.display_name AS displayName FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND instr(m.roles,'athlete')>0 ORDER BY u.display_name`).all(member.workspaceId) : []
  const members=member.roles.includes('team_admin') ? db.prepare(`SELECT u.id,u.display_name AS displayName,u.email,m.roles,w.team_admin_id AS teamAdminId FROM memberships m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? ORDER BY u.display_name`).all(member.workspaceId).map(x => ({...x,roles:roleList(x.roles),isTeamAdmin:x.id===x.teamAdminId})) : []
  return { user, workspace: member, profile, notifications, recovery, monthly, activities, athletes, members, setupRequired: false }
}

async function api(req,res,url) {
  if (req.method==='GET' && url.pathname==='/api/setup/status') return json(res,200,{setupRequired:!db.prepare('SELECT 1 FROM workspaces LIMIT 1').get()})
  if (req.method==='POST' && url.pathname==='/api/setup') {
    if(db.prepare('SELECT 1 FROM workspaces LIMIT 1').get()) throw fail('Setup is already complete',409)
    const x=await bodyJson(req); if(!validUsername(x.username)||!validPin(x.pin)||!x.email||!x.displayName||!x.workspaceName) throw fail('Complete all fields. Username: 4–8 characters; PIN: 6 digits.')
    const userId=randomUUID(), workspaceId=randomUUID(), created=now()
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(userId,x.username,hashPin(x.pin),String(x.email).toLowerCase(),String(x.displayName).trim(),'active',0,null,created)
    db.prepare('INSERT INTO workspaces VALUES(?,?,?,?)').run(workspaceId,String(x.workspaceName).trim(),userId,created)
    db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(randomUUID(),workspaceId,userId,'team_admin',created)
    const token=randomBytes(32).toString('base64url'); db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(randomUUID(),userId,tokenHash(token),created,created)
    return json(res,201,{ok:true},{'set-cookie':sessionCookie(token)})
  }
  if(req.method==='POST' && url.pathname==='/api/auth/login') {
    const x=await bodyJson(req); const user=db.prepare('SELECT * FROM users WHERE username=?').get(String(x.username||''))
    if(!user || user.status!=='active') throw fail('Invalid username or PIN',401)
    if(user.locked_at) throw fail('This account is locked. Reset PIN is required.',423)
    if(!validPin(x.pin)||!verifyPin(x.pin,user.pin_hash)) { const attempts=user.failed_attempts+1; db.prepare('UPDATE users SET failed_attempts=?,locked_at=? WHERE id=?').run(attempts,attempts>=5?now():null,user.id); throw fail(attempts>=5?'Account locked. Reset PIN is required.':'Invalid username or PIN',attempts>=5?423:401) }
    db.prepare('UPDATE users SET failed_attempts=0,locked_at=NULL WHERE id=?').run(user.id)
    const previous=db.prepare('SELECT id FROM auth_sessions WHERE user_id=? ORDER BY created_at ASC').all(user.id); if(previous.length>=2) db.prepare('DELETE FROM auth_sessions WHERE id=?').run(previous[0].id)
    const token=randomBytes(32).toString('base64url'); db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(randomUUID(),user.id,tokenHash(token),now(),now())
    return json(res,200,{ok:true},{'set-cookie':sessionCookie(token)})
  }
  if(req.method==='POST' && url.pathname==='/api/auth/logout') { const token=cookies(req).run_cal_session; if(token) db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash(token)); return json(res,200,{ok:true},{'set-cookie':clearCookie}) }
  if(req.method==='POST' && url.pathname==='/api/account/username/request') {
    const x=await bodyJson(req), email=String(x.email||'').trim().toLowerCase(), user=db.prepare('SELECT id,email FROM users WHERE email=? AND status=?').get(email,'active'); if(user) { const token=createEmailAction(user.id,user.email,'username_lookup'); await sendTransactionalEmail(user.email,'RUN|CAL username lookup',`Open this link within one hour to view your Username: ${publicUrl()}/?username=${token}`) }; return json(res,202,{ok:true,message:'If this email is registered, a verification link has been sent.'})
  }
  if(req.method==='POST' && url.pathname==='/api/account/username/verify') {
    const x=await bodyJson(req), action=getAction(String(x.token||''),'username_lookup'), user=db.prepare('SELECT username FROM users WHERE id=?').get(action.user_id); db.prepare('UPDATE email_actions SET used_at=? WHERE id=?').run(now(),action.id); return json(res,200,{username:user.username})
  }
  if(req.method==='POST' && url.pathname==='/api/account/pin-reset/request') {
    const x=await bodyJson(req), email=String(x.email||'').trim().toLowerCase(), user=db.prepare('SELECT id,email FROM users WHERE email=? AND status=?').get(email,'active'); if(user) { const token=createEmailAction(user.id,user.email,'pin_reset'); await sendTransactionalEmail(user.email,'RUN|CAL PIN reset',`Open this link within one hour to reset your PIN: ${publicUrl()}/?reset=${token}`) }; return json(res,202,{ok:true,message:'If this email is registered, a reset link has been sent.'})
  }
  if(req.method==='POST' && url.pathname==='/api/account/pin-reset/confirm') {
    const x=await bodyJson(req), action=getAction(String(x.token||''),'pin_reset'); if(!validPin(x.pin)) throw fail('PIN must contain exactly 6 digits'); db.prepare('UPDATE users SET pin_hash=?,failed_attempts=0,locked_at=NULL WHERE id=?').run(hashPin(x.pin),action.user_id); db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(action.user_id); db.prepare('UPDATE email_actions SET used_at=? WHERE id=?').run(now(),action.id); audit(null,action.user_id,'pin_reset','user',action.user_id); return json(res,200,{ok:true})
  }
  if(req.method==='POST' && url.pathname==='/api/invitations/accept') {
    const x=await bodyJson(req), token=String(x.token||''), invite=db.prepare('SELECT * FROM invitations WHERE token_hash=?').get(tokenHash(token)); if(!invite || invite.status!=='pending' || new Date(invite.expires_at)<new Date()) throw fail('This invitation is invalid or has expired',410)
    if(!validUsername(x.username)||!validPin(x.pin)||!String(x.displayName||'').trim()) throw fail('Complete all fields. Username: 4–8 characters; PIN: 6 digits.')
    if(db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(x.username,invite.email)) throw fail('Username or email is already in use',409)
    const active=db.prepare("SELECT count(*) AS n FROM users WHERE status='active'").get().n; if(active>=120) throw fail('The 120 active-user limit has been reached',409)
    const userId=randomUUID(), created=now(); db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(userId,x.username,hashPin(x.pin),invite.email,String(x.displayName).trim(),'active',0,null,created); db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run(randomUUID(),invite.workspace_id,userId,invite.roles,created); db.prepare("UPDATE invitations SET status='accepted' WHERE id=?").run(invite.id)
    const tokenOut=randomBytes(32).toString('base64url'); db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(randomUUID(),userId,tokenHash(tokenOut),created,created)
    return json(res,201,{ok:true},{'set-cookie':sessionCookie(tokenOut)})
  }
  const user=currentUser(req)
  if(req.method==='GET' && url.pathname==='/api/bootstrap') return json(res,200,appState(user))
  if(req.method==='PUT' && url.pathname==='/api/profile') {
    const x=await bodyJson(req); const fields=['emergencyName','emergencyRelation','emergencyPhone','sportGoal']; if(fields.some(k=>!String(x[k]||'').trim())||!Number.isInteger(Number(x.experienceYears))||Number(x.experienceYears)<0) throw fail('Complete all required profile fields')
    const member=membership(user.id); if(!member.roles.includes('athlete')) throw fail('Only athletes can edit this profile',403)
    db.prepare(`INSERT INTO athlete_profiles VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET emergency_name=excluded.emergency_name,emergency_relation=excluded.emergency_relation,emergency_phone=excluded.emergency_phone,sport_goal=excluded.sport_goal,experience_years=excluded.experience_years,experience_note=excluded.experience_note,uses_stryd=excluded.uses_stryd,updated_at=excluded.updated_at`).run(user.id,x.emergencyName.trim(),x.emergencyRelation.trim(),x.emergencyPhone.trim(),x.sportGoal.trim(),Number(x.experienceYears),String(x.experienceNote||''),x.usesStryd?1:0,now(),now())
    return json(res,200,{ok:true})
  }
  if(req.method==='POST' && url.pathname==='/api/recovery') {
    const x=await bodyJson(req), member=requireRole(user,'athlete'), keys=['sleep','energy','soreness','stress','mood']; if(keys.some(k=>!Number.isInteger(Number(x[k]))||Number(x[k])<1||Number(x[k])>5)) throw fail('All recovery scores must be 1–5')
    db.prepare(`INSERT INTO recovery_checkins VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,athlete_id,checkin_date) DO UPDATE SET sleep=excluded.sleep,energy=excluded.energy,soreness=excluded.soreness,stress=excluded.stress,mood=excluded.mood,note=excluded.note,created_at=excluded.created_at`).run(randomUUID(),member.workspaceId,user.id,...keys.map(k=>Number(x[k])),String(x.note||''),isoDay(),now())
    return json(res,201,{ok:true})
  }
  if(req.method==='POST' && url.pathname==='/api/monthly-log') {
    const x=await bodyJson(req), member=requireRole(user,'athlete'), month=/^\d{4}-\d{2}$/.test(x.month)?x.month:now().slice(0,7); if(!Number.isFinite(Number(x.weightKg))||Number(x.weightKg)<=0) throw fail('Weight is required')
    const stryd=!!db.prepare('SELECT uses_stryd FROM athlete_profiles WHERE user_id=?').get(user.id)?.uses_stryd; if(stryd && (!Number.isFinite(Number(x.cpWatts))||!Number.isFinite(Number(x.wkg)))) throw fail('CP and W/kg are required for Stryd athletes')
    const exists=db.prepare('SELECT 1 FROM monthly_logs WHERE workspace_id=? AND athlete_id=? AND month=?').get(member.workspaceId,user.id,month); if(exists) throw fail('This monthly log is already locked',409)
    db.prepare('INSERT INTO monthly_logs VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),member.workspaceId,user.id,month,Number(x.weightKg),stryd?Number(x.cpWatts):null,stryd?Number(x.wkg):null,String(x.comment||''),'',now())
    const coach=db.prepare(`SELECT m.user_id AS id FROM memberships m WHERE m.workspace_id=? AND instr(m.roles,'coach')>0`).get(member.workspaceId); if(coach) notification(coach.id,'New monthly log',`${user.displayName} added a monthly log.`,'/monthly')
    return json(res,201,{ok:true})
  }
  if(req.method==='POST' && url.pathname==='/api/fit-files') {
    const member=requireRole(user,'athlete'), original=decodeURIComponent(req.headers['x-file-name']||'activity.fit').replace(/[\\/]/g,'_'); if(extname(original).toLowerCase()!=='.fit') throw fail('Only .FIT files are accepted',415)
    const bytes=await readBody(req,50*1024*1024); if(!bytes.length) throw fail('File is empty'); const sha=createHash('sha256').update(bytes).digest('hex'); const duplicate=db.prepare('SELECT id FROM activities WHERE workspace_id=? AND athlete_id=? AND sha256=?').get(member.workspaceId,user.id,sha); if(duplicate) throw fail('Duplicate FIT file',409)
    const id=randomUUID(); writeFileSync(join(uploadDir,`${id}.fit`),bytes,{flag:'wx'}); db.prepare('INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,member.workspaceId,user.id,original.replace(/\.fit$/i,''),isoDay(),original,sha,bytes.length,null,now())
    for(const coach of db.prepare(`SELECT m.user_id AS id FROM memberships m WHERE m.workspace_id=? AND (instr(m.roles,'coach')>0 OR instr(m.roles,'team_admin')>0)`).all(member.workspaceId)) if(coach.id!==user.id) notification(coach.id,'FIT imported',`${user.displayName} imported ${original}.`,'/activities')
    return json(res,201,{id,originalName:original})
  }
  if(req.method==='POST' && url.pathname==='/api/invitations') {
    const member=requireRole(user,'team_admin'), x=await bodyJson(req); const roles=roleList(x.roles); if(!x.email||!roles.every(r=>['athlete','coach'].includes(r))||!roles.length) throw fail('Email and Athlete or Coach role are required')
    const active=db.prepare("SELECT count(*) AS n FROM users WHERE status='active'").get().n; if(active>=120) throw fail('The 120 active-user limit has been reached',409)
    const token=randomBytes(24).toString('base64url'), created=now(), recipient=String(x.email).toLowerCase(); if(!publicUrl() || !process.env.RUN_CAL_EMAIL_WEBHOOK_URL) throw fail('Email delivery is not configured on this host',503); await sendTransactionalEmail(recipient,'You are invited to RUN|CAL',`Open this link within one hour to create your account: ${publicUrl()}/?invite=${token}`); const inviteId=randomUUID(); db.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?,?)').run(inviteId,member.workspaceId,recipient,roles.join(','),tokenHash(token),new Date(Date.now()+3600000).toISOString(),'pending',user.id,created)
    return json(res,201,{ok:true,expiresInMinutes:60,delivery:'Invitation email sent.'})
  }
  if(req.method==='POST' && url.pathname.startsWith('/api/invitations/') && url.pathname.endsWith('/cancel')) {
    const member=requireRole(user,'team_admin'), id=url.pathname.split('/')[3], invitation=db.prepare('SELECT id FROM invitations WHERE id=? AND workspace_id=? AND status=?').get(id,member.workspaceId,'pending'); if(!invitation) throw fail('Pending invitation not found',404); db.prepare("UPDATE invitations SET status='cancelled' WHERE id=?").run(id); audit(member.workspaceId,user.id,'invite_cancelled','invitation',id); return json(res,200,{ok:true})
  }
  if(req.method==='POST' && url.pathname==='/api/team-admin/transfer/start') {
    const member=requireRole(user,'team_admin'), x=await bodyJson(req); if(!validPin(x.pin)||!verifyPin(x.pin,db.prepare('SELECT pin_hash FROM users WHERE id=?').get(user.id).pin_hash)) throw fail('PIN confirmation failed',401); const target=db.prepare('SELECT user_id AS userId FROM memberships WHERE workspace_id=? AND user_id=?').get(member.workspaceId,String(x.toUserId||'')); if(!target || target.userId===user.id) throw fail('Choose another team member',422)
    const token=randomBytes(24).toString('base64url'), transferId=randomUUID(); db.prepare('INSERT INTO admin_transfers VALUES(?,?,?,?,?,?,?,?)').run(transferId,member.workspaceId,user.id,target.userId,tokenHash(token),actionExpiry(),'pending',now()); notification(target.userId,'Team Admin transfer',`${user.displayName} asked you to accept Team Admin responsibility.`, `/team?transfer=${transferId}`); audit(member.workspaceId,user.id,'team_admin_transfer_requested','user',target.userId); return json(res,201,{ok:true,expiresInMinutes:60,transferId,transferToken:'Not required; the recipient accepts from Notifications.'})
  }
  if(req.method==='POST' && url.pathname==='/api/team-admin/transfer/accept') {
    const x=await bodyJson(req), transfer=db.prepare('SELECT * FROM admin_transfers WHERE id=?').get(String(x.transferId||'')); if(!transfer || transfer.status!=='pending' || new Date(transfer.expires_at)<new Date()) throw fail('This transfer is invalid or has expired',410); if(transfer.to_user_id!==user.id) throw fail('This transfer is for another account',403)
    const former=db.prepare('SELECT roles FROM memberships WHERE workspace_id=? AND user_id=?').get(transfer.workspace_id,transfer.from_user_id); const recipient=db.prepare('SELECT roles FROM memberships WHERE workspace_id=? AND user_id=?').get(transfer.workspace_id,user.id); const formerRoles=roleList(former.roles).filter(r=>r!=='team_admin'); const newRoles=Array.from(new Set([...roleList(recipient.roles),'team_admin']))
    db.prepare('UPDATE memberships SET roles=? WHERE workspace_id=? AND user_id=?').run(formerRoles.join(','),transfer.workspace_id,transfer.from_user_id); db.prepare('UPDATE memberships SET roles=? WHERE workspace_id=? AND user_id=?').run(newRoles.join(','),transfer.workspace_id,user.id); db.prepare('UPDATE workspaces SET team_admin_id=? WHERE id=?').run(user.id,transfer.workspace_id); db.prepare('UPDATE team_email_connections SET status=?,revoked_at=? WHERE workspace_id=? AND owner_user_id=? AND revoked_at IS NULL').run('revoked',now(),transfer.workspace_id,transfer.from_user_id); db.prepare("UPDATE admin_transfers SET status='accepted' WHERE id=?").run(transfer.id); audit(transfer.workspace_id,user.id,'team_admin_transfer_accepted','user',user.id); return json(res,200,{ok:true})
  }
  if(req.method==='POST' && url.pathname.startsWith('/api/notifications/') && url.pathname.endsWith('/read')) { const id=url.pathname.split('/')[3]; db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(now(),id,user.id); return json(res,200,{ok:true}) }
  throw fail('Not found',404)
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}
const server=createServer(async(req,res)=>{ try { const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); if(url.pathname.startsWith('/api/')) return await api(req,res,url); const requested=normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''); let file=join(dist,requested==='/'?'index.html':requested); if(!file.startsWith(dist)||!existsSync(file)||statSync(file).isDirectory()) file=join(dist,'index.html'); res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'}); createReadStream(file).pipe(res) } catch(error) { json(res,error.status||500,{error:error.message||'Internal server error'}) } })
server.listen(Number(process.env.PORT||8787),process.env.HOST||'0.0.0.0',()=>console.log(`RUN|CAL listening on http://localhost:${process.env.PORT||8787}`))
