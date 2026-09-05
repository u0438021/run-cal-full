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

type Metric = { value?: number; unit?: string };
type Result = { activityId: string; status: string; cached: boolean; summary?: { metrics?: Record<string, Metric> } };
type Activity = { id: string; originalName?: string; importStatus?: string; createdAt?: any };
type SeriesPoint = { running?: boolean; speed_mps?: number; heart_rate_bpm?: number; power_w?: number; cadence_spm?: number };
type ChartName = "pace" | "heartRate" | "power" | "cadence";

const CHARTS: Record<ChartName, { label: string; unit: string; value: (point: SeriesPoint) => number | null }> = {
  pace: { label: "Pace", unit: "s/km", value: point => point.speed_mps && point.speed_mps > 0 ? 1000 / point.speed_mps : null },
  heartRate: { label: "Heart rate", unit: "bpm", value: point => typeof point.heart_rate_bpm === "number" ? point.heart_rate_bpm : null },
  power: { label: "Power", unit: "W", value: point => typeof point.power_w === "number" ? point.power_w : null },
  cadence: { label: "Cadence", unit: "spm", value: point => typeof point.cadence_spm === "number" ? point.cadence_spm : null },
};

function initializeFirebase() {
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  return { auth: window.firebase.auth(), db: window.firebase.firestore(), storage: window.firebase.storage() };
}

function value(raw: unknown, suffix = "") {
  if (typeof raw !== "number") return "—";
  return `${raw.toLocaleString("th-TH", { maximumFractionDigits: 1 })}${suffix}`;
}

function analysisResult(activityId: string, payload: any): Result {
  return {
    activityId,
    status: payload.status || "analyzed",
    cached: Boolean(payload.cached),
    summary: payload.summary || payload.activity,
  };
}

function activityDate(timestamp: any) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleDateString("th-TH", { dateStyle: "medium" }) : "กำลังบันทึกวันที่";
}

