"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanResult, TranscriptData } from "@/types";
import { ScheduleCard } from "@/components/ScheduleCard";
import { ValidationBadge } from "@/components/ValidationBadge";
import requirementsData from "@/data/requirements/statistics-data-science.json";
import offeringsData from "@/data/offerings/winter-2026.json";
import { computeRequirementStatus } from "@/lib/requirements";
import type { MajorRequirements, QuarterOfferings } from "@/types";

const requirements = requirementsData as unknown as MajorRequirements;
const offerings = offeringsData as unknown as QuarterOfferings;

// ── Tab config (matches HTML app) ─────────────────────────────
const TABS = [
  { id: "today",      label: "Today",      color: "#febc11" },
  { id: "degree",     label: "Degree",     color: "#5ba4cf" },
  { id: "planner",    label: "Planner",    color: "#7ab87a" },
  { id: "schedule",   label: "Schedule",   color: "#5b8a5b" },
  { id: "courses",    label: "Courses",    color: "#c4a04a" },
  { id: "transcript", label: "Transcript", color: "#d47a6a" },
  { id: "inbox",      label: "Inbox",      color: "#c08090" },
  { id: "calendar",   label: "Calendar",   color: "#93bad0" },
  { id: "share",      label: "Share",      color: "#c8b88a" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Helpers ───────────────────────────────────────────────────
function Fig({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card" style={{ padding: ".5rem .9rem", minWidth: 90 }}>
      <b style={{ font: "400 1.6rem var(--display)", display: "block", lineHeight: 1.2 }}>{value}</b>
      <span className="fine">{label}</span>
    </div>
  );
}

function ComingSoon({ tab }: { tab: string }) {
  return (
    <div className="empty" style={{ marginTop: "2rem", padding: "2.5rem 1.5rem" }}>
      <div style={{ fontSize: "2rem", marginBottom: ".5rem" }}>🚧</div>
      <strong>{tab}</strong> is coming soon.
      <br />
      <span className="fine">This tab will be built in an upcoming sprint.</span>
    </div>
  );
}

// ── Tab panels ────────────────────────────────────────────────

function TodayTab({ plan, transcript }: { plan: PlanResult | null; transcript: TranscriptData | null }) {
  if (!plan || !transcript) {
    return (
      <div>
        <h2 className="sec" style={{ "--acc": "var(--gold)" } as React.CSSProperties}>Today</h2>
        <div className="empty" style={{ marginTop: "1rem" }}>
          No schedule yet.{" "}
          <a href="/onboarding" style={{ color: "var(--gold)", fontWeight: 700 }}>Build your schedule →</a>
        </div>
      </div>
    );
  }

  const courses = plan.primary.courses;
  const days = ["M","T","W","R","F"];
  const today = days[new Date().getDay() - 1] ?? "M";

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "var(--gold)" } as React.CSSProperties}>Today</h2>

      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <Fig value={plan.primary.totalUnits} label="units enrolled" />
        <Fig value={courses.length} label="courses" />
        <Fig value={transcript.completedCourses.length} label="completed" />
        <Fig value={transcript.totalUnitsEarned} label="units earned" />
      </div>

      <h2 className="sec" style={{ "--acc": "var(--gold-d)" } as React.CSSProperties}>This week</h2>
      {courses.map((sc) => {
        const { days: cd, startTime, endTime } = sc.offering.schedule;
        return (
          <div key={sc.offering.code} className="card" style={{ marginBottom: ".5rem", display: "flex", gap: ".9rem", alignItems: "center" }}>
            <div style={{
              minWidth: "3.4rem", textAlign: "center",
              background: "var(--paper)", border: "2px solid var(--ink)",
              borderRadius: 10, padding: ".1rem .3rem",
              font: "400 .95rem var(--display)",
            }}>
              {cd.join("")}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: ".92rem" }}>{sc.offering.code}</strong>
              <span className="fine" style={{ marginLeft: ".5rem" }}>{sc.offering.title}</span>
              <div className="fine">{startTime}–{endTime} · {sc.offering.instructor}</div>
            </div>
            {sc.satisfies.map(g => (
              <span key={g} className="tag unk" style={{ fontSize: ".72rem" }}>{g}</span>
            ))}
          </div>
        );
      })}

      {plan.primary.validation.valid && (
        <div style={{ marginTop: "1rem" }}>
          <ValidationBadge validation={plan.primary.validation} />
        </div>
      )}
    </div>
  );
}

