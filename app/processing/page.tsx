"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { label: "Reading your transcript",    sublabel: "Extracting completed courses and grades" },
  { label: "Mapping requirements",       sublabel: "Checking what's left in your degree plan" },
  { label: "Designing schedules",        sublabel: "Gemini is picking the best course combinations" },
  { label: "Validating everything",      sublabel: "Checking conflicts, prerequisites, and your preferences" },
];

const FUN_FACTS = [
  "On average, UCSB students take 4–5 impacted courses before graduating.",
  "Winter quarter is the most popular time to knock out upper-division requirements.",
  "The validator checks 5 different rules on every schedule before showing it to you.",
  "Schedules are generated fresh each time — no two results are identical.",
];

export default function ProcessingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => { setFactIdx(Math.floor(Math.random() * FUN_FACTS.length)); }, []);

  useEffect(() => {
    const transcriptText = sessionStorage.getItem("transcript_text");
    const constraintsRaw = sessionStorage.getItem("constraints");
    if (!transcriptText || !constraintsRaw) { router.replace("/"); return; }
    const constraints = JSON.parse(constraintsRaw);

    async function run() {
      try {
        setStep(0);
        const parseRes = await fetch("/api/parse-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcriptText }),
        });
        if (!parseRes.ok) throw new Error((await parseRes.json()).error ?? "Transcript parsing failed");
        const transcript = await parseRes.json();

        setStep(1);
        await new Promise(r => setTimeout(r, 400));

        setStep(2);
        const planRes = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, majorCode: "statistics-data-science", quarter: "Winter 2026", constraints }),
        });
        if (!planRes.ok) throw new Error((await planRes.json()).error ?? "Planning failed");
        const planResult = await planRes.json();

        setStep(3);
        await new Promise(r => setTimeout(r, 500));
        setDone(true);
        sessionStorage.setItem("plan_result", JSON.stringify(planResult));
        sessionStorage.setItem("transcript", JSON.stringify(transcript));
        await new Promise(r => setTimeout(r, 600));
        router.push("/dashboard");
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
        <span style={{ fontFamily: "var(--display)", fontSize: "2rem", color: "var(--gold)", letterSpacing: ".03em", transform: "skewX(-4deg)", display: "inline-block" }}>
          SCHEDULE ONE
        </span>
        <div style={{ fontSize: ".75rem", color: "var(--ink3)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: ".15rem" }}>
          UCSB · Winter 2026
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
          <h1 style={{ fontFamily: "var(--display)", fontSize: "1.6rem", color: "var(--gold)", margin: "0 0 .25rem" }}>
            {done ? "READY" : "BUILDING YOUR SCHEDULE"}
          </h1>
          <p style={{ color: "var(--ink3)", fontSize: ".85rem" }}>
            {done ? "Opening your dashboard…" : "Usually takes 15–25 seconds"}
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
            <strong style={{ color: "var(--gold)" }}>Did you know? </strong>
            {FUN_FACTS[factIdx]}
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
              ← Try again
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
