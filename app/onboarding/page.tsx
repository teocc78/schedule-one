"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StudentConstraints, DayOfWeek } from "@/types";

type Step = "intro" | "transcript" | "preferences" | "review";
const STEP_ORDER: Step[] = ["intro", "transcript", "preferences", "review"];
const STEP_LABELS: Record<Step, string> = { intro: "What you need", transcript: "Transcript", preferences: "Preferences", review: "Review" };

const DAYS: DayOfWeek[] = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<DayOfWeek, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };

const SAMPLES = [
  { label: "Early student", sublabel: "Sophomore · 32 units", file: "transcript-early.txt" },
  { label: "Mid student",   sublabel: "Junior · 84 units",    file: "transcript-mid.txt"   },
  { label: "Late student",  sublabel: "Senior · 148 units",   file: "transcript-late.txt"  },
];

const UNIT_PRESETS = [
  { label: "Light",  min: 8,  max: 12, desc: "2–3 courses" },
  { label: "Normal", min: 12, max: 16, desc: "3–4 courses" },
  { label: "Heavy",  min: 16, max: 20, desc: "4–5 courses" },
];

function ProgressBar({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "2rem" }}>
      {STEP_ORDER.map((step, i) => {
        const done = i < idx, active = i === idx;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: i < STEP_ORDER.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".3rem" }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: ".8rem", fontWeight: 700,
                background: done ? "var(--good)" : active ? "var(--gold)" : "var(--line)",
                color: done ? "#fff" : active ? "var(--plate)" : "var(--ink3)",
                boxShadow: active ? "0 0 0 4px var(--gold-s)" : "none",
                transition: "all .2s",
              }}>{done ? "✓" : i + 1}</div>
              <span style={{ fontSize: ".72rem", fontWeight: active ? 700 : 400, color: active ? "var(--gold)" : done ? "var(--ink2)" : "var(--ink3)", whiteSpace: "nowrap" }}>
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "var(--good)" : "var(--line)", margin: "0 .5rem", marginBottom: "1.2rem", transition: "background .2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("intro");
  const [text, setText] = useState("");
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [presetIdx, setPresetIdx] = useState(1);
  const [minUnits, setMinUnits] = useState(12);
  const [maxUnits, setMaxUnits] = useState(16);
  const [noClassBefore, setNoClassBefore] = useState("08:00");
  const [freeDays, setFreeDays] = useState<DayOfWeek[]>([]);
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState("");

  const goNext = () => { setError(""); const i = STEP_ORDER.indexOf(step); if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]); };
  const goBack = () => { const i = STEP_ORDER.indexOf(step); if (i > 0) setStep(STEP_ORDER[i - 1]); };

  async function loadSample(file: string) {
    setLoadingSample(file);
    try { setText(await (await fetch(`/samples/${file}`)).text()); }
    catch { setError("Could not load sample."); }
    finally { setLoadingSample(null); }
  }

  function applyPreset(i: number) {
    setPresetIdx(i);
    setMinUnits(UNIT_PRESETS[i].min);
    setMaxUnits(UNIT_PRESETS[i].max);
  }

  function submit() {
    if (!text.trim()) { setStep("transcript"); setError("Please add your transcript."); return; }
    const constraints: StudentConstraints = {
      minUnits, maxUnits, noClassBefore: noClassBefore || undefined, freeDays,
      mustInclude: mustInclude.split(",").map(s => s.trim()).filter(Boolean),
      mustExclude: mustExclude.split(",").map(s => s.trim()).filter(Boolean),
      freeText: freeText || undefined,
    };
    sessionStorage.setItem("transcript_text", text);
    sessionStorage.setItem("constraints", JSON.stringify(constraints));
    router.push("/processing");
  }

  // ── Shared style helpers ────────────────────────────────────
  const card = { background: "var(--surf)", border: "2px solid var(--line)", borderRadius: 18, padding: "1rem 1.1rem", marginBottom: ".5rem" };
  const btn = (active: boolean) => ({
    background: active ? "var(--gold)" : "var(--surf)",
    border: `2px solid ${active ? "var(--gold-d)" : "var(--line)"}`,
    borderRadius: 12, padding: ".5rem .9rem", cursor: "pointer",
    fontWeight: 600, fontSize: ".88rem", fontFamily: "var(--ui)",
    color: active ? "var(--plate)" : "var(--ink2)",
    transition: "all .15s",
  });

  const stepContent: Record<Step, React.ReactNode> = {
    intro: (
      <div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", marginBottom: ".4rem" }}>WHAT YOU'LL NEED</h2>
        <p className="fine" style={{ marginBottom: "1.25rem" }}>This takes about 2 minutes. Here's everything required.</p>
        {[
          { icon: "📋", title: "Unofficial transcript", desc: "From MyUCSB → Academic History → Unofficial Transcript. Just copy the text.", req: true },
          { icon: "🎓", title: "Your major",           desc: "Currently supports Statistics & Data Science. More majors coming soon.",        req: true },
          { icon: "⏰", title: "Scheduling preferences", desc: "Target unit count, times to avoid, days to keep free. All optional.",          req: false },
        ].map((item, i) => (
          <div key={i} style={{ ...card, display: "flex", gap: ".9rem", alignItems: "flex-start" }}>
            <span style={{ fontSize: "1.5rem", lineHeight: 1, marginTop: ".1rem" }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".2rem" }}>
                <span style={{ fontWeight: 700, fontSize: ".9rem" }}>{item.title}</span>
                <span className={`tag ${item.req ? "warn" : "unk"}`}>{item.req ? "Required" : "Optional"}</span>
              </div>
              <p className="fine" style={{ margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}
        <div style={{ ...card, background: "var(--gold-s)", borderColor: "var(--gold)", marginTop: "1rem" }}>
          <strong>Demo note:</strong> <span className="fine">This prototype uses mock course data for Winter 2027. Real UCSB offerings can be dropped in later.</span>
        </div>
        <button className="btn pri" style={{ width: "100%", marginTop: "1.25rem", fontSize: ".95rem" }} onClick={goNext}>
          I'm ready — let's go →
        </button>
      </div>
    ),

    transcript: (
      <div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", marginBottom: ".4rem" }}>ADD YOUR TRANSCRIPT</h2>
        <p className="fine" style={{ marginBottom: "1.25rem" }}>Paste your unofficial transcript, or try a sample.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".6rem", marginBottom: "1rem" }}>
          {SAMPLES.map(s => (
            <button key={s.file} onClick={() => loadSample(s.file)} style={{ ...card, cursor: "pointer", textAlign: "left", padding: ".7rem .8rem", border: `2px solid ${text && loadingSample !== s.file ? "var(--gold)" : "var(--line)"}` }}>
              <div style={{ fontWeight: 700, fontSize: ".82rem" }}>{s.label}</div>
              <div className="fine" style={{ fontSize: ".75rem" }}>{loadingSample === s.file ? "Loading…" : s.sublabel}</div>
            </button>
          ))}
        </div>

        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--line)" }} />
          <div style={{ position: "relative", textAlign: "center" }}>
            <span style={{ background: "var(--paper)", padding: "0 .75rem", fontSize: ".78rem", color: "var(--ink3)" }}>or paste your own</span>
          </div>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"Paste your unofficial transcript here...\n\nUCSB Unofficial Transcript\nStudent: Jane Doe\nMajor: Statistics & Data Science\n…"}
          style={{ width: "100%", height: 200, fontFamily: "monospace", fontSize: ".8rem", lineHeight: 1.6, resize: "none", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".35rem" }}>
          <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: "var(--ink3)", fontSize: ".8rem", cursor: "pointer", textDecoration: "underline" }}>
            Upload .txt file
          </button>
          {text && <button onClick={() => setText("")} style={{ background: "none", border: "none", color: "var(--bad)", fontSize: ".8rem", cursor: "pointer" }}>Clear</button>}
        </div>
        <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />

        {text && <div className="tag good" style={{ display: "inline-block", marginTop: ".75rem" }}>✓ {text.split("\n").length} lines added</div>}
        {error && <div className="tag bad" style={{ display: "inline-block", marginTop: ".75rem" }}>{error}</div>}

        <div style={{ display: "flex", gap: ".6rem", marginTop: "1.25rem" }}>
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn pri" style={{ flex: 1 }} onClick={() => { if (!text.trim()) { setError("Please add your transcript."); return; } setError(""); goNext(); }}>
            Continue →
          </button>
        </div>
      </div>
    ),

    preferences: (
      <div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", marginBottom: ".4rem" }}>YOUR PREFERENCES</h2>
        <p className="fine" style={{ marginBottom: "1.25rem" }}>All optional. The AI will do its best with whatever you share.</p>

        <label>How heavy a quarter?</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".6rem", marginBottom: "1rem" }}>
          {UNIT_PRESETS.map((p, i) => (
            <button key={i} onClick={() => applyPreset(i)} style={btn(presetIdx === i)}>
              <div>{p.label}</div>
              <div style={{ fontSize: ".75rem", opacity: .7 }}>{p.desc}</div>
              <div style={{ fontSize: ".75rem" }}>{p.min}–{p.max}u</div>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem", marginBottom: "1rem" }}>
          <div>
            <label>Min units</label>
            <input type="number" min={4} max={28} value={minUnits} onChange={e => { setMinUnits(+e.target.value); setPresetIdx(-1); }} />
          </div>
          <div>
            <label>Max units</label>
            <input type="number" min={4} max={28} value={maxUnits} onChange={e => { setMaxUnits(+e.target.value); setPresetIdx(-1); }} />
          </div>
        </div>

        <label>Earliest class start time</label>
        <input type="time" value={noClassBefore} onChange={e => setNoClassBefore(e.target.value)} style={{ width: "auto", marginBottom: "1rem" }} />

        <label>Keep these days free</label>
        <div style={{ display: "flex", gap: ".5rem", marginBottom: "1rem" }}>
          {DAYS.map(d => (
            <button key={d} onClick={() => setFreeDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])} style={{ ...btn(freeDays.includes(d)), width: 52, height: 40, padding: 0, textAlign: "center" }}>
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem", marginBottom: "1rem" }}>
          <div>
            <label>Must include</label>
            <input type="text" placeholder="PSTAT 131, MATH 4B" value={mustInclude} onChange={e => setMustInclude(e.target.value)} />
          </div>
          <div>
            <label>Avoid</label>
            <input type="text" placeholder="PSTAT 160B" value={mustExclude} onChange={e => setMustExclude(e.target.value)} />
          </div>
        </div>

        <label>Anything else?</label>
        <input type="text" placeholder="e.g. I want a lighter quarter, prefer afternoon classes" value={freeText} onChange={e => setFreeText(e.target.value)} style={{ marginBottom: "1.25rem" }} />

        <div style={{ display: "flex", gap: ".6rem" }}>
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn pri" style={{ flex: 1 }} onClick={goNext}>Continue →</button>
        </div>
      </div>
    ),

    review: (
      <div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", marginBottom: ".4rem" }}>READY TO BUILD</h2>
        <p className="fine" style={{ marginBottom: "1.25rem" }}>Here's a summary of what we'll use.</p>

        {[
          { icon: "📋", title: "Transcript", value: text ? `${text.split("\n").filter(Boolean).length} lines` : "Not added", tab: "transcript" as Step },
          { icon: "📐", title: "Unit load", value: `${minUnits}–${maxUnits} units`, tab: "preferences" as Step },
          {
            icon: "🗓️", title: "Schedule constraints",
            value: [
              noClassBefore !== "08:00" && `No classes before ${noClassBefore}`,
              freeDays.length && `Free: ${freeDays.map(d => DAY_LABELS[d]).join(", ")}`,
              mustInclude && `Include: ${mustInclude}`,
              mustExclude && `Avoid: ${mustExclude}`,
              freeText && `"${freeText}"`,
            ].filter(Boolean).join(" · ") || "No constraints set",
            tab: "preferences" as Step,
          },
        ].map(item => (
          <div key={item.title} style={{ ...card, display: "flex", alignItems: "flex-start", gap: ".9rem" }}>
            <span style={{ fontSize: "1.3rem" }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: ".9rem" }}>{item.title}</div>
              <p className="fine" style={{ margin: ".1rem 0 0", lineHeight: 1.4 }}>{item.value}</p>
            </div>
            <button onClick={() => setStep(item.tab)} style={{ background: "none", border: "none", color: "var(--gold)", fontWeight: 700, cursor: "pointer", fontSize: ".82rem" }}>Edit</button>
          </div>
        ))}

        <div style={{ ...card, background: "var(--gold-s)", borderColor: "var(--gold)", marginTop: ".5rem" }}>
          <span className="fine">Claude will parse your transcript, check your remaining requirements, and return 3 validated schedules in ~15–25 seconds.</span>
        </div>

        {error && <div className="tag bad" style={{ display: "inline-block", marginTop: ".75rem" }}>{error}</div>}

        <div style={{ display: "flex", gap: ".6rem", marginTop: "1.25rem" }}>
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn gold" style={{ flex: 1, fontSize: ".95rem" }} onClick={submit}>
            Build my schedule ✦
          </button>
        </div>
      </div>
    ),
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "2rem 1rem" }}>
      <div className="gold-bar" style={{ position: "fixed", top: 0, left: 0, right: 0 }} />

      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
          <a href="/" style={{ fontFamily: "var(--display)", fontSize: "1.1rem", textDecoration: "none", color: "var(--ink)", letterSpacing: ".02em" }}>
            SCHEDULE ONE
          </a>
          <span className="fine" style={{ fontSize: ".75rem", letterSpacing: ".04em" }}>UCSB · WINTER 2026</span>
        </div>

        <div className="card" style={{ borderRadius: 22 }}>
          <ProgressBar current={step} />
          {stepContent[step]}
        </div>
      </div>
    </div>
  );
}
