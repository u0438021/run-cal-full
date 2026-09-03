const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

admin.initializeApp();
const db = admin.firestore();
const REGION = 'asia-southeast1';
const USERNAME = /^[A-Za-z0-9_-]{4,8}$/;
const PIN = /^\d{6}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const text = value => String(value || '').trim();
const stop = (code, message) => { throw new HttpsError(code, message); };
const account = uid => db.collection('privateAccounts').doc(uid);
const usernameIndex = username => db.collection('usernameIndex').doc(String(username).toLowerCase());

function checkCredentials(username, pin) {
  if (!USERNAME.test(String(username || ''))) stop('invalid-argument', 'Username must be 4–8 letters, numbers, - or _.');
  if (!PIN.test(String(pin || ''))) stop('invalid-argument', 'PIN must contain exactly 6 digits.');
}
function makePinHash(pin) { const salt=randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pin,salt,64).toString('hex')}`; }
function matchesPin(pin, value) { const [salt,hex]=String(value || '').split(':'); if(!salt || !hex) return false; return timingSafeEqual(scryptSync(pin,salt,64),Buffer.from(hex,'hex')); }
async function adminMember(uid) {
  const user=await db.collection('users').doc(uid).get();
  if(!user.exists || user.data().status!=='active') stop('unauthenticated','Sign in required.');
  const workspaceId=user.data().workspaceId;
  const member=await db.collection('workspaces').doc(workspaceId).collection('members').doc(uid).get();
  if(!member.exists || !(member.data().roles || []).includes('team_admin')) stop('permission-denied','Team Admin permission required.');
  return workspaceId;
}

exports.healthCheck = onRequest({ region: REGION, cors: false }, (_req, res) => res.status(200).json({ service: 'run-cal-api', status: 'ok' }));

exports.getSetupStatus = onCall({ region: REGION }, async () => ({
  setupRequired: !(await db.collection('system').doc('setup').get()).exists,
}));

exports.getBootstrap = onCall({ region: REGION }, async request => {
  if (!request.auth) stop('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const [userSnapshot, privateSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(),
    account(uid).get(),
  ]);
  if (!userSnapshot.exists || userSnapshot.data().status !== 'active') stop('unauthenticated', 'Sign in required.');
  const user = userSnapshot.data();
  const workspaceRef = db.collection('workspaces').doc(user.workspaceId);
  const [workspaceSnapshot, memberSnapshot] = await Promise.all([
    workspaceRef.get(),
    workspaceRef.collection('members').doc(uid).get(),
  ]);
  if (!workspaceSnapshot.exists || !memberSnapshot.exists) stop('permission-denied', 'Workspace access is unavailable.');
  const roles = memberSnapshot.data().roles || [];
  const members = roles.includes('team_admin')
    ? (await workspaceRef.collection('members').orderBy('displayName').get()).docs.map(doc => ({
      id: doc.id,
      displayName: doc.data().displayName,
      email: doc.data().email,
      roles: doc.data().roles || [],
      isTeamAdmin: workspaceSnapshot.data().teamAdminId === doc.id,
    }))
    : [];
  return {
    setupRequired: false,
    user: {
      id: uid,
      username: privateSnapshot.exists ? privateSnapshot.data().username : '',
      email: user.email,
      displayName: user.displayName,
    },
    workspace: {
      workspaceId: workspaceRef.id,
      workspaceName: workspaceSnapshot.data().name,
      roles,
    },
    profile: null,
    notifications: [],
    recovery: null,
    monthly: [],
    activities: [],
    athletes: [],
    members,
  };
});

exports.setupFirstWorkspace = onCall({ region: REGION }, async request => {
  const { workspaceName, displayName, email, username, pin } = request.data || {};
  checkCredentials(username,pin);
  if(!text(workspaceName) || !text(displayName) || !/^\S+@\S+\.\S+$/.test(String(email || ''))) stop('invalid-argument','Complete team name, display name and email.');
  if((await db.collection('system').doc('setup').get()).exists) stop('already-exists','Initial setup is already complete.');
  if((await usernameIndex(username).get()).exists) stop('already-exists','Username is already in use.');
  const uid=randomUUID(), workspaceId=randomUUID(), normalizedEmail=String(email).trim().toLowerCase();
  await admin.auth().createUser({uid,email:normalizedEmail,displayName:text(displayName)});
  const batch=db.batch(), serverTime=admin.firestore.FieldValue.serverTimestamp();
  batch.set(db.collection('system').doc('setup'),{workspaceId,createdAt:serverTime});
  batch.set(db.collection('workspaces').doc(workspaceId),{name:text(workspaceName),teamAdminId:uid,createdAt:serverTime});
  batch.set(db.collection('workspaces').doc(workspaceId).collection('members').doc(uid),{roles:['team_admin'],displayName:text(displayName),email:normalizedEmail,createdAt:serverTime});
  batch.set(db.collection('users').doc(uid),{displayName:text(displayName),email:normalizedEmail,workspaceId,status:'active',createdAt:serverTime});
  batch.set(account(uid),{username:String(username),pinHash:makePinHash(String(pin)),failedAttempts:0,lockedAt:null,createdAt:serverTime});
  batch.set(usernameIndex(username),{uid}); await batch.commit();
  return {token:await admin.auth().createCustomToken(uid),workspaceId};
});

exports.loginWithUsernamePin = onCall({ region: REGION }, async request => {
  const { username,pin }=request.data || {}; checkCredentials(username,pin);
  const index=await usernameIndex(username).get(); if(!index.exists) stop('unauthenticated','Invalid username or PIN.');
  const ref=account(index.data().uid), found=await ref.get(); if(!found.exists) stop('unauthenticated','Invalid username or PIN.');
  const data=found.data(); if(data.lockedAt) stop('failed-precondition','This account is locked. Reset PIN is required.');
  if(!matchesPin(String(pin),data.pinHash)) { const attempts=Number(data.failedAttempts || 0)+1; await ref.update({failedAttempts:attempts,lockedAt:attempts>=5?admin.firestore.FieldValue.serverTimestamp():null}); stop(attempts>=5?'failed-precondition':'unauthenticated',attempts>=5?'Account locked. Reset PIN is required.':'Invalid username or PIN.'); }
  await ref.update({failedAttempts:0,lockedAt:null,lastLoginAt:admin.firestore.FieldValue.serverTimestamp()});
  return {token:await admin.auth().createCustomToken(index.data().uid)};
});

exports.createInvite = onCall({ region: REGION }, async request => {
  if(!request.auth) stop('unauthenticated','Sign in required.'); const workspaceId=await adminMember(request.auth.uid);
  const { email,role='athlete' }=request.data || {}; if(!/^\S+@\S+\.\S+$/.test(String(email || '')) || !['athlete','coach'].includes(role)) stop('invalid-argument','Valid email and role are required.');
  const token=randomBytes(24).toString('base64url'), id=hash(token), expiresAt=admin.firestore.Timestamp.fromMillis(Date.now()+3600000);
  await db.collection('workspaces').doc(workspaceId).collection('invites').doc(id).set({email:String(email).toLowerCase(),roles:[role],status:'pending',expiresAt,invitedBy:request.auth.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  // Gmail delivery is added only after OAuth secrets are configured.
  return {inviteToken:token,expiresInMinutes:60};
});

exports.acceptInvite = onCall({ region: REGION }, async request => {
  const { inviteToken,displayName,username,pin }=request.data || {}; checkCredentials(username,pin); if(!text(displayName)) stop('invalid-argument','Display name is required.');
  if(!text(inviteToken)) stop('invalid-argument','Invitation is invalid or expired.');
  const invitations=await db.collectionGroup('invites').where(admin.firestore.FieldPath.documentId(),'==',hash(String(inviteToken))).get(); if(invitations.empty) stop('not-found','Invitation is invalid or expired.');
  const invite=invitations.docs[0], data=invite.data(); if(data.status!=='pending' || data.expiresAt.toMillis()<Date.now()) stop('failed-precondition','Invitation is invalid or expired.'); if((await usernameIndex(username).get()).exists) stop('already-exists','Username is already in use.');
  const uid=randomUUID(), workspaceId=invite.ref.parent.parent.id, serverTime=admin.firestore.FieldValue.serverTimestamp(); await admin.auth().createUser({uid,email:data.email,displayName:text(displayName)}); const batch=db.batch();
  batch.update(invite.ref,{status:'accepted',acceptedAt:serverTime}); batch.set(db.collection('users').doc(uid),{displayName:text(displayName),email:data.email,workspaceId,status:'active',createdAt:serverTime}); batch.set(db.collection('workspaces').doc(workspaceId).collection('members').doc(uid),{roles:data.roles,displayName:text(displayName),email:data.email,createdAt:serverTime}); batch.set(account(uid),{username:String(username),pinHash:makePinHash(String(pin)),failedAttempts:0,lockedAt:null,createdAt:serverTime}); batch.set(usernameIndex(username),{uid}); await batch.commit(); return {token:await admin.auth().createCustomToken(uid)};
});
