"use client";

/**
 * Planner tab (spec sections 1-7, UI step 7 of the build order):
 * calendar blocks, the time/professor toggle, the two-phase plan, the
 * open-slot finder with backups, GE status and recommendations, the pass
 * plan and the free GOLD cart prompt. All hard rules come from lib/*;
 * this component only displays them.
 */

import { useEffect, useMemo, useState } from "react";
import {
  DAYS,
  planQuarter,
  findOpenSlots,
  type CourseSections,
  type Day,
  type Pick,
  type PlannerSettings,
  type TimeBlock,
  type OptionRow,
} from "@/lib/schedule-engine";
import { LOCKED_W27 } from "@/lib/samples/winter-2027";
import { computeGEStatus, GE_AREAS, GE_SPECIALS, type GELine } from "@/lib/ge";
import { recommendCourses } from "@/lib/recommend";
import { planPasses, PASS_NOTES, type FillRisk } from "@/lib/pass-planner";
import { buildCartPrompt } from "@/lib/cart-prompt";
import { FEATURES } from "@/lib/flags";
import { seatLikelihood, offeredLikelihood } from "@/lib/likelihood";
import { loadFixtureHistory } from "@/lib/ucsb/fixtures";

const QUARTER = "20271";
const QUARTER_LABEL = "Winter 2027";
const HOURS = Array.from({ length: 14 }, (_, i) => 8 + i); // 8:00-21:00 rows
const DAY_NAME: Record<Day, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };

type CellState = "free" | "soft" | "hard";
const nextState: Record<CellState, CellState> = { free: "soft", soft: "hard", hard: "free" };
const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

function cellsToBlocks(cells: Record<string, CellState>): TimeBlock[] {
  return Object.entries(cells)
    .filter(([, s]) => s !== "free")
    .map(([key, s]) => {
      const [day, hour] = key.split("-");
      const h = Number(hour);
      return { day: day as Day, start: pad(h), end: pad(h + 1), kind: s as "soft" | "hard" };
    });
}

function fmt(p: { lecture: { meetings: { days: Day[]; start: string; end: string }[] } }) {
  return p.lecture.meetings.map((m) => `${m.days.join("")} ${m.start}-${m.end}`).join(", ");
}

function Card({ title, children, acc }: { title: string; children: React.ReactNode; acc?: string }) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 className="sec" style={{ "--acc": acc ?? "#7ab87a" } as React.CSSProperties}>{title}</h2>
      {children}
    </section>
  );
}

