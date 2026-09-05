"use client";

import { FormEvent, useEffect, useState } from "react";

declare global { interface Window { firebase: any } }

const API_ORIGIN = "https://run-cal-analytics-152237457223.asia-southeast1.run.app";
const firebaseConfig = {
  apiKey: "AIzaSyDRvsG78J3WK9zhTTvhc5Hc_4JclFkHRwE",
  authDomain: "run-cal-th.firebaseapp.com",
  projectId: "run-cal-th",
  storageBucket: "run-cal-th.firebasestorage.app",
  messagingSenderId: "152237457223",
  appId: "1:152237457223:web:bf97f1fd7f93aab30a5662",
};

type Result = { activityId: string; status: string; cached: boolean; summary?: Record<string, unknown> };

function initializeFirebase() {
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  return { auth: window.firebase.auth(), db: window.firebase.firestore(), storage: window.firebase.storage() };
}

function value(raw: unknown, suffix = "") {
  if (typeof raw !== "number") return "—";
  return `${raw.toLocaleString("th-TH", { maximumFractionDigits: 1 })}${suffix}`;
}

export default function Dashboard() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("กำลังเตรียมระบบ…");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const wait = window.setInterval(() => {
      if (!window.firebase) return;
      window.clearInterval(wait);
      const { auth } = initializeFirebase();
      auth.onAuthStateChanged((current: any) => { setUser(current); setReady(true); setMessage(""); });
    }, 100);
    return () => window.clearInterval(wait);
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await initializeFirebase().auth.signInWithEmailAndPassword(email, password); }
    catch { setError("เข้าสู่ระบบไม่สำเร็จ โปรดตรวจสอบอีเมลและรหัสผ่าน"); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    setError("");
    if (!email) { setError("กรุณากรอกอีเมลก่อนกดรีเซ็ตรหัสผ่าน"); return; }
    setBusy(true);
    try {
      await initializeFirebase().auth.sendPasswordResetEmail(email);
      setMessage("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว");
    } catch {
      setError("ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้ โปรดตรวจสอบอีเมล");
    } finally { setBusy(false); }
  }

  async function uploadAndAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !user) return;
    if (!file.name.toLowerCase().endsWith(".fit")) { setError("กรุณาเลือกไฟล์ .FIT"); return; }
    setBusy(true); setError(""); setResult(null); setMessage("กำลังอัปโหลดไฟล์ FIT…");
    try {
      const { db, storage } = initializeFirebase();
      const account = await db.collection("users").doc(user.uid).get();
      const workspaceId = account.data()?.workspaceId;
      if (!account.exists || account.data()?.status !== "active" || !workspaceId) throw new Error("บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน Analytics");
      const activityId = crypto.randomUUID();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, "0")).join("");
      const objectKey = `fit-staging/${workspaceId}/${user.uid}/${activityId}.fit`;
      await storage.ref(objectKey).put(file, { contentType: "application/octet-stream" });
      const activity = db.collection("workspaces").doc(workspaceId).collection("athletes").doc(user.uid).collection("activities").doc(activityId);
      await activity.set({ createdAt: window.firebase.firestore.FieldValue.serverTimestamp(), originalName: file.name, importStatus: "uploaded" });
      await activity.collection("fitFiles").doc(activityId).set({ objectKey, originalName: file.name, sha256, uploadedAt: window.firebase.firestore.FieldValue.serverTimestamp() });
      setMessage("กำลังวิเคราะห์ข้อมูลการวิ่ง…");
      const token = await user.getIdToken();
      const response = await fetch(`${API_ORIGIN}/v1/activities/${activityId}/analyze`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "ไม่สามารถวิเคราะห์ไฟล์นี้ได้");
      setResult(payload); setMessage("วิเคราะห์เสร็จแล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด"); setMessage(""); }
    finally { setBusy(false); }
  }

  return <main className="live-dashboard">
    <header className="topbar"><div><p className="kicker">RUN | CAL</p><h1>Running analytics</h1></div>{user && <button onClick={() => initializeFirebase().auth.signOut()}>ออกจากระบบ</button>}</header>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!ready ? null : !user ? <form className="login-form recent" onSubmit={login}><h2>เข้าสู่ระบบ</h2><label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="upload" disabled={busy}>เข้าสู่ระบบ</button><button type="button" onClick={resetPassword} disabled={busy}>ลืมรหัสผ่าน</button></form> : <>
      <section className="recent"><h2>นำเข้าและวิเคราะห์ FIT</h2><p>เข้าสู่ระบบในชื่อ {user.email} แล้ว เลือกไฟล์จากนาฬิกาวิ่งของคุณเพื่อวิเคราะห์ Pace, Heart rate, Power, Cadence และข้อมูลประกอบการวิ่ง</p><form className="toolbar" onSubmit={uploadAndAnalyze}><label>ไฟล์ FIT<input type="file" accept=".fit" onChange={e => setFile(e.target.files?.[0] || null)} required disabled={busy} /></label><button className="upload" disabled={busy || !file}>{busy ? "กำลังทำงาน…" : "วิเคราะห์ไฟล์"}</button></form></section>
      {result && <section className="recent"><h2>ผลการวิเคราะห์</h2><p>สถานะ: {result.status === "analyzed" ? "สำเร็จ" : result.status} {result.cached ? "(ใช้ผลที่คำนวณไว้แล้ว)" : ""}</p><div className="analytics-grid">{Object.entries(result.summary || {}).slice(0, 12).map(([key, metric]: [string, any]) => <article className="metric-card" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value(metric?.value, metric?.unit ? ` ${metric.unit}` : "")}</strong></article>)}</div></section>}
    </>}
  </main>;
}
