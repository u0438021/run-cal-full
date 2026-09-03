const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();
const REGION = 'asia-southeast1';
const GMAIL_FROM = defineSecret('RUN_CAL_GMAIL_FROM');
const GMAIL_APP_PASSWORD = defineSecret('RUN_CAL_GMAIL_APP_PASSWORD');
const PUBLIC_URL = 'https://run-cal-th.web.app';
const USERNAME = /^[A-Za-z0-9_-]{4,8}$/;
const PIN = /^\d{6}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const text = value => String(value || '').trim();
const stop = (code, message) => { throw new HttpsError(code, message); };
const account = uid => db.collection('privateAccounts').doc(uid);
const usernameIndex = username => db.collection('usernameIndex').doc(String(username).toLowerCase());
const athlete = (workspaceId, uid) => db.collection('workspaces').doc(workspaceId).collection('athletes').doc(uid);
const dayInBangkok = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {});
const today = () => { const day = dayInBangkok(); return `${day.year}-${day.month}-${day.day}`; };
const fitUploadId = value => /^[0-9a-f-]{36}$/i.test(String(value || ''));
const GARMIN_FIT_SDK_VERSION = '21.214.0';

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
async function activeMember(uid) {
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists || user.data().status !== 'active') stop('unauthenticated', 'Sign in required.');
  const workspaceId = user.data().workspaceId;
  const member = await db.collection('workspaces').doc(workspaceId).collection('members').doc(uid).get();
  if (!member.exists) stop('permission-denied', 'Workspace access is unavailable.');
  return { workspaceId, user: user.data(), roles: member.data().roles || [] };
}
async function athleteMember(request) {
  if (!request.auth) stop('unauthenticated', 'Sign in required.');
  const membership = await activeMember(request.auth.uid);
  if (!membership.roles.includes('athlete')) stop('permission-denied', 'Athlete permission required.');
  return { ...membership, uid: request.auth.uid };
}
function boundedText(value, max, field, required = false) {
  const result = text(value);
  if (required && !result) stop('invalid-argument', `${field} is required.`);
  if (result.length > max) stop('invalid-argument', `${field} is too long.`);
  return result;
}
function gmailConfig() {
  const from = String(GMAIL_FROM.value() || '').trim();
  const appPassword = String(GMAIL_APP_PASSWORD.value() || '').replace(/\s/g, '');
  if (!/^\S+@\S+\.\S+$/.test(from) || !/^[A-Za-z0-9]{16}$/.test(appPassword)) stop('failed-precondition', 'Gmail delivery is not configured.');
  return { from, appPassword };
}
async function sendEmail({ to, subject, text, idempotencyKey }) {
  const config = gmailConfig();
  try {
    await nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.from, pass: config.appPassword },
    }).sendMail({
      from: `RUN|CAL <${config.from}>`,
      to,
      subject,
      text,
      messageId: `<${idempotencyKey}@run-cal-th.firebaseapp.com>`,
    });
  } catch {
    stop('internal', 'Email delivery failed. Please try again later.');
  }
}
async function issueAccountToken({ purpose, uid, email }) {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hash(rawToken);
  await db.collection('accountTokens').doc(tokenHash).create({
    purpose,
    uid,
    email,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000),
    usedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return rawToken;
}
async function allowRecoveryEmail(email, purpose) {
  const ref = db.collection('accountRecoveryRate').doc(hash(`${purpose}:${email}`));
  return db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    const lastRequested = current.exists ? current.data().requestedAt : null;
    if (lastRequested && Date.now() - lastRequested.toMillis() < 60000) return false;
    transaction.set(ref, { requestedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}
async function parseRunningFit(bytes) {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const stream = Stream.fromBuffer(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT() || !decoder.checkIntegrity()) stop('invalid-argument', 'The FIT file failed integrity validation.');
  const { messages, errors } = decoder.read({ includeUnknownData: false });
  if (errors.length) stop('invalid-argument', 'The FIT file could not be decoded.');
  const session = messages.sessionMesgs?.[0];
  if (!session || String(session.sport || '').toLowerCase() !== 'running') stop('invalid-argument', 'Only running FIT activities are accepted.');
  const records = messages.recordMesgs || [];
  const start = session.startTime instanceof Date ? session.startTime : session.timestamp instanceof Date ? session.timestamp : null;
  if (!start || Number.isNaN(start.getTime())) stop('invalid-argument', 'The FIT file has no valid activity start time.');
  const has = field => records.some(record => record[field] !== undefined && record[field] !== null);
  return {
    activityDate: start.toISOString().slice(0, 10),
    summary: {
      startTime: start.toISOString(),
      totalDistanceM: Number.isFinite(session.totalDistance) ? session.totalDistance : null,
      totalTimerTimeS: Number.isFinite(session.totalTimerTime) ? session.totalTimerTime : null,
      totalElapsedTimeS: Number.isFinite(session.totalElapsedTime) ? session.totalElapsedTime : null,
      avgHeartRate: Number.isFinite(session.avgHeartRate) ? session.avgHeartRate : null,
      maxHeartRate: Number.isFinite(session.maxHeartRate) ? session.maxHeartRate : null,
      avgPower: Number.isFinite(session.avgPower) ? session.avgPower : null,
      maxPower: Number.isFinite(session.maxPower) ? session.maxPower : null,
    },
    dataAvailability: {
      gps: has('positionLat') && has('positionLong'),
      heartRate: has('heartRate'),
      power: has('power'),
      cadence: has('cadence'),
      recordCount: records.length,
    },
  };
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
  const [workspaceSnapshot, memberSnapshot, notificationsSnapshot] = await Promise.all([
    workspaceRef.get(),
    workspaceRef.collection('members').doc(uid).get(),
    workspaceRef.collection('notifications').where('userId', '==', uid).limit(50).get(),
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
  const athleteRef = athlete(workspaceRef.id, uid);
  const [profileSnapshot, recoverySnapshot, monthlySnapshot, activitiesSnapshot] = roles.includes('athlete')
    ? await Promise.all([
      athleteRef.get(),
      athleteRef.collection('recovery').doc(today()).get(),
      athleteRef.collection('monthly').orderBy('month', 'desc').limit(24).get(),
      athleteRef.collection('activities').orderBy('createdAt', 'desc').limit(100).get(),
    ])
    : [null, null, null, null];
  const profileData = profileSnapshot?.exists ? profileSnapshot.data() : null;
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
    profile: profileData ? {
      emergencyName: profileData.emergencyName,
      emergencyRelation: profileData.emergencyRelation,
      emergencyPhone: profileData.emergencyPhone,
      sportGoal: profileData.sportGoal,
      experienceYears: profileData.experienceYears,
      experienceNote: profileData.experienceNote,
      usesStryd: profileData.usesStryd ? 1 : 0,
    } : null,
    notifications: notificationsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))
      .map(notification => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        href: notification.href || '',
        readAt: notification.readAt?.toDate?.().toISOString?.() || null,
        createdAt: notification.createdAt?.toDate?.().toISOString?.() || '',
      })),
    recovery: recoverySnapshot?.exists ? recoverySnapshot.data() : null,
    monthly: monthlySnapshot ? monthlySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [],
    activities: activitiesSnapshot ? activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [],
    athletes: [],
    members,
  };
});