function DegreeTab({ transcript }: { transcript: TranscriptData | null }) {
  if (!transcript) return (
    <div>
      <h2 className="sec">Degree Audit</h2>
      <div className="empty" style={{ marginTop: "1rem" }}>
        Upload a transcript on the <a href="/onboarding" style={{ color: "var(--gold)", fontWeight: 700 }}>onboarding</a> page to see your audit.
      </div>
    </div>
  );

  const statuses = computeRequirementStatus(requirements, transcript.completedCourses);
  const done = statuses.filter(s => s.satisfied).length;

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#5ba4cf" } as React.CSSProperties}>Degree Audit</h2>
      <p className="fine" style={{ marginBottom: "1rem" }}>
        {requirements.major} · {done}/{statuses.length} requirement groups met
      </p>

      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <Fig value={done} label="groups complete" />
        <Fig value={statuses.length - done} label="groups remaining" />
        <Fig value={transcript.totalUnitsEarned} label="units earned" />
      </div>

      {statuses.map(s => (
        <details key={s.groupId} className="card" style={{ marginBottom: ".45rem", padding: ".5rem .9rem", cursor: "pointer" }}>
          <summary style={{ display: "flex", alignItems: "center", gap: ".6rem", listStyle: "none", fontWeight: 600 }}>
            <span className={`tag ${s.satisfied ? "good" : s.completedCourses.length > 0 ? "warn" : "bad"}`}>
              {s.satisfied ? "✓ Done" : s.stillNeeded > 0 ? `${s.stillNeeded} needed` : "Not started"}
            </span>
            <span style={{ flex: 1 }}>{s.groupName}</span>
          </summary>
          <div style={{ marginTop: ".6rem", paddingTop: ".6rem", borderTop: "1px solid var(--line)" }}>
            {s.completedCourses.length > 0 && (
              <div style={{ marginBottom: ".3rem" }}>
                <span className="fine">Completed: </span>
                {s.completedCourses.map(c => <span key={c} className="tag good" style={{ marginRight: ".25rem", fontSize: ".75rem" }}>{c}</span>)}
              </div>
            )}
            {s.remainingCourses.length > 0 && (
              <div>
                <span className="fine">Still needed: </span>
                {s.remainingCourses.map(c => <span key={c} className="tag unk" style={{ marginRight: ".25rem", fontSize: ".75rem" }}>{c}</span>)}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function ScheduleTab({ plan }: { plan: PlanResult | null }) {
  const [tab, setTab] = useState<"primary"|"backup1"|"backup2">("primary");

  if (!plan) return (
    <div>
      <h2 className="sec">Schedule Builder</h2>
      <div className="empty" style={{ marginTop: "1rem" }}>
        No schedule yet. <a href="/onboarding" style={{ color: "var(--gold)", fontWeight: 700 }}>Build your schedule →</a>
      </div>
    </div>
  );

  const schedule = tab === "primary" ? plan.primary : tab === "backup1" ? plan.backups[0] : plan.backups[1];

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#5b8a5b" } as React.CSSProperties}>Schedule Builder</h2>

      <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {(["primary","backup1","backup2"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="btn" style={{
            background: tab === t ? "var(--gold)" : "var(--surf)",
            borderColor: tab === t ? "var(--gold-d)" : "var(--line)",
            color: tab === t ? "var(--plate)" : "var(--ink2)",
            fontSize: ".85rem",
          }}>
            {t === "primary" ? "Primary" : t === "backup1" ? "Backup 1" : "Backup 2"}
          </button>
        ))}
      </div>

      <ScheduleCard schedule={schedule} title={tab === "primary" ? "Primary" : tab === "backup1" ? "Backup 1" : "Backup 2"} isPrimary={tab === "primary"} />
    </div>
  );
}

function CoursesTab() {
  const [filter, setFilter] = useState("");
  const filtered = offerings.courses.filter(c =>
    !filter || c.code.toLowerCase().includes(filter.toLowerCase()) || c.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#c4a04a" } as React.CSSProperties}>Courses — Winter 2026</h2>
      <input
        type="search"
        placeholder="Filter by code or title…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ marginBottom: "1rem", maxWidth: 320 }}
      />
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Title</th><th>Units</th><th>Meets</th><th>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.code}>
                <td><strong>{c.code}</strong></td>
                <td>{c.title}</td>
                <td>{c.units}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {c.schedule.days.join("")} {c.schedule.startTime}–{c.schedule.endTime}
                </td>
                <td className="fine">{c.instructor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TranscriptTab({ transcript }: { transcript: TranscriptData | null }) {
  if (!transcript) return (
    <div>
      <h2 className="sec">Transcript</h2>
      <div className="empty" style={{ marginTop: "1rem" }}>
        No transcript yet. <a href="/onboarding" style={{ color: "var(--gold)", fontWeight: 700 }}>Get started →</a>
      </div>
    </div>
  );

  // Group by quarter
  const byQuarter: Record<string, typeof transcript.completedCourses> = {};
  for (const c of transcript.completedCourses) {
    (byQuarter[c.quarter] ??= []).push(c);
  }

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#d47a6a" } as React.CSSProperties}>Transcript</h2>
      <p className="fine" style={{ marginBottom: "1rem" }}>
        {transcript.studentName} · {transcript.totalUnitsEarned} units earned
      </p>

      {Object.entries(byQuarter).map(([quarter, courses]) => (
        <div key={quarter} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "1.1rem", margin: "0 0 .3rem", fontFamily: "var(--display)" }}>{quarter}</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Course</th><th>Title</th><th>Units</th><th>Grade</th></tr>
              </thead>
              <tbody>
                {courses.map(c => (
                  <tr key={c.code}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.title}</td>
                    <td>{c.units}</td>
                    <td>
                      <span className={`tag ${c.grade.startsWith("A") ? "good" : c.grade.startsWith("B") ? "unk" : "warn"}`}>
                        {c.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShareTab({ transcript, plan }: { transcript: TranscriptData | null; plan: PlanResult | null }) {
  const [copied, setCopied] = useState(false);

  function exportJSON() {
    const data = { transcript, plan, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "schedule-one-export.json" });
    a.click();
  }

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#c8b88a" } as React.CSSProperties}>Share & Export</h2>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <button className="btn gold" onClick={exportJSON} disabled={!plan}>
          Download JSON
        </button>
        <button className="btn" onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="card" style={{ marginTop: "1.5rem", maxWidth: 320 }}>
        <div className="fine" style={{ marginBottom: ".5rem" }}>QR code export — coming soon</div>
        <div className="empty">QR generation will be added in a future sprint.</div>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [theme, setTheme] = useState<"light"|"dark">("light");

  useEffect(() => {
    const rawPlan = sessionStorage.getItem("plan_result");
    const rawTranscript = sessionStorage.getItem("transcript");
    if (rawPlan) setPlan(JSON.parse(rawPlan));
    if (rawTranscript) setTranscript(JSON.parse(rawTranscript));

    // Respect system dark mode on first load
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }

  function renderTab() {
    switch (activeTab) {
      case "today":      return <TodayTab plan={plan} transcript={transcript} />;
      case "degree":     return <DegreeTab transcript={transcript} />;
      case "planner":    return <ComingSoon tab="Planner" />;
      case "schedule":   return <ScheduleTab plan={plan} />;
      case "courses":    return <CoursesTab />;
      case "transcript": return <TranscriptTab transcript={transcript} />;
      case "inbox":      return <ComingSoon tab="Inbox" />;
      case "calendar":   return <ComingSoon tab="Calendar" />;
      case "share":      return <ShareTab transcript={transcript} plan={plan} />;
    }
  }

  return (
    <div className="app-shell">
      {/* ── Rail nav ── */}
      <nav className="rail" role="tablist" aria-label="Sections">
        <span className="rail-wordmark">SCHEDULE<br />ONE</span>
        <span className="rail-sub">UCSB · Winter 2026</span>

        {TABS.map(({ id, label, color }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className="tab"
            style={{ "--ta": color } as React.CSSProperties}
          >
            <i />{label}
          </button>
        ))}

        <div className="rail-signout">
          <button
            className="tab"
            style={{ "--ta": "var(--ink3)", color: "var(--ink3)", fontSize: ".8rem" } as React.CSSProperties}
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            <i style={{ background: "var(--ink3)" }} />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            className="tab"
            style={{ "--ta": "var(--bad)", color: "var(--ink3)", fontSize: ".8rem" } as React.CSSProperties}
            onClick={() => router.push("/onboarding")}
          >
            <i style={{ background: "var(--bad)" }} />
            New schedule
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="app-main" id="main" tabIndex={-1}>
        {renderTab()}
      </main>
    </div>
  );
}
