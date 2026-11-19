"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/fetch-json";

const STEPS = [
  { label: "Reading your transcript",    sublabel: "Extracting completed courses and grades" },
  { label: "Mapping requirements",       sublabel: "Checking what's left in your degree plan" },
  { label: "Building schedules",         sublabel: "Picking course combinations that fit your requirements" },
  { label: "Checking everything",        sublabel: "Conflicts, prerequisites, class standing and your preferences" },
];

const TIPS = [
  "Take a screenshot of your GOLD registration info (pass times, holds and unit limit). It helps when you register.",
  "You need at least 12 units to count as a full-time student.",
  "Unit limits by pass: 11.5 units in Pass 1, 15.5 by Pass 2, and 21.0 by Pass 3.",
  "Courses marked \"Must get\" are mostly offered in one quarter a year. Register for them in your first pass.",
];

export default function ProcessingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => { setFactIdx(Math.floor(Math.random() * TIPS.length)); }, []);

  useEffect(() => {
    const transcriptText = sessionStorage.getItem("transcript_text");
    const constraintsRaw = sessionStorage.getItem("constraints");
    if (!transcriptText || !constraintsRaw) { router.replace("/"); return; }
    const constraints = JSON.parse(constraintsRaw);
    let programs: { majors?: string[]; minor?: string } = {};
    try { programs = JSON.parse(sessionStorage.getItem("programs") ?? "{}"); } catch { programs = {}; }
    const majorCodes = programs.majors?.filter(Boolean).length ? programs.majors.filter(Boolean) : ["statistics-data-science"];

    async function run() {
      try {
        setStep(0);
        const transcript = await postJson<unknown>(
          "/api/parse-transcript",
          { text: transcriptText },
          "Transcript parsing failed"
        );

        setStep(1);
        await new Promise(r => setTimeout(r, 400));

        setStep(2);
        const programBody = { majorCodes, minorCode: programs.minor || undefined };
        // Both plans are rule-based; if one fails the student still sees the other.
        const [planRes, fourYearRes] = await Promise.allSettled([
          postJson<unknown>(
            "/api/plan",
            { transcript, majorCode: majorCodes[0], ...programBody, quarter: "Winter 2027", constraints },
            "Planning failed"
          ),
          postJson<unknown>("/api/four-year-plan", { transcript, ...programBody, maxUnits: constraints.maxUnits }, "4-year plan failed"),
        ]);
        if (planRes.status === "rejected" && fourYearRes.status === "rejected") throw planRes.reason;

        setStep(3);
        await new Promise(r => setTimeout(r, 500));
        setDone(true);
        sessionStorage.removeItem("plan_result");
        sessionStorage.removeItem("plan_error");
        sessionStorage.removeItem("four_year_plan");
        if (planRes.status === "fulfilled") sessionStorage.setItem("plan_result", JSON.stringify(planRes.value));
        else sessionStorage.setItem("plan_error", planRes.reason instanceof Error ? planRes.reason.message : "Planning failed");
        if (fourYearRes.status === "fulfilled") sessionStorage.setItem("four_year_plan", JSON.stringify(fourYearRes.value));
        sessionStorage.setItem("transcript", JSON.stringify(transcript));
        await new Promise(r => setTimeout(r, 600));
        router.push(planRes.status === "fulfilled" ? "/dashboard" : "/dashboard?tab=plan4");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--plate)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      {/* Gold bar */}
      <div className="gold-bar" style={{ position: "fixed", top: 0, left: 0, right: 0 }} />

      {/* Wordmark */}
      <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "1.4rem", color: "var(--gold)" }}>
          Schedule One
        </span>
        <div style={{ fontSize: ".8rem", color: "var(--ink3)", marginTop: ".15rem" }}>
          UCSB, Winter 2027
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Spinner */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          {done ? (
            <div style={{ width: 56, height: 56, background: "var(--good-s)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", fontSize: "1.5rem" }}>✓</div>
          ) : (
            <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto 1rem" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid rgba(254,188,17,.2)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid var(--gold)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <h1 style={{ fontSize: "1.4rem", color: "var(--gold)", margin: "0 0 .25rem" }}>
            {done ? "Ready" : "Building your schedule"}
          </h1>
          <p style={{ color: "var(--ink3)", fontSize: ".85rem" }}>
            {done ? "Opening your dashboard..." : "Takes a few seconds"}
          </p>
        </div>

        {/* Steps */}
        {!error && (
          <div style={{ marginBottom: "1.5rem" }}>
            {STEPS.map((s, i) => {
              const isDone = done || i < step;
              const isActive = !done && i === step;
              return (
                <div key={i} style={{
                  display: "flex", gap: ".75rem", alignItems: "flex-start",
                  padding: ".5rem .75rem", borderRadius: 12, marginBottom: ".25rem",
                  background: isActive ? "rgba(254,188,17,.08)" : "transparent",
                  border: `2px solid ${isActive ? "rgba(254,188,17,.2)" : "transparent"}`,
                  transition: "all .2s",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".8rem", fontWeight: 700,
                    background: isDone ? "var(--good)" : isActive ? "var(--gold)" : "rgba(255,255,255,.1)",
                    color: isDone ? "#fff" : isActive ? "var(--plate)" : "var(--ink3)",
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: ".88rem", fontWeight: 600,
                      color: isDone ? "var(--ink3)" : isActive ? "var(--gold)" : "var(--ink3)",
                      textDecoration: isDone ? "line-through" : "none",
                    }}>{s.label}</div>
                    {isActive && <div style={{ fontSize: ".78rem", color: "var(--ink3)", marginTop: ".1rem" }}>{s.sublabel}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fun fact */}
        {!error && !done && (
          <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: ".75rem 1rem", fontSize: ".8rem", color: "var(--ink3)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--gold)" }}>Tip: </strong>
            {TIPS[factIdx]}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ background: "var(--bad-s)", border: "2px solid var(--bad)", borderRadius: 14, padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 700, color: "var(--bad)", marginBottom: ".25rem" }}>Something went wrong</div>
              <p style={{ fontSize: ".85rem", color: "var(--bad)", margin: 0 }}>{error}</p>
            </div>
            <button className="btn" style={{ width: "100%" }} onClick={() => router.push("/onboarding")}>
              Try again
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
