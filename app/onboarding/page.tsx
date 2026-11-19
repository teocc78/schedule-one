"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StudentConstraints, DayOfWeek, QuarterOfferings } from "@/types";
import { majors, minors, findProgram, combinedRequirements } from "@/lib/majors";
import { interestGroups, shortDescription } from "@/lib/interests";
import { FULL_TIME_MIN_UNITS } from "@/lib/standing";
import offeringsData from "@/data/offerings/winter-2027.json";

const offerings = offeringsData as unknown as QuarterOfferings;

type Step = "intro" | "major" | "transcript" | "mode" | "preferences" | "interests" | "review";
const FULL_ORDER: Step[] = ["intro", "major", "transcript", "mode", "preferences", "interests", "review"];
const QUICK_ORDER: Step[] = ["intro", "major", "transcript", "mode", "review"];
const STEP_LABELS: Record<Step, string> = {
  intro: "Start",
  major: "Major",
  transcript: "Transcript",
  mode: "How",
  preferences: "Preferences",
  interests: "Interests",
  review: "Review",
};

const DAYS: DayOfWeek[] = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<DayOfWeek, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };

// Fictional students with real 2026-27 UCSB courses. Picking one also sets the major.
const SAMPLES = [
  { label: "Sophomore", sublabel: "Economics & Accounting", file: "transcript-econ-accounting-sophomore.txt", major: "economics-accounting" },
  { label: "Junior", sublabel: "Biological Sciences", file: "transcript-biology-junior.txt", major: "biological-sciences" },
  { label: "Senior", sublabel: "Electrical Engineering", file: "transcript-ee-senior.txt", major: "electrical-engineering" },
];

// Every preset is at least 12 units, the full-time minimum.
const UNIT_PRESETS = [
  { label: "Light", min: 12, max: 13, desc: "3 courses" },
  { label: "Normal", min: 12, max: 16, desc: "3 to 4 courses" },
  { label: "Heavy", min: 16, max: 20, desc: "4 to 5 courses" },
];

