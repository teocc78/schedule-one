"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { majors } from "@/lib/majors";
import type { ProgramCourses, UpperDivCourse } from "@/lib/upper-division";

/** One class: code, title and units; the description opens on a tap. */
function CourseRow({ c }: { c: UpperDivCourse }) {
  return (
    <details className="course-row">
      <summary>
        <span className="course-head">
          <span><strong>{c.code}</strong> {c.title}</span>
          <span className="fine" style={{ whiteSpace: "nowrap" }}>{c.units}u <span className="chev" aria-hidden="true">▸</span></span>
        </span>
      </summary>
      <p className="fine" style={{ margin: ".3rem 0 0" }}>{c.description ?? "No catalog description."}</p>
    </details>
  );
}

const matches = (c: UpperDivCourse, q: string) =>
  !q || `${c.code} ${c.title} ${c.description ?? ""}`.toLowerCase().includes(q);

/** Browse every upper-division class for a major, with catalog descriptions. */
export default function CourseBrowser({ initialProgram }: { initialProgram: string }) {
  const [program, setProgram] = useState(initialProgram);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<Record<string, ProgramCourses | "error">>({});
  const data = loaded[program];

  useEffect(() => {
    if (loaded[program]) return;
    fetch(`/api/courses?program=${encodeURIComponent(program)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ProgramCourses) => setLoaded((prev) => ({ ...prev, [program]: d })))
      .catch(() => setLoaded((prev) => ({ ...prev, [program]: "error" })));
  }, [program, loaded]);

  const q = query.trim().toLowerCase();

  return (
    <div className="onboard">
      <div className="gold-bar" />
      <div className="onboard-inner" style={{ maxWidth: 820 }}>
        <header className="row between">
          <Link href="/" className="brand">Schedule One</Link>
          <Link href="/onboarding" className="btn sm pri" style={{ textDecoration: "none" }}>Plan my schedule</Link>
        </header>
        <div className="card onboard-card">
          <h1 className="h">Upper-division classes</h1>
          <p className="fine lead">Tap a class for its catalog description.</p>
          <label className="fine" htmlFor="major">Major</label>
          <select id="major" value={program} onChange={(e) => setProgram(e.target.value)}>
            {majors().map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
          <label className="fine" htmlFor="q" style={{ display: "block", marginTop: ".75rem" }}>Search</label>
          <input id="q" type="search" placeholder="Course code, title or topic" value={query} onChange={(e) => setQuery(e.target.value)} />

          {!data && <p className="fine">Loading classes…</p>}
          {data === "error" && <p className="note warn">Couldn&apos;t load these classes. Try again in a moment.</p>}
          {data && data !== "error" && (
            <>
              <p className="fine" style={{ marginTop: "1rem" }}>{data.total} classes · UCSB catalog 2026-27</p>
              {data.groups.map((g) => {
                const shown = g.courses.filter((c) => matches(c, q));
                return (
                  <section key={g.subject} className="group" aria-label={g.name}>
                    <h2 className="sec" style={{ fontSize: "1.15rem", margin: ".5rem 0" }}>{g.name}</h2>
                    {shown.length === 0 && <p className="fine">No classes match your search.</p>}
                    {shown.map((c) => <CourseRow key={c.code} c={c} />)}
                  </section>
                );
              })}
              {data.special.some((c) => matches(c, q)) && (
                <details className="group">
                  <summary><strong>Research, internships and honors ({data.special.filter((c) => matches(c, q)).length})</strong></summary>
                  {data.special.filter((c) => matches(c, q)).map((c) => <CourseRow key={c.code} c={c} />)}
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
