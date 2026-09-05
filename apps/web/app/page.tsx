"use client";
import { FormEvent, useEffect, useRef, useState } from "react";

type Athlete = { id: string; display_name: string; timezone: string };
type Run = { id: string; started_at: string; distance_m: number | null; timer_time_s: number | null };
type Metric = { value: number | null; unit: string; coverage: number; confidence: string };
type Point = { time: string; running: boolean; [key: string]: string | boolean | number | null };
type Detail = Run & { analytics: { metric_version: string; metrics: Record<string, Metric> }; series: Point[];
  efficiency: { speed_per_heartbeat: Efficiency; power_per_heartbeat: Efficiency };
  relationships: { comparisons: Record<string, { available: boolean; coverage: number; unit: string;
    bins: { lower_power_w: number; upper_power_w_exclusive: number; paired_seconds: number; mean: number | null }[] }> };
  power_duration: { seconds: number; watts: number | null }[];
  laps: { index: number; distance_m: number | null; timer_time_s: number | null; avg_hr_bpm: number | null; avg_power_w: number | null }[] };
type Efficiency = { available: boolean; first_half: number | null; second_half: number | null;
  unit: string; drift_pct: number | null; paired_seconds: number; reason: string | null };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf = document.cookie.split("; ").find(c => c.startsWith("run_cal_csrf="))?.split("=")[1] || "";
  const response = await fetch(`/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store",
    headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      "X-CSRF-Token": decodeURIComponent(csrf), ...init.headers } });
  if (!response.ok) {
    if (response.status === 401) throw Object.assign(new Error("กรุณาเข้าสู่ระบบใหม่ หรือตรวจสอบชื่อผู้ใช้และ PIN"), { status: 401 });
    if (response.status >= 500) throw new Error("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.detail === "string" ? payload.detail : "ไม่สามารถทำรายการได้ กรุณาตรวจสอบข้อมูล");
  }
  return response.status === 204 ? undefined as T : response.json();
}
const value = (n: number | null | undefined, digits = 1) => n == null ? "—" : Number(n).toFixed(digits);
const labels: Record<string, string> = { pace_s_km: "Pace", heart_rate_bpm: "Heart rate", power_w: "Running power",
  cadence_spm: "Cadence", form_power_ratio: "Form power ratio", ground_contact_time_ms: "Ground contact time",
  vertical_oscillation_mm: "Vertical oscillation", stride_length_m: "Stride length", air_power_w: "Air power",
  leg_spring_stiffness_kn_m: "Leg spring stiffness" };

function Chart({ points, field, label }: { points: Point[]; field: string; label: string }) {
  const values = points.filter(p => p.running && typeof p[field] === "number").map(p => p[field] as number);
  if (!values.length) return <p>{label}: ยังไม่มีข้อมูล</p>;
  const min = Math.min(...values), max = Math.max(...values);
  const first = Date.parse(points[0].time), last = Date.parse(points[points.length - 1].time);
  const paths: string[] = [];
  let segment = "";
  points.forEach(p => {
    if (!p.running || typeof p[field] !== "number") { if (segment) paths.push(segment); segment = ""; return; }
    const x = 20 + (Date.parse(p.time) - first) / (last - first || 1) * 660;
    const y = 160 - ((p[field] as number) - min) / (max - min || 1) * 130;
    segment += `${segment ? " L" : "M"}${x},${y}`;
  });
  if (segment) paths.push(segment);
  return <figure><figcaption>{label} · {value(min)}–{value(max)}</figcaption>
    <svg viewBox="0 0 700 190" role="img" aria-label={`${label} ตามเวลา ตั้งแต่ ${value(min)} ถึง ${value(max)}`}>
      <path d="M20 170 H680" stroke="#69716c" />
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="#346b2b" strokeWidth="2" />)}
      <text x="20" y="188" fontSize="12">0 นาที</text><text x="600" y="188" fontSize="12">{value((last - first) / 60000)} นาที</text>
    </svg></figure>;
}

export default function Dashboard() {
  const [user, setUser] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);
  const selectedAthlete = athletes.find(a => a.id === athleteId);
  const date = (s: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: selectedAthlete?.timezone || "UTC" }).format(new Date(s));
  async function loadAthletes() {
    const result = await api<Athlete[]>("/athletes");
    setAthletes(result); setAthleteId(result[0]?.id || "");
  }
  useEffect(() => {
    api<{ username: string }>("/auth/me").then(async u => { setUser(u.username); await loadAthletes(); })
      .catch(e => { setUser(null); if (e.status !== 401) setError(e.message); }).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    const id = ++requestId.current;
    setDetail(null); setRuns([]); setError(""); setHasMore(false);
    if (!athleteId) return;
    setBusy(true);
    api<Run[]>(`/athletes/${athleteId}/activities`).then(result => {
      if (id === requestId.current) { setRuns(result); setHasMore(result.length === 50); }
    }).catch(e => { if (id === requestId.current) setError(e.message); })
      .finally(() => { if (id === requestId.current) setBusy(false); });
  }, [athleteId]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const u = await api<{ username: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username: form.get("username"), pin: form.get("pin") }) });
      setUser(u.username); await loadAthletes();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !athleteId) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        setNotice(`กำลังนำเข้า ${file.name}`);
        const form = new FormData(); form.append("file", file);
        const job = await api<{ status: string; import_job_id?: string }>(`/athletes/${athleteId}/fit-files`, { method: "POST", body: form });
        if (job.import_job_id && job.status !== "succeeded") await api(`/imports/${job.import_job_id}/process`, { method: "POST" });
      }
      const result = await api<Run[]>(`/athletes/${athleteId}/activities`);
      setRuns(result); setHasMore(result.length === 50); setNotice("นำเข้าสำเร็จแล้ว ไฟล์ที่ซ้ำจะไม่นำเข้าเพิ่ม");
    } catch (e) { setError((e as Error).message); setNotice(""); } finally { setBusy(false); }
  }
  async function openRun(id: string) {
    const request = ++requestId.current;
    setBusy(true); setError(""); setDetail(null);
    try { const result = await api<Detail>(`/activities/${id}`); if (request === requestId.current) setDetail(result); }
    catch (e) { if (request === requestId.current) setError((e as Error).message); }
    finally { if (request === requestId.current) setBusy(false); }
  }
  async function more() {
    setBusy(true);
    try { const result = await api<Run[]>(`/athletes/${athleteId}/activities?offset=${runs.length}`); setRuns([...runs, ...result]); setHasMore(result.length === 50); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await api("/auth/logout", { method: "POST" }); ++requestId.current; setUser(null); setAthleteId(""); setAthletes([]); setRuns([]); setDetail(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="live-dashboard">
    <header className="topbar"><div><p className="kicker">RUN | CAL</p><h1>Running analytics</h1></div>{user && <button disabled={busy} onClick={logout}>ออกจากระบบ</button>}</header>
    {error && <p role="alert" className="error">{error}</p>}
    <p role="status" aria-live="polite">{busy ? "กำลังโหลด / ประมวลผล…" : notice}</p>
    {!user ? <form className="login-form recent" onSubmit={login}><h2>เข้าสู่ระบบ</h2>
      <label>ชื่อผู้ใช้<input name="username" autoComplete="username" required minLength={3} maxLength={64} /></label>
      <label>PIN 6 หลัก<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="current-password" required /></label>
      <button className="upload" disabled={busy}>เข้าสู่ระบบ</button></form> : <>
      <section className="toolbar"><label>นักวิ่ง <select value={athleteId} disabled={busy} onChange={e => setAthleteId(e.target.value)}>{athletes.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
        <label>นำเข้า FIT <input aria-label="เลือกไฟล์ FIT" type="file" accept=".fit" multiple disabled={busy || !athleteId} onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label></section>
      {!athletes.length && !busy && <p>ยังไม่มีโปรไฟล์นักวิ่งที่คุณเข้าถึงได้ กรุณาให้ผู้ดูแลเพิ่มโปรไฟล์</p>}
      <section className="recent"><h2>กิจกรรมการวิ่ง</h2>{!runs.length && !busy && <p>ยังไม่มีกิจกรรม เริ่มด้วยการนำเข้าไฟล์ FIT ของคุณ</p>}
        <div className="run-list">{runs.map(run => <button key={run.id} disabled={busy} onClick={() => openRun(run.id)} aria-pressed={detail?.id === run.id}>
          <span>{date(run.started_at)}</span><b>{value(run.distance_m == null ? null : run.distance_m / 1000)} km</b><span>{value(run.timer_time_s == null ? null : run.timer_time_s / 60)} นาที</span></button>)}</div>
        {hasMore && <button disabled={busy} onClick={more}>โหลดกิจกรรมเพิ่มเติม</button>}
      </section>
      {detail && <section aria-label="รายละเอียดกิจกรรม"><h2>{date(detail.started_at)}</h2><p>ค่าเฉลี่ยถ่วงน้ำหนักตามเวลา · ไม่นับช่วงหยุดและช่องว่างเกิน 5 วินาที</p>
        <div className="analytics-grid">{Object.entries(labels).map(([key, label]) => { const metric = detail.analytics.metrics[key]; return <article className="metric-card" key={key}>
          <span>{label}</span><div><strong>{key === "pace_s_km" && metric?.value != null ? `${Math.floor(Math.round(metric.value) / 60)}:${String(Math.round(metric.value) % 60).padStart(2, "0")}` : value(metric?.value)}</strong><small>{key === "pace_s_km" ? "/km" : metric?.unit}</small></div>
          <small>{metric?.value == null ? "ข้อมูลไม่เพียงพอ" : `ข้อมูลครอบคลุม ${value(metric.coverage * 100, 0)}%`}</small></article>; })}</div>
        <div className="recent">{["power_w", "heart_rate_bpm", "speed_mps", "cadence_spm"].map(field => <Chart key={field} points={detail.series} field={field} label={labels[field] || "Speed (m/s)"} />)}</div>
        <div className="recent"><h2>กำลังสูงสุดตามระยะเวลา</h2><p>คำนวณเฉพาะข้อมูลต่อเนื่องทุกวินาที</p><div className="toolbar">{detail.power_duration.map(p => <p key={p.seconds}>{p.seconds} วินาที: <b>{value(p.watts)} W</b></p>)}</div></div>
        <section className="recent table-scroll" aria-label="ความสัมพันธ์กับกำลัง"><h2>ความเร็วและชีพจรตามช่วงกำลัง</h2>
          <p>เปรียบเทียบค่าที่วัดในเวลาเดียวกัน ยังไม่ได้ปรับความชันหรือการตอบสนองที่ล่าช้าของชีพจร จึงไม่ใช่ข้อสรุปว่าความฟิตดีขึ้น</p>
          {Object.entries(detail.relationships.comparisons).map(([key, comparison]) => <div key={key}>
            <h3>{key === "speed_by_power" ? "ความเร็วตามกำลัง" : "ชีพจรตามกำลัง"}</h3>
            <p>ข้อมูลจับคู่ครอบคลุม {value(comparison.coverage * 100, 0)}% ของเวลาที่สังเกตได้</p>
            {!comparison.available && <p>ข้อมูลไม่เพียงพอ ต้องมีอย่างน้อย 30 วินาทีในช่วงกำลังเดียวกัน</p>}
            {comparison.bins.length > 0 && <table><thead><tr><th>ช่วงกำลัง (W)</th><th>เวลาข้อมูล (วินาที)</th><th>ค่าเฉลี่ย ({comparison.unit})</th></tr></thead>
              <tbody>{comparison.bins.map(bin => <tr key={bin.lower_power_w}><td>{bin.lower_power_w} ถึงน้อยกว่า {bin.upper_power_w_exclusive}</td><td>{value(bin.paired_seconds, 0)}</td><td>{bin.mean == null ? "ข้อมูลไม่เพียงพอ" : value(bin.mean, 2)}</td></tr>)}</tbody></table>}
          </div>)}
        </section>
        <section className="recent" aria-label="ประสิทธิภาพและ Cardiac Drift"><h2>ประสิทธิภาพและ Cardiac Drift</h2>
          <p>เปรียบเทียบผลงานต่อการเต้นหัวใจระหว่างครึ่งแรกกับครึ่งหลัง โดยใช้เวลาข้อมูลที่จับคู่กันเท่ากัน</p>
          <div className="analytics-grid">{([
            ["ความเร็วต่อชีพจร", detail.efficiency.speed_per_heartbeat],
            ["กำลังต่อชีพจร", detail.efficiency.power_per_heartbeat],
          ] as [string, Efficiency][]).map(([label, metric]) => <article className="metric-card" key={label}>
            <span>{label}</span><div><strong>{metric.available ? `${value(metric.drift_pct)}%` : "—"}</strong><small>drift</small></div>
            <small>{metric.available ? `ครึ่งแรก ${value(metric.first_half, 3)} → ครึ่งหลัง ${value(metric.second_half, 3)} ${metric.unit}` : "ต้องมีข้อมูลเคลื่อนไหวที่จับคู่กันอย่างน้อย 20 นาที"}</small>
          </article>)}</div>
          <p><small>ค่าบวกหมายถึงผลงานต่อชีพจรลดลงในครึ่งหลัง สภาพอากาศ น้ำ ความชัน และลมอาจมีผล</small></p>
        </section>
        <div className="recent table-scroll"><h2>รอบวิ่ง (Laps)</h2><table><thead><tr><th>รอบ</th><th>km</th><th>นาที</th><th>HR</th><th>Power</th></tr></thead><tbody>{detail.laps.map(l => <tr key={l.index}><td>{l.index}</td><td>{value(l.distance_m == null ? null : l.distance_m / 1000)}</td><td>{value(l.timer_time_s == null ? null : l.timer_time_s / 60)}</td><td>{value(l.avg_hr_bpm)}</td><td>{value(l.avg_power_w)}</td></tr>)}</tbody></table>{!detail.laps.length && <p>ไฟล์นี้ไม่มีข้อมูลรอบวิ่ง</p>}</div>
      </section>}
    </>}
  </main>;
}
