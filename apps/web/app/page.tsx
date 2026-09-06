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
type SeriesPoint = { time?: string; running?: boolean; speed_mps?: number; heart_rate_bpm?: number; power_w?: number; cadence_spm?: number };
type ChartName = "pace" | "heartRate" | "power" | "cadence";
type TrainingTotal = { runs: number; durationSeconds: number; distanceM?: number | null; metrics: Record<string, number | null> };
type TrainingDashboard = { allTime: TrainingTotal; months: Array<TrainingTotal & { period: string }>; weeks: Array<TrainingTotal & { period: string }> };
type RunnerProfile = { weightKg?: number | null; targetPaceSecondsPerKm?: number | null; maxHeartRate?: number | null; weeklyDistanceGoalKm?: number | null; weeklyReminderEnabled?: boolean };

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

async function authenticatedFetch(user: any, path: string, init: RequestInit = {}) {
  const request = async (forceRefresh = false) => {
    const token = await user.getIdToken(forceRefresh);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  };
  const response = await request();
  return response.status === 401 ? request(true) : response;
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

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

function paceLabel(seconds: number | null | undefined) {
  if (typeof seconds !== "number") return "—";
  return `${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, "0")} /กม.`;
}

function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return Number.isFinite(month) ? new Date(year, month - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" }) : period;
}

function paceInput(seconds: number | null | undefined) {
  return typeof seconds === "number" ? `${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, "0")}` : "";
}

function parsePaceInput(input: string) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[2]) >= 60) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function coachingAdvice(summary: Result["summary"], profile: RunnerProfile) {
  const metrics = summary?.metrics || {};
  const pace = metrics.pace_s_km?.value;
  const heartRate = metrics.heart_rate_bpm?.value;
  const power = metrics.power_w?.value;
  const cadence = metrics.cadence_spm?.value;
  const notes: string[] = [];
  if (typeof pace === "number") notes.push(`Pace เฉลี่ย ${paceLabel(pace)}`);
  if (typeof heartRate === "number") notes.push(`Heart rate เฉลี่ย ${Math.round(heartRate)} bpm`);
  if (typeof power === "number" && typeof cadence === "number") notes.push(`Power เฉลี่ย ${Math.round(power)} W และ Cadence ${Math.round(cadence)} spm`);
  if (typeof pace === "number" && typeof profile.targetPaceSecondsPerKm === "number") notes.push(pace <= profile.targetPaceSecondsPerKm ? "ทำ Pace ได้ตามเป้าหมายที่ตั้งไว้" : "Pace เฉลี่ยยังช้ากว่าเป้าหมายที่ตั้งไว้ — ลองเริ่มต้นให้สม่ำเสมอก่อนเพิ่มความเร็ว");
  if (typeof heartRate === "number" && typeof profile.maxHeartRate === "number") {
    const share = heartRate / profile.maxHeartRate;
    notes.push(`Heart rate เฉลี่ยอยู่ที่ ${Math.round(share * 100)}% ของค่าสูงสุดที่ตั้งไว้`);
  }
  return notes;
}

function heartRateZones(series: SeriesPoint[], maxHeartRate?: number | null) {
  if (!maxHeartRate) return [];
  const zones = [
    { name: "Z1 ฟื้นตัว", min: 0.5, max: 0.6, seconds: 0 },
    { name: "Z2 เบา", min: 0.6, max: 0.7, seconds: 0 },
    { name: "Z3 ปานกลาง", min: 0.7, max: 0.8, seconds: 0 },
    { name: "Z4 หนัก", min: 0.8, max: 0.9, seconds: 0 },
    { name: "Z5 สูง", min: 0.9, max: Infinity, seconds: 0 },
  ];
  for (let index = 0; index < series.length - 1; index += 1) {
    const point = series[index];
    const next = series[index + 1];
    if (point.running === false || typeof point.heart_rate_bpm !== "number" || !point.time || !next.time) continue;
    const seconds = (new Date(next.time).getTime() - new Date(point.time).getTime()) / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) continue;
    const share = point.heart_rate_bpm / maxHeartRate;
    const zone = zones.find(item => share >= item.min && share < item.max);
    if (zone) zone.seconds += seconds;
  }
  return zones;
}