export function QuarterPlanner() {
  const [priority, setPriority] = useState<PlannerSettings["priority"]>("time");
  const [buffer, setBuffer] = useState(0);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [locked, setLocked] = useState<Pick[]>(LOCKED_W27);
  const [candidates, setCandidates] = useState<CourseSections[]>([]);
  const [wanted, setWanted] = useState<string[]>(["JAPAN 80"]);
  const [source, setSource] = useState<{ source: string; warning?: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  // Progress-check lines the student marks as already met. Sample: only
  // Writing and World Cultures still open.
  const [metLines, setMetLines] = useState<GELine[]>(["A", "B", "C", "D", "E", "F", "G", "ET", "QNT"]);
  const [registered, setRegistered] = useState(0);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ucsb/classes?quarter=${QUARTER}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !data) {
          setLoadError(data?.error ?? "Couldn't load class data.");
          return;
        }
        const lockedIds = new Set(LOCKED_W27.map((p) => p.courseId));
        setCandidates((data.courses as CourseSections[]).filter((c) => !lockedIds.has(c.courseId)));
        setSource({ source: data.source, warning: data.warning });
      })
      .catch(() => alive && setLoadError("Couldn't load class data."));
    return () => {
      alive = false;
    };
  }, []);

  const settings: PlannerSettings = useMemo(
    () => ({ priority, blocks: cellsToBlocks(cells), bufferMinutes: buffer }),
    [priority, cells, buffer]
  );

  const plan = useMemo(
    () => planQuarter({ locked, courses: candidates.filter((c) => wanted.includes(c.courseId)), settings }),
    [locked, candidates, wanted, settings]
  );

  const openRows = useMemo(
    () => findOpenSlots(candidates.filter((c) => !plan.picks.some((p) => p.courseId === c.courseId)), plan.picks, settings),
    [candidates, plan.picks, settings]
  );

  const geOverrides = useMemo(() => {
    const o: Partial<Record<GELine, boolean>> = {};
    for (const l of [...GE_AREAS, ...GE_SPECIALS]) o[l] = metLines.includes(l);
    return o;
  }, [metLines]);
  const geStatus = useMemo(() => computeGEStatus([], undefined, geOverrides), [geOverrides]);

  const recs = useMemo(
    () =>
      recommendCourses({
        candidates: candidates.filter((c) => !plan.picks.some((p) => p.courseId === c.courseId)),
        geStatus,
        picks: plan.picks,
        settings,
        maxCourses: 3,
      }),
    [candidates, geStatus, plan.picks, settings]
  );

  const unitsOf = (id: string) =>
    candidates.find((c) => c.courseId === id)?.units ?? ({ "PSY 10B": 5, "PSTAT 8": 5, "EEMB 7": 4 } as Record<string, number>)[id] ?? 4;

  const passPlan = useMemo(() => {
    const courses = plan.picks.map((p) => {
      const seat = seatLikelihood({ history: loadFixtureHistory(p.courseId), pass: 1 });
      const fillRisk: FillRisk = seat.bucket === "Low" ? "high" : seat.bucket === "Medium" ? "medium" : "low";
      return { courseId: p.courseId, units: unitsOf(p.courseId), fillRisk, waitlist: waitlist.includes(p.courseId) };
    });
    return planPasses(courses, registered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.picks, registered, waitlist, candidates]);

  const cartPrompt = useMemo(() => buildCartPrompt({ quarterLabel: QUARTER_LABEL, picks: plan.picks }), [plan.picks]);

  function addRow(row: OptionRow) {
    setLocked((l) => [...l.filter((p) => p.courseId !== row.courseId), { courseId: row.courseId, lecture: row.lecture, section: row.section }]);
    setWanted((w) => w.filter((x) => x !== row.courseId));
  }

  function removePick(courseId: string) {
    setLocked((l) => l.filter((p) => p.courseId !== courseId));
    setWanted((w) => w.filter((x) => x !== courseId));
  }

  return (
    <div>
      <h2 className="sec" style={{ "--acc": "#7ab87a" } as React.CSSProperties}>Quarter Planner · {QUARTER_LABEL}</h2>
      <p className="fine" style={{ marginBottom: "1rem" }}>
        Hard rules (conflicts, units, GE counting) are checked in code. Estimates are labeled as estimates, and GOLD wins
        whenever it disagrees with this app.
        {source && (
          <>
            {" "}
            <span className={`tag ${source.source === "live" ? "good" : "warn"}`}>
              {source.source === "live" ? "Live UCSB data" : "Sample data"}
            </span>
          </>
        )}
      </p>
      {loadError && <div className="empty" style={{ marginBottom: "1rem" }}>{loadError}</div>}

      <Card title="1 · Your week" acc="#93bad0">
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: ".75rem", alignItems: "center" }}>
          <div role="radiogroup" aria-label="Priority" style={{ display: "flex", gap: ".4rem" }}>
            {(["time", "professor"] as const).map((p) => (
              <button key={p} className={`btn sm ${priority === p ? "gold" : ""}`} role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}>
                {p === "time" ? "Prioritize time slot" : "Prioritize professor rating"}
              </button>
            ))}
          </div>
          <label className="fine">
            Buffer between classes{" "}
            <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
              {[0, 10, 15, 30].map((m) => (
                <option key={m} value={m}>{m ? `${m} min` : "none"}</option>
              ))}
            </select>
          </label>
        </div>
        {priority === "professor" && (
          <p className="fine" style={{ marginBottom: ".5rem" }}>
            Sections are usually led by TAs with no ratings, so discussions and labs are still ranked by time fit. Ratings
            source isn&apos;t connected yet.
          </p>
        )}
        <p className="fine" style={{ marginBottom: ".4rem" }}>
          Tap a cell to mark it <span className="tag warn">avoid</span> then <span className="tag bad">never</span>.
        </p>
        <div className="scroll">
          <table style={{ borderCollapse: "collapse", fontSize: ".75rem", minWidth: 360 }}>
            <thead>
              <tr>
                <th />
                {DAYS.map((d) => (
                  <th key={d} style={{ padding: ".2rem .4rem" }}>{DAY_NAME[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h}>
                  <td className="fine" style={{ paddingRight: ".4rem", textAlign: "right" }}>{h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`}</td>
                  {DAYS.map((d) => {
                    const key = `${d}-${h}`;
                    const s = cells[key] ?? "free";
                    return (
                      <td key={key} style={{ padding: 1 }}>
                        <button
                          aria-label={`${DAY_NAME[d]} ${h}:00 ${s}`}
                          onClick={() => setCells((c) => ({ ...c, [key]: nextState[s] }))}
                          style={{
                            width: 44,
                            height: 18,
                            border: "1px solid var(--line)",
                            borderRadius: 4,
                            background: s === "hard" ? "var(--bad-s)" : s === "soft" ? "var(--warn-s)" : "var(--surf)",
                            cursor: "pointer",
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="2 · Plan" acc="#5b8a5b">
        <p className="fine" style={{ marginBottom: ".5rem" }}>
          Locked classes stay put. Lectures are placed first; a lecture is only kept if one of its sections still fits.
        </p>
        {plan.picks.map((p) => (
          <div key={p.courseId} className="card" style={{ marginBottom: ".4rem", display: "flex", gap: ".75rem", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <strong>{p.courseId}</strong>{" "}
              <span className="fine">
                Lecture {p.lecture.section} ({p.lecture.enrollCode}) · {fmt(p)}
                {p.section && ` · ${p.section.kind} ${p.section.section} (${p.section.enrollCode}) ${p.section.meetings.map((m) => `${m.days.join("")} ${m.start}-${m.end}`).join(", ")}`}
              </span>
            </div>
            {locked.some((l) => l.courseId === p.courseId) ? <span className="tag unk">locked</span> : <span className="tag good">placed</span>}
            <button className="btn sm" onClick={() => removePick(p.courseId)} aria-label={`Remove ${p.courseId}`}>Remove</button>
          </div>
        ))}
        {plan.unplaced.map((u) => (
          <div key={u.courseId} className="fine" style={{ color: "var(--bad)" }}>
            {u.courseId}: {u.reason}
          </div>
        ))}
        {plan.rejected.length > 0 && (
          <details style={{ marginTop: ".5rem" }}>
            <summary className="fine">Why some sections were skipped ({plan.rejected.length})</summary>
            <ul className="fine">
              {plan.rejected.map((r) => (
                <li key={`${r.courseId}-${r.enrollCode}-${r.reason}`}>
                  {r.courseId} {r.kind} {r.enrollCode}: {r.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div style={{ marginTop: ".75rem" }}>
          <span className="fine">Try adding: </span>
          {candidates.map((c) => (
            <label key={c.courseId} className="fine" style={{ marginRight: ".75rem" }}>
              <input
                type="checkbox"
                checked={wanted.includes(c.courseId) || plan.picks.some((p) => p.courseId === c.courseId)}
                onChange={(e) => (e.target.checked ? setWanted((w) => [...w, c.courseId]) : removePick(c.courseId))}
              />{" "}
              {c.courseId}
            </label>
          ))}
        </div>
      </Card>

      <Card title="3 · What else fits" acc="#c4a04a">
        <div className="scroll">
          <table style={{ width: "100%", fontSize: ".8rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Course</th>
                <th>Lecture</th>
                <th>Section</th>
                <th>Seats</th>
                <th>Fit</th>
                {FEATURES.likelihood && <th>Estimates</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {openRows.map((r) => {
                const hist = loadFixtureHistory(r.courseId);
                return (
                  <tr key={`${r.courseId}-${r.lecture.enrollCode}-${r.section?.enrollCode ?? "none"}`} style={{ borderTop: "1px solid var(--line)" }}>
                    <td>{r.courseId}</td>
                    <td>{r.lecture.enrollCode} · {fmt(r)}</td>
                    <td>{r.section ? `${r.section.enrollCode} · ${r.section.meetings.map((m) => `${m.days.join("")} ${m.start}-${m.end}`).join(", ")}` : "none"}</td>
                    <td><span className={`tag ${r.status === "open" ? "good" : r.status === "full" ? "bad" : "unk"}`}>{r.status}</span></td>
                    <td>{r.fits ? <span className="tag good">fits</span> : <span className="tag bad">conflicts with {r.conflictsWith.join(", ")}</span>}</td>
                    {FEATURES.likelihood && (
                      <td className="fine">
                        {hist.length > 0 ? (
                          <>
                            Offered: {offeredLikelihood(hist.map((h) => h.quarter), "Winter").bucket} · Seat:{" "}
                            {seatLikelihood({ history: hist, pass: 1 }).bucket} (low confidence)
                          </>
                        ) : (
                          "No history"
                        )}
                      </td>
                    )}
                    <td>{r.fits && <button className="btn sm" onClick={() => addRow(r)}>Add</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="4 · GE requirements" acc="#5ba4cf">
        <p className="fine" style={{ marginBottom: ".5rem" }}>
          Mark what your progress check shows as met. A course fills only one subject area (A to G), but Writing, World
          Cultures, Ethnicity and Quantitative Relationships can stack on top of it.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: ".75rem" }}>
          {geStatus.lines.map((l) => (
            <label key={l.line} className={`tag ${l.met ? "good" : "bad"}`} style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={metLines.includes(l.line)}
                onChange={(e) => setMetLines((m) => (e.target.checked ? [...m, l.line] : m.filter((x) => x !== l.line)))}
                style={{ marginRight: ".3rem" }}
              />
              {l.label}: {l.met ? "met" : "not met"}
            </label>
          ))}
        </div>
        <strong className="fine">Suggested next (fits your week):</strong>
        {recs.length === 0 && <div className="fine">Nothing else fits that covers an open requirement.</div>}
        {recs.map((r) => (
          <div key={r.courseId} className="card" style={{ marginTop: ".4rem", display: "flex", gap: ".75rem", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <strong>{r.courseId}</strong> <span className="fine">{r.title} · {r.units} units · fills {[...r.fillsGE, ...r.fillsMajor].join(", ")}</span>
            </div>
            <button className="btn sm" onClick={() => addRow(r.option)}>Add</button>
          </div>
        ))}
      </Card>

      <Card title="5 · Pass plan" acc="#d47a6a">
        <label className="fine">
          Units already registered{" "}
          <input type="number" min={0} max={25} step={0.5} value={registered} onChange={(e) => setRegistered(Number(e.target.value) || 0)} style={{ width: 60 }} />
        </label>
        {passPlan.passes.map((p) => (
          <div key={p.pass} className="card" style={{ marginTop: ".4rem" }}>
            <strong>Pass {p.pass}</strong> <span className="fine">(cap {p.cap} units{p.pass === 3 ? ", college limit to confirm" : ""}; {p.cumulativeUnits} registered after)</span>
            <div className="fine">
              {p.courses.length === 0
                ? "Nothing planned"
                : p.courses.map((c) => (
                    <label key={c.courseId} style={{ marginRight: ".75rem" }}>
                      {c.courseId} ({c.units}u)
                      <input
                        type="checkbox"
                        style={{ marginLeft: ".25rem" }}
                        checked={waitlist.includes(c.courseId)}
                        onChange={(e) => setWaitlist((w) => (e.target.checked ? [...w, c.courseId] : w.filter((x) => x !== c.courseId)))}
                      />{" "}
                      waitlist
                    </label>
                  ))}
            </div>
          </div>
        ))}
        {passPlan.warnings.map((w) => (
          <div key={w} className="fine" style={{ color: "var(--bad)", marginTop: ".3rem" }}>{w}</div>
        ))}
        <ul className="fine" style={{ marginTop: ".5rem" }}>
          {PASS_NOTES.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </Card>

      <Card title="6 · Fill your GOLD cart" acc="#c8b88a">
        <p className="fine" style={{ marginBottom: ".4rem" }}>
          Paste this into a browser agent you already use (for example Claude in Chrome or Gemini in Chrome, if your plan
          includes one). It only adds to your cart; you click Enroll yourself.
        </p>
        <textarea readOnly value={cartPrompt} rows={12} style={{ width: "100%", fontFamily: "monospace", fontSize: ".75rem", padding: ".5rem" }} />
        <button
          className="btn sm gold"
          onClick={() => {
            navigator.clipboard?.writeText(cartPrompt).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </Card>
    </div>
  );
}
