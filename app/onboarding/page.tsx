"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StudentConstraints, DayOfWeek, QuarterOfferings } from "@/types";
import { majors, minors, findProgram, combinedRequirements } from "@/lib/majors";
import { interestGroups, type CatalogLookup } from "@/lib/interests";
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
  { label: "Economics & Accounting", sublabel: "Sophomore", file: "transcript-econ-accounting-sophomore.txt", major: "economics-accounting" },
  { label: "Biology", sublabel: "Junior", file: "transcript-biology-junior.txt", major: "biological-sciences" },
  { label: "Electrical Engineering", sublabel: "Senior", file: "transcript-ee-senior.txt", major: "electrical-engineering" },
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
  // Label of the example transcript in the box, if one is loaded and unedited.
  const [example, setExample] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [presetIdx, setPresetIdx] = useState(1);
  const [minUnits, setMinUnits] = useState(12);
  const [maxUnits, setMaxUnits] = useState(16);
  const [noClassBefore, setNoClassBefore] = useState("08:00");
  const [noClassAfter, setNoClassAfter] = useState("");
  const [freeDays, setFreeDays] = useState<DayOfWeek[]>([]);
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");
  const [interested, setInterested] = useState<string[]>([]);
  // Catalog titles and descriptions for courses not offered this quarter.
  const [catalog, setCatalog] = useState<CatalogLookup>({});
  const requestedCodes = useRef(new Set<string>());
  const [error, setError] = useState("");

  const order = mode === "quick" ? QUICK_ORDER : FULL_ORDER;
  const programCodes = [major, secondMajor, minor].filter(Boolean);
  const notReady = programCodes.map(findProgram).filter((p) => p && !p.ready);

  const groups = useMemo(() => {
    const ready = [major, secondMajor, minor].filter((c) => c && findProgram(c)?.ready);
    try {
      return interestGroups(combinedRequirements(ready), offerings, catalog);
    } catch {
      return [];
    }
  }, [major, secondMajor, minor, catalog]);

  // Fetch catalog descriptions for courses this quarter's data doesn't describe.
  useEffect(() => {
    const codes = [...new Set(groups.flatMap((g) => g.courses).filter((c) => !c.description).map((c) => c.code))]
      .filter((c) => !requestedCodes.current.has(c));
    if (codes.length === 0) return;
    codes.forEach((c) => requestedCodes.current.add(c));
    fetch(`/api/courses?codes=${encodeURIComponent(codes.join(","))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.courses) setCatalog((prev) => ({ ...prev, ...d.courses })); })
      .catch(() => {});
  }, [groups]);

  const go = (s: Step) => { setError(""); setStep(s); };
  const goNext = () => { const i = order.indexOf(step); if (i < order.length - 1) go(order[i + 1]); };
  const goBack = () => { const i = order.indexOf(step); if (i > 0) go(order[i - 1]); };

  async function loadSample(file: string, sampleMajor: string, label: string) {
    setBusy(file);
    try {
      setText(await (await fetch(`/samples/${file}`)).text());
      const changed = sampleMajor !== major || secondMajor || minor;
      setMajor(sampleMajor);
      setSecondMajor("");
      setMinor("");
      setFileNote(file);
      setExample(label);
      const majorName = findProgram(sampleMajor)?.name ?? sampleMajor;
      setSampleNote(
        `EXAMPLE: made-up ${label} student.` +
          (changed ? ` Major set to ${majorName}.` : "") +
          " Clear it to add yours."
      );
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
      setExample("");
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
        }
      : { minUnits: 12, maxUnits: 16, freeDays: [], mustInclude: [], mustExclude: [] };
    sessionStorage.setItem("transcript_text", text);
    if (example) sessionStorage.setItem("example_transcript", example);
    else sessionStorage.removeItem("example_transcript");
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
          <li><strong>Your major</strong> <span className="tag warn">Required</span></li>
          <li><strong>Your unofficial transcript</strong> <span className="tag warn">Required</span></li>
          <li><strong>Preferences</strong> <span className="tag unk">Optional</span></li>
          <li><strong>Your GOLD pass times</strong> <span className="tag unk">Tip</span></li>
        </ul>
        <p className="fine">Study abroad and transfer courses don&apos;t count yet.</p>
        <button className="btn pri wide" onClick={goNext}>Start</button>
      </div>
    ),

    major: (
      <div>
        <h1 className="h">Your major</h1>
        <p className="fine lead">Add a second major or minor if you have one.</p>
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
        <p className="fine lead">Upload or paste your unofficial transcript, or try an example.</p>

        <div className="fine" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 .4rem" }}>
          Example transcripts <span className="tag unk" style={{ marginLeft: ".3rem" }}>made-up students</span>
        </div>
        <div className="grid3">
          {SAMPLES.map((s) => (
            <button key={s.file} className={choice(example === s.label)} onClick={() => loadSample(s.file, s.major, s.label)}>
              <span className="fine" style={{ fontWeight: 700, letterSpacing: ".05em" }}>EXAMPLE</span>
              <strong>{s.label}</strong>
              <span className="fine">{busy === s.file ? "Loading..." : `Made-up ${s.sublabel.toLowerCase()}`}</span>
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
          onChange={(e) => { setText(e.target.value); setFileNote(""); setSampleNote(""); setExample(""); }}
          placeholder={"FALL 2024\nMATH 3A  Calculus with Applications I  4.0  A\n..."}
          className="mono"
        />
        <div className="row between">
          <span className="fine">{text ? (example ? `Example transcript loaded, ${lineCount} lines` : fileNote ? `Read from ${fileNote}, ${lineCount} lines` : `${lineCount} lines added`) : ""}</span>
          {text && <button className="link bad" onClick={() => { setText(""); setFileNote(""); setSampleNote(""); setExample(""); }}>Clear</button>}
        </div>
        {sampleNote && text && <div className="note warn">{sampleNote}</div>}
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
          <span className="fine">12 to 16 units, any time.</span>
        </button>
        <button className={choice(mode === "personal")} onClick={() => { setMode("personal"); go("preferences"); }}>
          <strong>Personalize</strong>
          <span className="fine">Units, times, days off and courses you like.</span>
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
          ? <div className="note warn">Under {FULL_TIME_MIN_UNITS} units is part time, which can affect aid, housing and visas.</div>
          : <p className="fine">Full time is {FULL_TIME_MIN_UNITS}+ units. Max 21.</p>}

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
        <p className="fine lead">
          Tick courses you&apos;d like. Tap Description to read more.{" "}
          <a href={`/courses?major=${encodeURIComponent(major)}`} target="_blank" rel="noopener noreferrer">All classes</a>
        </p>
        {groups.length === 0 && <p className="fine">No upper-division courses to show for this program yet.</p>}
        {groups.map((g) => (
          <fieldset key={g.id} className="group">
            <legend>{g.name}</legend>
            {g.description && <p className="fine">{g.description}</p>}
            {g.courses.map((c) => {
              const id = `pick-${c.code.replace(/\W+/g, "-")}`;
              return (
                <div key={c.code} className="pick-row">
                  <input id={id} type="checkbox" checked={interested.includes(c.code)} onChange={() => toggleInterest(c.code)} />
                  <div className="grow">
                    <label htmlFor={id} className="pick-name">
                      <strong>{c.code}</strong>{c.title ? ` ${c.title}` : ""}
                    </label>
                    {!c.offeredThisQuarter && <span className="tag unk" style={{ fontSize: ".7rem", marginLeft: ".35rem" }}>Not in Winter</span>}
                    {c.description && (
                      <details className="more">
                        <summary>Description</summary>
                        <p>{c.description}</p>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
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
          <div><dt>Transcript</dt><dd>{!text ? "Not added" : example ? <><span className="tag warn">EXAMPLE</span> {example} (made-up student)</> : `${lineCount} lines`}</dd><button className="link" onClick={() => go("transcript")}>Edit</button></div>
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
        <p className="fine">You&apos;ll get a schedule, two backups and a 4-year plan.</p>
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