function shortDuration(seconds: number) {
  return seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} ชม.` : `${Math.round(seconds / 60)} นาที`;
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
  const [dashboard, setDashboard] = useState<TrainingDashboard | null>(null);
  const [profile, setProfile] = useState<RunnerProfile>({});
  const [weightInput, setWeightInput] = useState("");
  const [targetPaceInput, setTargetPaceInput] = useState("");
  const [maxHeartRateInput, setMaxHeartRateInput] = useState("");
  const [weeklyGoalInput, setWeeklyGoalInput] = useState("30");
  const [profileMessage, setProfileMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [reminderMessage, setReminderMessage] = useState("");

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
          .onSnapshot((snapshot: any) => setActivities(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })).filter((activity: Activity & { deletedAt?: any }) => !activity.deletedAt)));
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
        const response = await authenticatedFetch(user, `/v1/activities/${activeActivityId}/series`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "ไม่สามารถโหลดข้อมูลกราฟได้");
        if (!cancelled) setSeries(Array.isArray(payload.series) ? payload.series : []);
      } catch (caught) {
        if (!cancelled) { setSeries([]); setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดข้อมูลกราฟได้"); }
      }
    })();
    return () => { cancelled = true; };
  }, [activeActivityId, user]);

  useEffect(() => {
    if (!user) { setDashboard(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const response = await authenticatedFetch(user, "/v1/dashboard/summary");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "ไม่สามารถโหลดภาพรวมการฝึกได้");
        if (!cancelled) setDashboard(payload);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดภาพรวมการฝึกได้");
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (typeof Notification === "undefined") { setNotificationPermission("unsupported"); return; }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!dashboard || !profile.weeklyReminderEnabled || notificationPermission !== "granted") return;
    const week = dashboard.weeks[0];
    const goalKm = profile.weeklyDistanceGoalKm || 30;
    const completedKm = (week?.distanceM || 0) / 1000;
    if (!week || completedKm >= goalKm) return;
    const reminderKey = `run-cal-weekly-reminder-${week.period}`;
    if (window.localStorage.getItem(reminderKey)) return;
    const message = `สัปดาห์นี้วิ่งแล้ว ${completedKm.toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม. เหลืออีก ${(goalKm - completedKm).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม. เพื่อถึงเป้าหมาย`;
    window.localStorage.setItem(reminderKey, "shown");
    navigator.serviceWorker?.ready.then(registration => registration.showNotification("RUN | CAL", { body: message, icon: "/icon.svg", tag: reminderKey })).catch(() => new Notification("RUN | CAL", { body: message, icon: "/icon.svg" }));
  }, [dashboard, profile, notificationPermission]);

  useEffect(() => {
    if (!user) { setProfile({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const response = await authenticatedFetch(user, "/v1/profile");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "ไม่สามารถโหลดโปรไฟล์นักวิ่งได้");
        if (!cancelled) { setProfile(payload); setWeightInput(payload.weightKg?.toString() || ""); setTargetPaceInput(paceInput(payload.targetPaceSecondsPerKm)); setMaxHeartRateInput(payload.maxHeartRate?.toString() || ""); setWeeklyGoalInput(payload.weeklyDistanceGoalKm?.toString() || "30"); }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดโปรไฟล์นักวิ่งได้");
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
      const activitiesRef = db.collection("workspaces").doc(workspaceId).collection("athletes").doc(user.uid).collection("activities");
      const duplicate = await activitiesRef.where("sourceSha256", "==", sha256).limit(1).get();
      if (!duplicate.empty) throw new Error("ไฟล์นี้ถูกนำเข้าแล้ว กรุณาเลือกดูผลจากประวัติการวิ่ง");
      const objectKey = `fit-staging/${workspaceId}/${user.uid}/${activityId}.fit`;
      await storage.ref(objectKey).put(file, { contentType: "application/octet-stream" });
      const activity = activitiesRef.doc(activityId);
      await activity.set({ createdAt: window.firebase.firestore.FieldValue.serverTimestamp(), originalName: file.name, sourceSha256: sha256, importStatus: "uploaded" });
      await activity.collection("fitFiles").doc(activityId).set({ objectKey, originalName: file.name, sha256, uploadedAt: window.firebase.firestore.FieldValue.serverTimestamp() });
      setMessage("กำลังวิเคราะห์ข้อมูลการวิ่ง…");
      const response = await authenticatedFetch(user, `/v1/activities/${activityId}/analyze`, { method: "POST" });
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
      const response = await authenticatedFetch(user, `/v1/activities/${activityId}/analytics`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "ไม่สามารถเปิดผลการวิเคราะห์ได้");
      setResult(analysisResult(activityId, payload)); setActiveActivityId(activityId); setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดผลการวิเคราะห์ได้"); setMessage("");
    } finally { setBusy(false); }
  }

  async function removeActivity(activity: Activity) {
    if (!user || !window.confirm(`ลบ ${activity.originalName || "กิจกรรมนี้"} ออกจากประวัติใช่หรือไม่?`)) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(user, `/v1/activities/${activity.id}/delete`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "ไม่สามารถลบกิจกรรมได้");
      if (activeActivityId === activity.id) { setActiveActivityId(null); setResult(null); }
      setMessage("ลบกิจกรรมออกจากประวัติแล้ว");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถลบกิจกรรมได้");
    } finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const targetPaceSecondsPerKm = targetPaceInput ? parsePaceInput(targetPaceInput) : null;
    if (targetPaceInput && targetPaceSecondsPerKm === null) { setError("กรุณากรอก Pace เป้าหมายเป็นรูปแบบ นาที:วินาที เช่น 6:00"); return; }
    setBusy(true); setError(""); setProfileMessage("");
    try {
      const weeklyDistanceGoalKm = weeklyGoalInput ? Number(weeklyGoalInput) : null;
      if (!weeklyDistanceGoalKm || weeklyDistanceGoalKm < 1 || weeklyDistanceGoalKm > 500) { setError("กรุณากรอกเป้าหมายรายสัปดาห์ระหว่าง 1–500 กม."); return; }
      const payload = { weightKg: weightInput ? Number(weightInput) : null, targetPaceSecondsPerKm, maxHeartRate: maxHeartRateInput ? Number(maxHeartRateInput) : null, weeklyDistanceGoalKm, weeklyReminderEnabled: profile.weeklyReminderEnabled === true };
      const response = await authenticatedFetch(user, "/v1/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.detail || "ไม่สามารถบันทึกโปรไฟล์ได้");
      setProfile(saved); setProfileMessage("บันทึกโปรไฟล์นักวิ่งแล้ว");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถบันทึกโปรไฟล์ได้");
    } finally { setBusy(false); }
  }

  async function setWeeklyReminder(enabled: boolean) {
    if (!user) return;
    setError(""); setReminderMessage("");
    if (enabled) {
      if (typeof Notification === "undefined") { setNotificationPermission("unsupported"); setReminderMessage("อุปกรณ์นี้ยังไม่รองรับการแจ้งเตือน"); return; }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") { setReminderMessage("ยังไม่ได้รับอนุญาตให้แจ้งเตือน คุณสามารถเปิดได้จากการตั้งค่าเบราว์เซอร์"); return; }
    }
    setBusy(true);
    try {
      const targetPaceSecondsPerKm = targetPaceInput ? parsePaceInput(targetPaceInput) : null;
      const payload = { weightKg: weightInput ? Number(weightInput) : null, targetPaceSecondsPerKm, maxHeartRate: maxHeartRateInput ? Number(maxHeartRateInput) : null, weeklyDistanceGoalKm: weeklyGoalInput ? Number(weeklyGoalInput) : 30, weeklyReminderEnabled: enabled };
      const response = await authenticatedFetch(user, "/v1/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.detail || "ไม่สามารถบันทึกการแจ้งเตือนได้");
      setProfile(saved); setReminderMessage(enabled ? "เปิดการแจ้งเตือนความคืบหน้ารายสัปดาห์แล้ว" : "ปิดการแจ้งเตือนรายสัปดาห์แล้ว");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถบันทึกการแจ้งเตือนได้");
    } finally { setBusy(false); }
  }

  return <main className="live-dashboard">
    <header className="topbar"><div><p className="kicker">RUN | CAL</p><h1>Running analytics</h1></div>{user && <button onClick={() => initializeFirebase().auth.signOut()}>ออกจากระบบ</button>}</header>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!ready ? null : !user ? <form className="login-form recent" onSubmit={login}><h2>เข้าสู่ระบบ</h2><label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="upload" disabled={busy}>เข้าสู่ระบบ</button><button type="button" onClick={resetPassword} disabled={busy}>ลืมรหัสผ่าน</button></form> : <>
      <section className="recent"><h2>นำเข้าและวิเคราะห์ FIT</h2><p>เข้าสู่ระบบในชื่อ {user.email} แล้ว เลือกไฟล์จากนาฬิกาวิ่งของคุณเพื่อวิเคราะห์ Pace, Heart rate, Power, Cadence และข้อมูลประกอบการวิ่ง</p><form className="toolbar" onSubmit={uploadAndAnalyze}><label>ไฟล์ FIT<input type="file" accept=".fit" onChange={e => setFile(e.target.files?.[0] || null)} required disabled={busy} /></label><button className="upload" disabled={busy || !file}>{busy ? "กำลังทำงาน…" : "วิเคราะห์ไฟล์"}</button></form></section>
      {dashboard && (() => { const month = dashboard.months[0] || dashboard.allTime; const maxWeek = Math.max(...dashboard.weeks.map(week => week.durationSeconds), 1); const currentWeek = dashboard.weeks[0]; const goalKm = profile.weeklyDistanceGoalKm || 30; const completedKm = (currentWeek?.distanceM || 0) / 1000; const progress = Math.min(100, (completedKm / goalKm) * 100); return <section className="recent"><div className="section-heading"><div><h2>ภาพรวมการฝึก</h2><p>{dashboard.months[0] ? periodLabel(dashboard.months[0].period) : "กิจกรรมที่วิเคราะห์ทั้งหมด"}</p></div></div><div className="summary-grid"><article><span>จำนวนครั้ง</span><strong>{month.runs}</strong><small>กิจกรรม</small></article><article><span>เวลาวิ่งรวม</span><strong>{durationLabel(month.durationSeconds)}</strong></article><article><span>ระยะทางรวม</span><strong>{typeof month.distanceM === "number" ? `${(month.distanceM / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.` : "—"}</strong></article><article><span>Pace เฉลี่ย</span><strong>{paceLabel(month.metrics.pace_s_km)}</strong></article><article><span>Heart rate เฉลี่ย</span><strong>{value(month.metrics.heart_rate_bpm, " bpm")}</strong></article><article><span>Power เฉลี่ย</span><strong>{value(month.metrics.power_w, " W")}</strong></article></div><div className="weekly-goal"><div className="section-heading"><div><h3>เป้าหมายสัปดาห์นี้</h3><p>{completedKm.toLocaleString("th-TH", { maximumFractionDigits: 1 })} จาก {goalKm.toLocaleString("th-TH", { maximumFractionDigits: 0 })} กม.</p></div><strong>{Math.round(progress)}%</strong></div><div className="goal-progress" aria-label={`ทำได้ ${Math.round(progress)}% ของเป้าหมาย`}><i style={{ width: `${progress}%` }} /></div><p className="goal-status">{completedKm >= goalKm ? "✓ ทำเป้าหมายระยะทางของสัปดาห์นี้แล้ว" : `เหลืออีก ${(goalKm - completedKm).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม. เพื่อถึงเป้าหมาย`}</p></div>{dashboard.weeks.length > 0 && <div className="weekly-trend"><div className="section-heading"><strong>แนวโน้มเวลาวิ่งรายสัปดาห์</strong><span>8 สัปดาห์ล่าสุด</span></div><div className="week-bars">{[...dashboard.weeks].reverse().map(week => <div key={week.period} title={`${week.period}: ${durationLabel(week.durationSeconds)}`}><i style={{ height: `${Math.max(8, (week.durationSeconds / maxWeek) * 100)}%` }} /><span>{week.period.slice(-2)}</span></div>)}</div></div>}</section>; })()}
      <section className="recent reminder-card"><h2>แจ้งเตือนความคืบหน้า</h2><p>เมื่อเปิด RUN | CAL ระบบจะแจ้งสถานะเป้าหมายของสัปดาห์นี้บนอุปกรณ์ของคุณ ข้อมูลการวิ่งไม่ถูกส่งออกไปภายนอก</p>{notificationPermission === "unsupported" ? <p>อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p> : <button type="button" className="upload" onClick={() => setWeeklyReminder(!profile.weeklyReminderEnabled)} disabled={busy}>{profile.weeklyReminderEnabled ? "ปิดการแจ้งเตือน" : "เปิดการแจ้งเตือน"}</button>}{reminderMessage && <p role="status">{reminderMessage}</p>}</section>
      <section className="recent"><h2>โปรไฟล์นักวิ่ง</h2><p>ข้อมูลนี้ใช้ปรับคำแนะนำในอุปกรณ์ของคุณ และไม่ส่งต่อไปยังบริการ AI ภายนอก</p><form className="profile-form" onSubmit={saveProfile}><label>น้ำหนัก (กก.)<input inputMode="decimal" value={weightInput} onChange={event => setWeightInput(event.target.value)} placeholder="เช่น 65" /></label><label>Pace เป้าหมาย (นาที:วินาที/กม.)<input value={targetPaceInput} onChange={event => setTargetPaceInput(event.target.value)} placeholder="เช่น 6:00" /></label><label>Heart rate สูงสุด (bpm)<input inputMode="numeric" value={maxHeartRateInput} onChange={event => setMaxHeartRateInput(event.target.value)} placeholder="เช่น 185" /></label><label>เป้าหมายระยะวิ่ง/สัปดาห์ (กม.)<input inputMode="decimal" value={weeklyGoalInput} onChange={event => setWeeklyGoalInput(event.target.value)} placeholder="เช่น 30" /></label><button className="upload" disabled={busy}>บันทึกโปรไฟล์</button></form>{profileMessage && <p role="status">{profileMessage}</p>}</section>
      <section className="recent"><h2>ประวัติการวิ่ง</h2><p>เลือกกิจกรรมเพื่อเปิดผลที่วิเคราะห์ไว้ โดยไม่ต้องอัปโหลดไฟล์ซ้ำ</p>{activities.length ? <div className="run-list">{activities.map(activity => <div className="history-row" key={activity.id}><button type="button" onClick={() => openActivity(activity.id)} aria-pressed={activeActivityId === activity.id} disabled={busy}><span>{activity.originalName || "ไฟล์ FIT"}</span><span>{activityDate(activity.createdAt)}</span><span>{activity.importStatus === "analyzed" ? "วิเคราะห์แล้ว" : "กำลังดำเนินการ"}</span></button><button type="button" className="remove-activity" onClick={() => removeActivity(activity)} disabled={busy}>ลบ</button></div>)}</div> : <p>ยังไม่มีประวัติการวิ่ง</p>}</section>
      {result && <section className="recent"><h2>ผลการวิเคราะห์</h2><p>สถานะ: {result.status === "analyzed" ? "สำเร็จ" : result.status} {result.cached ? "(ใช้ผลที่คำนวณไว้แล้ว)" : ""}</p><div className="analytics-grid">{Object.entries(result.summary?.metrics || {}).slice(0, 12).map(([key, metric]) => <article className="metric-card" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value(metric.value, metric.unit ? ` ${metric.unit}` : "")}</strong></article>)}</div></section>}
      {result && <section className="recent coaching"><h2>คำแนะนำหลังการวิ่ง</h2><p>เป็นการสรุปจากข้อมูลกิจกรรมและเป้าหมายที่คุณตั้งไว้ ไม่ใช่คำแนะนำทางการแพทย์</p><ul>{coachingAdvice(result.summary, profile).map(note => <li key={note}>{note}</li>)}</ul></section>}
      {result && <section className="recent"><h2>โซนการฝึกและเป้าหมาย</h2>{(() => { const zones = heartRateZones(series, profile.maxHeartRate); const total = zones.reduce((sum, zone) => sum + zone.seconds, 0); const pace = result.summary?.metrics?.pace_s_km?.value; return <><p>{typeof profile.maxHeartRate === "number" ? `คำนวณจาก Max HR ${profile.maxHeartRate} bpm` : "เพิ่ม Max HR ในโปรไฟล์เพื่อดูโซนหัวใจ"}</p>{zones.length > 0 && total > 0 && <div className="zone-list">{zones.map(zone => <div className="zone-row" key={zone.name}><span>{zone.name}</span><div><i style={{ width: `${(zone.seconds / total) * 100}%` }} /></div><strong>{shortDuration(zone.seconds)}</strong></div>)}</div>}{typeof pace === "number" && typeof profile.targetPaceSecondsPerKm === "number" && <p className="goal-note">{pace <= profile.targetPaceSecondsPerKm ? "✓ Pace เฉลี่ยทำได้ตามเป้าหมาย" : `Pace เฉลี่ยช้ากว่าเป้าหมาย ${Math.round(pace - profile.targetPaceSecondsPerKm)} วินาที/กม.`}</p>}</>; })()}</section>}
      {result && <section className="recent"><div className="section-heading"><div><h2>กราฟระหว่างการวิ่ง</h2><p>แสดงเฉพาะช่วงที่นาฬิกาบันทึกข้อมูล</p></div><div className="segmented">{(Object.keys(CHARTS) as ChartName[]).map(name => <button type="button" key={name} className={chart === name ? "selected" : ""} onClick={() => setChart(name)} aria-pressed={chart === name}>{CHARTS[name].label}</button>)}</div></div>{series.length ? (() => { const data = chartPath(series, chart); return <figure className="activity-chart"><div className="chart-label"><strong>{CHARTS[chart].label}</strong><span>{value(data.min, ` ${CHARTS[chart].unit}`)} – {value(data.max, ` ${CHARTS[chart].unit}`)}</span></div><svg viewBox="0 0 600 220" role="img" aria-label={`กราฟ ${CHARTS[chart].label}`}><path className="chart-grid" d="M0 30H600 M0 110H600 M0 190H600" /><path className="chart-line" d={data.path} /></svg><figcaption>เริ่มการวิ่ง <span>จบการวิ่ง</span></figcaption></figure>; })() : <p>กำลังโหลดข้อมูลกราฟ…</p>}</section>}
    </>}
  </main>;
}