function chartPath(series: SeriesPoint[], chart: ChartName) {
  const values = series.map(CHARTS[chart].value).filter((value): value is number => value !== null);
  if (!values.length) return { path: "", min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  let previousWasValue = false;
  const path = series.map((point, index) => {
    const raw = point.running === false ? null : CHARTS[chart].value(point);
    if (raw === null) { previousWasValue = false; return ""; }
    const x = (index / Math.max(series.length - 1, 1)) * 600;
    const y = 190 - ((raw - min) / span) * 160;
    const command = previousWasValue ? "L" : "M";
    previousWasValue = true;
    return `${command}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return { path, min, max };
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [chart, setChart] = useState<ChartName>("pace");

  useEffect(() => {
    const wait = window.setInterval(() => {
      if (!window.firebase) return;
      window.clearInterval(wait);
      const { auth } = initializeFirebase();
      auth.onAuthStateChanged((current: any) => { setUser(current); setReady(true); setMessage(""); });
    }, 100);
    return () => window.clearInterval(wait);
  }, []);

  useEffect(() => {
    if (!ready || !user) { setActivities([]); return; }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { db } = initializeFirebase();
        const account = await db.collection("users").doc(user.uid).get();
        const workspaceId = account.data()?.workspaceId;
        if (!workspaceId || cancelled) return;
        unsubscribe = db.collection("workspaces").doc(workspaceId).collection("athletes").doc(user.uid)
          .collection("activities").orderBy("createdAt", "desc").limit(20)
          .onSnapshot((snapshot: any) => setActivities(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))));
      } catch {
        if (!cancelled) setError("ไม่สามารถโหลดประวัติการวิ่งได้");
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [ready, user]);

  useEffect(() => {
    if (!user || !activeActivityId) { setSeries([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_ORIGIN}/v1/activities/${activeActivityId}/series`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "ไม่สามารถโหลดข้อมูลกราฟได้");
        if (!cancelled) setSeries(Array.isArray(payload.series) ? payload.series : []);
      } catch (caught) {
        if (!cancelled) { setSeries([]); setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดข้อมูลกราฟได้"); }
      }
    })();
    return () => { cancelled = true; };
  }, [activeActivityId, user]);

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
      setResult(analysisResult(activityId, payload)); setActiveActivityId(activityId); setMessage("วิเคราะห์เสร็จแล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด"); setMessage(""); }
    finally { setBusy(false); }
  }

  async function openActivity(activityId: string) {
    if (!user) return;
    setBusy(true); setError(""); setMessage("กำลังโหลดผลการวิเคราะห์…");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_ORIGIN}/v1/activities/${activityId}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "ไม่สามารถเปิดผลการวิเคราะห์ได้");
      setResult(analysisResult(activityId, payload)); setActiveActivityId(activityId); setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดผลการวิเคราะห์ได้"); setMessage("");
    } finally { setBusy(false); }
  }

  return <main className="live-dashboard">
    <header className="topbar"><div><p className="kicker">RUN | CAL</p><h1>Running analytics</h1></div>{user && <button onClick={() => initializeFirebase().auth.signOut()}>ออกจากระบบ</button>}</header>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!ready ? null : !user ? <form className="login-form recent" onSubmit={login}><h2>เข้าสู่ระบบ</h2><label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="upload" disabled={busy}>เข้าสู่ระบบ</button><button type="button" onClick={resetPassword} disabled={busy}>ลืมรหัสผ่าน</button></form> : <>
      <section className="recent"><h2>นำเข้าและวิเคราะห์ FIT</h2><p>เข้าสู่ระบบในชื่อ {user.email} แล้ว เลือกไฟล์จากนาฬิกาวิ่งของคุณเพื่อวิเคราะห์ Pace, Heart rate, Power, Cadence และข้อมูลประกอบการวิ่ง</p><form className="toolbar" onSubmit={uploadAndAnalyze}><label>ไฟล์ FIT<input type="file" accept=".fit" onChange={e => setFile(e.target.files?.[0] || null)} required disabled={busy} /></label><button className="upload" disabled={busy || !file}>{busy ? "กำลังทำงาน…" : "วิเคราะห์ไฟล์"}</button></form></section>
      <section className="recent"><h2>ประวัติการวิ่ง</h2><p>เลือกกิจกรรมเพื่อเปิดผลที่วิเคราะห์ไว้ โดยไม่ต้องอัปโหลดไฟล์ซ้ำ</p>{activities.length ? <div className="run-list">{activities.map(activity => <button type="button" key={activity.id} onClick={() => openActivity(activity.id)} aria-pressed={activeActivityId === activity.id} disabled={busy}><span>{activity.originalName || "ไฟล์ FIT"}</span><span>{activityDate(activity.createdAt)}</span><span>{activity.importStatus === "analyzed" ? "วิเคราะห์แล้ว" : "กำลังดำเนินการ"}</span></button>)}</div> : <p>ยังไม่มีประวัติการวิ่ง</p>}</section>
      {result && <section className="recent"><h2>ผลการวิเคราะห์</h2><p>สถานะ: {result.status === "analyzed" ? "สำเร็จ" : result.status} {result.cached ? "(ใช้ผลที่คำนวณไว้แล้ว)" : ""}</p><div className="analytics-grid">{Object.entries(result.summary?.metrics || {}).slice(0, 12).map(([key, metric]) => <article className="metric-card" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value(metric.value, metric.unit ? ` ${metric.unit}` : "")}</strong></article>)}</div></section>}
      {result && <section className="recent"><div className="section-heading"><div><h2>กราฟระหว่างการวิ่ง</h2><p>แสดงเฉพาะช่วงที่นาฬิกาบันทึกข้อมูล</p></div><div className="segmented">{(Object.keys(CHARTS) as ChartName[]).map(name => <button type="button" key={name} className={chart === name ? "selected" : ""} onClick={() => setChart(name)} aria-pressed={chart === name}>{CHARTS[name].label}</button>)}</div></div>{series.length ? (() => { const data = chartPath(series, chart); return <figure className="activity-chart"><div className="chart-label"><strong>{CHARTS[chart].label}</strong><span>{value(data.min, ` ${CHARTS[chart].unit}`)} – {value(data.max, ` ${CHARTS[chart].unit}`)}</span></div><svg viewBox="0 0 600 220" role="img" aria-label={`กราฟ ${CHARTS[chart].label}`}><path className="chart-grid" d="M0 30H600 M0 110H600 M0 190H600" /><path className="chart-line" d={data.path} /></svg><figcaption>เริ่มการวิ่ง <span>จบการวิ่ง</span></figcaption></figure>; })() : <p>กำลังโหลดข้อมูลกราฟ…</p>}</section>}
    </>}
  </main>;
}