function ProgressBar({ order, current }: { order: Step[]; current: Step }) {
  const idx = order.indexOf(current);
  return (
    <ol className="steps" aria-label="Progress">
      {order.map((step, i) => (
        <li key={step} className={i < idx ? "done" : i === idx ? "active" : ""} aria-current={i === idx ? "step" : undefined}>
          <span className="num">{i + 1}</span>
          <span className="lbl">{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<"quick" | "personal" | null>(null);
  const [major, setMajor] = useState("statistics-data-science");
  const [secondMajor, setSecondMajor] = useState("");
  const [minor, setMinor] = useState("");
  const [text, setText] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [sampleNote, setSampleNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [presetIdx, setPresetIdx] = useState(1);
  const [minUnits, setMinUnits] = useState(12);
  const [maxUnits, setMaxUnits] = useState(16);
  const [noClassBefore, setNoClassBefore] = useState("08:00");
  const [noClassAfter, setNoClassAfter] = useState("");
  const [freeDays, setFreeDays] = useState<DayOfWeek[]>([]);
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");
  const [freeText, setFreeText] = useState("");
  const [interested, setInterested] = useState<string[]>([]);
  const [error, setError] = useState("");

  const order = mode === "quick" ? QUICK_ORDER : FULL_ORDER;
  const programCodes = [major, secondMajor, minor].filter(Boolean);
  const notReady = programCodes.map(findProgram).filter((p) => p && !p.ready);

  const groups = useMemo(() => {
    const ready = [major, secondMajor, minor].filter((c) => c && findProgram(c)?.ready);
    try {
      return interestGroups(combinedRequirements(ready), offerings);
    } catch {
      return [];
    }
  }, [major, secondMajor, minor]);

  const go = (s: Step) => { setError(""); setStep(s); };
  const goNext = () => { const i = order.indexOf(step); if (i < order.length - 1) go(order[i + 1]); };
  const goBack = () => { const i = order.indexOf(step); if (i > 0) go(order[i - 1]); };

  async function loadSample(file: string, sampleMajor: string) {
    setBusy(file);
    try {
      setText(await (await fetch(`/samples/${file}`)).text());
      const changed = sampleMajor !== major || secondMajor || minor;
      setMajor(sampleMajor);
      setSecondMajor("");
      setMinor("");
      setFileNote(file);
      setSampleNote(changed ? `Your major is now ${findProgram(sampleMajor)?.name ?? sampleMajor}, to match this sample.` : "");
    }
    catch { setError("Couldn't load that sample."); }
    finally { setBusy(null); }
  }

  async function uploadFile(f: File) {
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/extract-text", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.text !== "string") throw new Error(data.error ?? "Couldn't read that file.");
      setText(data.text);
      setFileNote(f.name);
      setSampleNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyPreset(i: number) {
    setPresetIdx(i);
    setMinUnits(UNIT_PRESETS[i].min);
    setMaxUnits(UNIT_PRESETS[i].max);
  }

  function toggleInterest(code: string) {
    setInterested((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function submit() {
    if (!text.trim()) { go("transcript"); setError("Add your transcript first."); return; }
    if (notReady.length) { go("major"); setError("Pick a program Schedule One supports today."); return; }
    const personal = mode === "personal";
    const constraints: StudentConstraints = personal
      ? {
          minUnits, maxUnits,
          noClassBefore: noClassBefore || undefined,
          noClassAfter: noClassAfter || undefined,
          freeDays,
          mustInclude: mustInclude.split(",").map((s) => s.trim()).filter(Boolean),
          mustExclude: mustExclude.split(",").map((s) => s.trim()).filter(Boolean),
          interested,
          freeText: freeText || undefined,
        }
      : { minUnits: 12, maxUnits: 16, freeDays: [], mustInclude: [], mustExclude: [] };
    sessionStorage.setItem("transcript_text", text);
    sessionStorage.setItem("constraints", JSON.stringify(constraints));
    sessionStorage.setItem("programs", JSON.stringify({ majors: [major, secondMajor].filter(Boolean), minor: minor || undefined }));
    router.push("/processing");
  }

  const choice = (active: boolean) => `choice${active ? " on" : ""}`;
  const lineCount = text.split("\n").filter(Boolean).length;

  const stepContent: Record<Step, React.ReactNode> = {
    intro: (
      <div>
        <h1 className="h">What you need</h1>
        <p className="fine lead">About two minutes. Nothing is saved on a server.</p>
        <ul className="plain-list">
          <li><strong>Your major</strong> <span className="tag warn">Required</span><br /><span className="fine">Add a second major or a minor if you have one.</span></li>
          <li><strong>Your unofficial transcript</strong> <span className="tag warn">Required</span><br /><span className="fine">Upload the PDF from GOLD, a .txt file, or paste the text.</span></li>
          <li><strong>Preferences</strong> <span className="tag unk">Optional</span><br /><span className="fine">Units, times and days off. Skip them and Schedule One uses sensible defaults.</span></li>
          <li><strong>Your GOLD registration info</strong> <span className="tag unk">Tip</span><br /><span className="fine">Take a screenshot of your pass times, holds and unit limit in GOLD. You&apos;ll want them when you register.</span></li>
        </ul>
        <div className="note">
          <strong>Not here yet:</strong> <span className="fine">study abroad courses (UCEAP and other universities) and transfer courses from community colleges. For now, they won&apos;t count toward your requirements.</span>
        </div>
        <button className="btn pri wide" onClick={goNext}>Start</button>
      </div>
    ),

    major: (
      <div>
        <h1 className="h">Your major</h1>
        <p className="fine lead">Schedule One checks your requirements against what you&apos;ve finished.</p>
        <label htmlFor="major">Major</label>
        <select id="major" value={major} onChange={(e) => setMajor(e.target.value)}>
          {majors().map((p) => (
            <option key={p.code} value={p.code} disabled={!p.ready}>{p.name}{p.ready ? "" : " (coming soon)"}</option>
          ))}
        </select>
        <label htmlFor="major2">Second major <span className="fine">(optional)</span></label>
        <select id="major2" value={secondMajor} onChange={(e) => setSecondMajor(e.target.value)}>
          <option value="">None</option>
          {majors().filter((p) => p.code !== major).map((p) => (
            <option key={p.code} value={p.code} disabled={!p.ready}>{p.name}{p.ready ? "" : " (coming soon)"}</option>
          ))}
        </select>
        <label htmlFor="minor">Minor <span className="fine">(optional)</span></label>
        <select id="minor" value={minor} onChange={(e) => setMinor(e.target.value)} disabled={minors().length === 0}>
          <option value="">{minors().length ? "None" : "Minors coming soon"}</option>
          {minors().map((p) => (
            <option key={p.code} value={p.code} disabled={!p.ready}>{p.name}{p.ready ? "" : " (coming soon)"}</option>
          ))}
        </select>
        <p className="fine">Programs marked &quot;coming soon&quot; are listed but can&apos;t be planned yet.</p>
        {error && <div className="tag bad">{error}</div>}
        <div className="row">
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn pri grow" onClick={goNext}>Continue</button>
        </div>
      </div>
    ),

    transcript: (
      <div>
        <h1 className="h">Your transcript</h1>
        <p className="fine lead">Upload your unofficial transcript, paste it, or try a sample.</p>

        <div className="grid3">
          {SAMPLES.map((s) => (
            <button key={s.file} className="choice" onClick={() => loadSample(s.file, s.major)}>
              <strong>{s.label}</strong>
              <span className="fine">{busy === s.file ? "Loading..." : s.sublabel}</span>
            </button>
          ))}
        </div>

        <button className="btn wide" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
          {busy === "upload" ? "Reading file..." : "Upload PDF or .txt"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />

        <label htmlFor="paste">Or paste it here</label>
        <textarea
          id="paste"
          value={text}
          onChange={(e) => { setText(e.target.value); setFileNote(""); setSampleNote(""); }}
          placeholder={"FALL 2024\nMATH 3A  Calculus with Applications I  4.0  A\n..."}
          className="mono"
        />
        <div className="row between">
          <span className="fine">{text ? (fileNote ? `Read from ${fileNote}, ${lineCount} lines` : `${lineCount} lines added`) : ""}</span>
          {text && <button className="link bad" onClick={() => { setText(""); setFileNote(""); setSampleNote(""); }}>Clear</button>}
        </div>
        {sampleNote && text && <div className="note">{sampleNote}</div>}
        {error && <div className="tag bad">{error}</div>}

        <div className="row">
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn pri grow" onClick={() => { if (!text.trim()) { setError("Add your transcript first."); return; } goNext(); }}>Continue</button>
        </div>
      </div>
    ),

    mode: (
      <div>
        <h1 className="h">How do you want to plan?</h1>
        <p className="fine lead">You can switch on the review screen.</p>
        <button className={choice(mode === "quick")} onClick={() => { setMode("quick"); go("review"); }}>
          <strong>Build it for me</strong>
          <span className="fine">12 to 16 units, any days and times. The fastest way to a schedule.</span>
        </button>
        <button className={choice(mode === "personal")} onClick={() => { setMode("personal"); go("preferences"); }}>
          <strong>Personalize</strong>
          <span className="fine">Set units, times and days off, and pick courses that seem interesting. You can skip any part.</span>
        </button>
        <div className="row">
          <button className="btn" onClick={goBack}>Back</button>
        </div>
      </div>
    ),

    preferences: (
      <div>
        <h1 className="h">Preferences</h1>
        <p className="fine lead">All optional.</p>

        <label>How heavy a quarter?</label>
        <div className="grid3">
          {UNIT_PRESETS.map((p, i) => (
            <button key={p.label} className={choice(presetIdx === i)} onClick={() => applyPreset(i)}>
              <strong>{p.label}</strong>
              <span className="fine">{p.min} to {p.max} units</span>
              <span className="fine">{p.desc}</span>
            </button>
          ))}
        </div>
        <div className="grid2">
          <div>
            <label htmlFor="minu">Min units</label>
            <input id="minu" type="number" min={4} max={21} value={minUnits} onChange={(e) => { setMinUnits(+e.target.value); setPresetIdx(-1); }} />
          </div>
          <div>
            <label htmlFor="maxu">Max units</label>
            <input id="maxu" type="number" min={4} max={21} value={maxUnits} onChange={(e) => { setMaxUnits(+e.target.value); setPresetIdx(-1); }} />
          </div>
        </div>
        {minUnits < FULL_TIME_MIN_UNITS
          ? <div className="note warn">Under {FULL_TIME_MIN_UNITS} units you aren&apos;t a full-time student, which can affect financial aid, housing and visas.</div>
          : <p className="fine">{FULL_TIME_MIN_UNITS} units is the full-time minimum. 21 units is the most you can register for in a quarter.</p>}

        <div className="grid2">
          <div>
            <label htmlFor="start">Earliest class start</label>
            <input id="start" type="time" value={noClassBefore} onChange={(e) => setNoClassBefore(e.target.value)} />
          </div>
          <div>
            <label htmlFor="end">Latest class end</label>
            <input id="end" type="time" value={noClassAfter} onChange={(e) => setNoClassAfter(e.target.value)} />
          </div>
        </div>

        <label>Keep these days free</label>
        <div className="row">
          {DAYS.map((d) => (
            <button key={d} className={choice(freeDays.includes(d)) + " day"} aria-pressed={freeDays.includes(d)} onClick={() => setFreeDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}>
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>

        <div className="grid2">
          <div>
            <label htmlFor="inc">Must include</label>
            <input id="inc" type="text" placeholder="PSTAT 131, MATH 4B" value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} />
          </div>
          <div>
            <label htmlFor="exc">Avoid</label>
            <input id="exc" type="text" placeholder="PSTAT 160B" value={mustExclude} onChange={(e) => setMustExclude(e.target.value)} />
          </div>
        </div>

        <label htmlFor="else">Anything else?</label>
        <input id="else" type="text" placeholder="e.g. afternoon classes, a lighter quarter" value={freeText} onChange={(e) => setFreeText(e.target.value)} />

        <div className="row">
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn" onClick={goNext}>Skip</button>
          <button className="btn pri grow" onClick={goNext}>Continue</button>
        </div>
      </div>
    ),

    interests: (
      <div>
        <h1 className="h">What seems interesting?</h1>
        <p className="fine lead">Tick upper-division courses you&apos;d like to take. Schedule One favors them when they fit a requirement. Skip this if you have no preference.</p>
        {groups.length === 0 && <p className="fine">No upper-division courses to show for this program yet.</p>}
        {groups.map((g) => (
          <fieldset key={g.id} className="group">
            <legend>{g.name}</legend>
            {g.description && <p className="fine">{g.description}</p>}
            {g.courses.map((c) => (
              <label key={c.code} className="pick">
                <input type="checkbox" checked={interested.includes(c.code)} onChange={() => toggleInterest(c.code)} />
                <span>
                  <strong>{c.code}</strong>{c.title ? ` ${c.title}` : ""}
                  <span className="fine block">
                    {c.description ? shortDescription(c.description) : "No description yet."}
                    {!c.offeredThisQuarter && " Not offered in Winter 2027."}
                  </span>
                  <span className="fine">Seems interesting</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="row">
          <button className="btn" onClick={goBack}>Back</button>
          <button className="btn" onClick={() => { setInterested([]); goNext(); }}>Skip</button>
          <button className="btn pri grow" onClick={goNext}>{interested.length ? `Continue with ${interested.length}` : "Continue"}</button>
        </div>
      </div>
    ),

    review: (
      <div>
        <h1 className="h">Ready to build</h1>
        <p className="fine lead">Here&apos;s what Schedule One will use.</p>
        <dl className="summary">
          <div><dt>Program</dt><dd>{programCodes.map((c) => findProgram(c)?.name ?? c).join(" + ")}</dd><button className="link" onClick={() => go("major")}>Edit</button></div>
          <div><dt>Transcript</dt><dd>{text ? `${lineCount} lines` : "Not added"}</dd><button className="link" onClick={() => go("transcript")}>Edit</button></div>
          {mode === "personal" ? (
            <>
              <div><dt>Units</dt><dd>{minUnits} to {maxUnits}</dd><button className="link" onClick={() => go("preferences")}>Edit</button></div>
              <div>
                <dt>Times and days</dt>
                <dd>
                  {[
                    noClassBefore && noClassBefore !== "08:00" && `Start after ${noClassBefore}`,
                    noClassAfter && `End by ${noClassAfter}`,
                    freeDays.length && `Free: ${freeDays.map((d) => DAY_LABELS[d]).join(", ")}`,
                    mustInclude && `Include: ${mustInclude}`,
                    mustExclude && `Avoid: ${mustExclude}`,
                  ].filter(Boolean).join(". ") || "No limits"}
                </dd>
                <button className="link" onClick={() => go("preferences")}>Edit</button>
              </div>
              <div><dt>Interesting</dt><dd>{interested.length ? interested.join(", ") : "None picked"}</dd><button className="link" onClick={() => go("interests")}>Edit</button></div>
            </>
          ) : (
            <div><dt>Preferences</dt><dd>Built for you: 12 to 16 units, any times</dd><button className="link" onClick={() => { setMode("personal"); go("preferences"); }}>Personalize</button></div>
          )}
        </dl>
        <p className="fine">You&apos;ll get a main schedule and two backups in about 20 seconds.</p>
        {error && <div className="tag bad">{error}</div>}
        <div className="row">
          <button className="btn" onClick={() => go(mode === "personal" ? "interests" : "mode")}>Back</button>
          <button className="btn pri grow" onClick={submit}>Build my schedule</button>
        </div>
      </div>
    ),
  };

  return (
    <div className="onboard">
      <div className="gold-bar" />
      <div className="onboard-inner">
        <header className="row between">
          <Link href="/" className="brand">Schedule One</Link>
          <span className="fine">UCSB, Winter 2027</span>
        </header>
        <div className="card onboard-card">
          <ProgressBar order={order} current={step} />
          {stepContent[step]}
        </div>
      </div>
    </div>
  );
}