exports.saveProfile = onCall({ region: REGION }, async request => {
  const { workspaceId, uid } = await athleteMember(request);
  const data = request.data || {};
  const experienceYears = Number(data.experienceYears);
  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 100) stop('invalid-argument', 'Experience years must be a whole number from 0 to 100.');
  await athlete(workspaceId, uid).set({
    emergencyName: boundedText(data.emergencyName, 120, 'Emergency contact name', true),
    emergencyRelation: boundedText(data.emergencyRelation, 80, 'Relationship', true),
    emergencyPhone: boundedText(data.emergencyPhone, 40, 'Emergency contact phone', true),
    sportGoal: boundedText(data.sportGoal, 1000, 'Sport goal', true),
    experienceYears,
    experienceNote: boundedText(data.experienceNote, 2000, 'Experience details'),
    usesStryd: Boolean(data.usesStryd),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { saved: true };
});

exports.saveRecovery = onCall({ region: REGION }, async request => {
  const { workspaceId, uid } = await athleteMember(request);
  const data = request.data || {};
  const scores = ['sleep', 'energy', 'soreness', 'stress', 'mood'].reduce((result, name) => {
    const value = Number(data[name]);
    if (!Number.isInteger(value) || value < 1 || value > 5) stop('invalid-argument', 'Each recovery score must be a whole number from 1 to 5.');
    return { ...result, [name]: value };
  }, {});
  const checkinDate = today();
  await athlete(workspaceId, uid).collection('recovery').doc(checkinDate).set({
    ...scores,
    note: boundedText(data.note, 2000, 'Note'),
    checkinDate,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { saved: true, checkinDate };
});

exports.saveMonthlyLog = onCall({ region: REGION }, async request => {
  const { workspaceId, uid } = await athleteMember(request);
  const data = request.data || {};
  const month = String(data.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today().slice(0, 7)) stop('invalid-argument', 'Choose a valid current or past month.');
  const weightKg = Number(data.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) stop('invalid-argument', 'Weight must be between 20 and 300 kg.');
  const profile = await athlete(workspaceId, uid).get();
  const cpValue = data.cpWatts === '' || data.cpWatts === null || data.cpWatts === undefined ? null : Number(data.cpWatts);
  if (profile.exists && profile.data().usesStryd && (!Number.isFinite(cpValue) || cpValue <= 0 || cpValue > 1000)) stop('invalid-argument', 'A valid CP value is required when Stryd is enabled.');
  if (cpValue !== null && (!Number.isFinite(cpValue) || cpValue <= 0 || cpValue > 1000)) stop('invalid-argument', 'CP must be between 1 and 1000 watts.');
  const ref = athlete(workspaceId, uid).collection('monthly').doc(month);
  if ((await ref.get()).exists) stop('already-exists', 'This monthly log is already locked.');
  await ref.create({
    month,
    weightKg: Number(weightKg.toFixed(1)),
    cpWatts: cpValue,
    wkg: cpValue === null ? null : Number((cpValue / weightKg).toFixed(2)),
    comment: boundedText(data.comment, 2000, 'Comment'),
    coachReply: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { saved: true };
});

exports.startFitUpload = onCall({ region: REGION }, async request => {
  const { workspaceId, uid } = await athleteMember(request);
  const { originalName, byteSize } = request.data || {};
  const filename = boundedText(originalName, 255, 'File name', true);
  const size = Number(byteSize);
  if (!/\.fit$/i.test(filename)) stop('invalid-argument', 'Only .FIT files are accepted.');
  if (!Number.isInteger(size) || size < 1 || size > 25 * 1024 * 1024) stop('invalid-argument', 'FIT files must be between 1 byte and 25 MB.');
  const uploadId = randomUUID();
  await athlete(workspaceId, uid).collection('fitUploads').doc(uploadId).create({
    originalName: filename,
    byteSize: size,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { uploadId };
});

exports.completeFitUpload = onCall({ region: REGION, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  const { workspaceId, uid } = await athleteMember(request);
  const uploadId = String((request.data || {}).uploadId || '');
  if (!fitUploadId(uploadId)) stop('invalid-argument', 'Invalid FIT upload.');
  const athleteRef = athlete(workspaceId, uid);
  const uploadRef = athleteRef.collection('fitUploads').doc(uploadId);
  const upload = await uploadRef.get();
  if (!upload.exists || upload.data().status !== 'pending') stop('failed-precondition', 'This upload is unavailable or has already been processed.');
  const storagePath = `fit-staging/${workspaceId}/${uid}/${uploadId}`;
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) stop('not-found', 'FIT file upload was not found.');
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== Number(upload.data().byteSize) || Number(metadata.size) > 25 * 1024 * 1024) stop('invalid-argument', 'FIT file size does not match the upload request.');
  const [bytes] = await file.download();
  const sha256 = hash(bytes);
  let parsed;
  try { parsed = await parseRunningFit(bytes); }
  catch (error) {
    await Promise.all([file.delete({ ignoreNotFound: true }), uploadRef.update({ status: 'invalid' })]);
    if (error instanceof HttpsError) throw error;
    stop('invalid-argument', 'The FIT file could not be decoded.');
  }
  const activityId = randomUUID();
  const originalName = upload.data().originalName;
  const hashRef = athleteRef.collection('fitHashes').doc(sha256);
  try {
    await db.runTransaction(async transaction => {
      if ((await transaction.get(hashRef)).exists) stop('already-exists', 'This FIT file was already imported.');
      transaction.create(hashRef, { activityId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.create(athleteRef.collection('fitFiles').doc(activityId), {
        objectKey: storagePath,
        sha256,
        byteSize: Number(metadata.size),
        originalName,
        sourceType: 'manual_upload',
        immutable: true,
        parserVersion: `@garmin/fitsdk/${GARMIN_FIT_SDK_VERSION}`,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(athleteRef.collection('activities').doc(activityId), {
        title: originalName.replace(/\.fit$/i, ''),
        activityDate: parsed.activityDate,
        originalName,
        byteSize: Number(metadata.size),
        sha256,
        deletedAt: null,
        importStatus: 'parsed',
        parserVersion: `@garmin/fitsdk/${GARMIN_FIT_SDK_VERSION}`,
        summary: parsed.summary,
        dataAvailability: parsed.dataAvailability,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(uploadRef, { status: 'completed', activityId, completedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'already-exists') {
      await Promise.all([file.delete({ ignoreNotFound: true }), uploadRef.update({ status: 'duplicate' })]);
    }
    throw error;
  }
  return { activityId, importStatus: 'parsed' };
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

exports.createInvite = onCall({ region: REGION, secrets: ['RUN_CAL_GMAIL_FROM', 'RUN_CAL_GMAIL_APP_PASSWORD'] }, async request => {
  if(!request.auth) stop('unauthenticated','Sign in required.'); const workspaceId=await adminMember(request.auth.uid);
  const { email,role='athlete' }=request.data || {}; if(!/^\S+@\S+\.\S+$/.test(String(email || '')) || !['athlete','coach'].includes(role)) stop('invalid-argument','Valid email and role are required.');
  const token=randomBytes(24).toString('base64url'), id=hash(token), expiresAt=admin.firestore.Timestamp.fromMillis(Date.now()+3600000);
  await db.collection('workspaces').doc(workspaceId).collection('invites').doc(id).set({email:String(email).toLowerCase(),roles:[role],status:'pending',expiresAt,invitedBy:request.auth.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  const inviteUrl = `${PUBLIC_URL}/?invite=${encodeURIComponent(token)}`;
  await sendEmail({
    to: String(email).trim().toLowerCase(),
    subject: 'You are invited to RUN|CAL',
    text: `You have been invited to join RUN|CAL as ${role}. Create your Username and 6-digit PIN using this one-hour link: ${inviteUrl}`,
    idempotencyKey: `invite-${id}`,
  });
  return {expiresInMinutes:60};
});

exports.acceptInvite = onCall({ region: REGION }, async request => {
  const { inviteToken,displayName,username,pin }=request.data || {}; checkCredentials(username,pin); if(!text(displayName)) stop('invalid-argument','Display name is required.');
  if(!text(inviteToken)) stop('invalid-argument','Invitation is invalid or expired.');
  const invitations=await db.collectionGroup('invites').where(admin.firestore.FieldPath.documentId(),'==',hash(String(inviteToken))).get(); if(invitations.empty) stop('not-found','Invitation is invalid or expired.');
  const invite=invitations.docs[0], data=invite.data(); if(data.status!=='pending' || data.expiresAt.toMillis()<Date.now()) stop('failed-precondition','Invitation is invalid or expired.'); if((await usernameIndex(username).get()).exists) stop('already-exists','Username is already in use.');
  const uid=randomUUID(), workspaceId=invite.ref.parent.parent.id, serverTime=admin.firestore.FieldValue.serverTimestamp(); await admin.auth().createUser({uid,email:data.email,displayName:text(displayName)}); const batch=db.batch();
  batch.update(invite.ref,{status:'accepted',acceptedAt:serverTime}); batch.set(db.collection('users').doc(uid),{displayName:text(displayName),email:data.email,workspaceId,status:'active',createdAt:serverTime}); batch.set(db.collection('workspaces').doc(workspaceId).collection('members').doc(uid),{roles:data.roles,displayName:text(displayName),email:data.email,createdAt:serverTime}); batch.set(account(uid),{username:String(username),pinHash:makePinHash(String(pin)),failedAttempts:0,lockedAt:null,createdAt:serverTime}); batch.set(usernameIndex(username),{uid}); await batch.commit(); return {token:await admin.auth().createCustomToken(uid)};
});

exports.requestUsernameLookup = onCall({ region: REGION, secrets: ['RUN_CAL_GMAIL_FROM', 'RUN_CAL_GMAIL_APP_PASSWORD'] }, async request => {
  const email = String((request.data || {}).email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) stop('invalid-argument', 'Enter a valid email address.');
  const generic = { message: 'If that email is registered, a verification link will be sent shortly.' };
  if (!await allowRecoveryEmail(email, 'username_lookup')) return generic;
  const users = await db.collection('users').where('email', '==', email).where('status', '==', 'active').limit(1).get();
  if (users.empty) return generic;
  const token = await issueAccountToken({ purpose: 'username_lookup', uid: users.docs[0].id, email });
  await sendEmail({
    to: email,
    subject: 'Check your RUN|CAL Username',
    text: `Use this one-hour link to view your RUN|CAL Username: ${PUBLIC_URL}/?username=${encodeURIComponent(token)}`,
    idempotencyKey: `username-${hash(token)}`,
  });
  return generic;
});

exports.verifyUsernameLookup = onCall({ region: REGION }, async request => {
  const tokenHash = hash(String((request.data || {}).token || ''));
  const tokenRef = db.collection('accountTokens').doc(tokenHash);
  const token = await tokenRef.get();
  if (!token.exists || token.data().purpose !== 'username_lookup' || token.data().usedAt || token.data().expiresAt.toMillis() < Date.now()) stop('failed-precondition', 'This verification link is invalid or expired.');
  const privateAccount = await account(token.data().uid).get();
  if (!privateAccount.exists) stop('not-found', 'Account is unavailable.');
  await tokenRef.update({ usedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { username: privateAccount.data().username };
});

exports.requestPinReset = onCall({ region: REGION, secrets: ['RUN_CAL_GMAIL_FROM', 'RUN_CAL_GMAIL_APP_PASSWORD'] }, async request => {
  const email = String((request.data || {}).email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) stop('invalid-argument', 'Enter a valid email address.');
  const generic = { message: 'If that email is registered, a PIN reset link will be sent shortly.' };
  if (!await allowRecoveryEmail(email, 'pin_reset')) return generic;
  const users = await db.collection('users').where('email', '==', email).where('status', '==', 'active').limit(1).get();
  if (users.empty) return generic;
  const token = await issueAccountToken({ purpose: 'pin_reset', uid: users.docs[0].id, email });
  await sendEmail({
    to: email,
    subject: 'Reset your RUN|CAL PIN',
    text: `Use this one-hour link to set a new six-digit RUN|CAL PIN: ${PUBLIC_URL}/?reset=${encodeURIComponent(token)}`,
    idempotencyKey: `pin-${hash(token)}`,
  });
  return generic;
});

exports.confirmPinReset = onCall({ region: REGION }, async request => {
  const { token, pin } = request.data || {};
  if (!PIN.test(String(pin || ''))) stop('invalid-argument', 'PIN must contain exactly 6 digits.');
  const tokenRef = db.collection('accountTokens').doc(hash(String(token || '')));
  const found = await tokenRef.get();
  if (!found.exists || found.data().purpose !== 'pin_reset' || found.data().usedAt || found.data().expiresAt.toMillis() < Date.now()) stop('failed-precondition', 'This PIN reset link is invalid or expired.');
  const batch = db.batch();
  batch.update(account(found.data().uid), { pinHash: makePinHash(String(pin)), failedAttempts: 0, lockedAt: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  batch.update(tokenRef, { usedAt: admin.firestore.FieldValue.serverTimestamp() });
  await batch.commit();
  await admin.auth().revokeRefreshTokens(found.data().uid);
  return { reset: true };
});

exports.startAdminTransfer = onCall({ region: REGION }, async request => {
  if (!request.auth) stop('unauthenticated', 'Sign in required.');
  const fromUserId = request.auth.uid;
  const workspaceId = await adminMember(fromUserId);
  const { toUserId, pin } = request.data || {};
  if (!fitUploadId(toUserId) || toUserId === fromUserId) stop('invalid-argument', 'Choose another active team member.');
  if (!PIN.test(String(pin || ''))) stop('invalid-argument', 'PIN must contain exactly 6 digits.');
  const [privateAccount, targetUser, targetMember] = await Promise.all([
    account(fromUserId).get(),
    db.collection('users').doc(String(toUserId)).get(),
    db.collection('workspaces').doc(workspaceId).collection('members').doc(String(toUserId)).get(),
  ]);
  if (!privateAccount.exists || !matchesPin(String(pin), privateAccount.data().pinHash)) stop('unauthenticated', 'Invalid username or PIN.');
  if (!targetUser.exists || targetUser.data().status !== 'active' || targetUser.data().workspaceId !== workspaceId || !targetMember.exists) stop('invalid-argument', 'Choose another active team member.');
  const transferId = randomUUID();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 3600000);
  const transferRef = db.collection('workspaces').doc(workspaceId).collection('adminTransfers').doc(transferId);
  const notificationRef = db.collection('workspaces').doc(workspaceId).collection('notifications').doc();
  const batch = db.batch();
  batch.set(transferRef, { fromUserId, toUserId: String(toUserId), status: 'pending', expiresAt, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  batch.set(notificationRef, {
    userId: String(toUserId),
    title: 'Team Admin transfer requested',
    body: 'Accept this request within 60 minutes to become the new Team Admin.',
    href: `/team?transfer=${transferId}`,
    readAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { transferId, expiresInMinutes: 60 };
});

exports.acceptAdminTransfer = onCall({ region: REGION }, async request => {
  if (!request.auth) stop('unauthenticated', 'Sign in required.');
  const toUserId = request.auth.uid;
  const transferId = String((request.data || {}).transferId || '');
  if (!fitUploadId(transferId)) stop('invalid-argument', 'The transfer request is invalid.');
  const { workspaceId } = await activeMember(toUserId);
  const workspaceRef = db.collection('workspaces').doc(workspaceId);
  const transferRef = workspaceRef.collection('adminTransfers').doc(transferId);
  await db.runTransaction(async transaction => {
    const [workspaceSnapshot, transferSnapshot, targetMember] = await Promise.all([
      transaction.get(workspaceRef),
      transaction.get(transferRef),
      transaction.get(workspaceRef.collection('members').doc(toUserId)),
    ]);
    if (!workspaceSnapshot.exists || !transferSnapshot.exists || !targetMember.exists) stop('not-found', 'The transfer request is unavailable.');
    const transfer = transferSnapshot.data();
    if (transfer.status !== 'pending' || transfer.toUserId !== toUserId || transfer.expiresAt.toMillis() < Date.now()) stop('failed-precondition', 'This transfer request is invalid or expired.');
    if (workspaceSnapshot.data().teamAdminId !== transfer.fromUserId) stop('failed-precondition', 'This transfer request is no longer current.');
    const previousMemberRef = workspaceRef.collection('members').doc(transfer.fromUserId);
    const previousMember = await transaction.get(previousMemberRef);
    if (!previousMember.exists) stop('failed-precondition', 'The current Team Admin is unavailable.');
    const targetRoles = [...new Set([...(targetMember.data().roles || []), 'team_admin'])];
    const previousRoles = (previousMember.data().roles || []).filter(role => role !== 'team_admin');
    transaction.update(workspaceRef, { teamAdminId: toUserId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(workspaceRef.collection('members').doc(toUserId), { roles: targetRoles, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(previousMemberRef, { roles: previousRoles, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(transferRef, { status: 'accepted', acceptedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  const pendingNotification = await workspaceRef.collection('notifications')
    .where('userId', '==', toUserId)
    .where('href', '==', `/team?transfer=${transferId}`)
    .limit(1)
    .get();
  if (!pendingNotification.empty) await pendingNotification.docs[0].ref.update({ readAt: admin.firestore.FieldValue.serverTimestamp() });
  return { accepted: true };
});

exports.markNotificationRead = onCall({ region: REGION }, async request => {
  if (!request.auth) stop('unauthenticated', 'Sign in required.');
  const notificationId = String((request.data || {}).notificationId || '');
  if (!notificationId || notificationId.length > 128) stop('invalid-argument', 'Notification is invalid.');
  const { workspaceId } = await activeMember(request.auth.uid);
  const notificationRef = db.collection('workspaces').doc(workspaceId).collection('notifications').doc(notificationId);
  const notification = await notificationRef.get();
  if (!notification.exists || notification.data().userId !== request.auth.uid) stop('not-found', 'Notification is unavailable.');
  if (!notification.data().readAt) await notificationRef.update({ readAt: admin.firestore.FieldValue.serverTimestamp() });
  return { read: true };
});
