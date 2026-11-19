import Link from "next/link";

const FEATURES = [
  { title: "Bring your transcript", desc: "Upload the PDF of your unofficial transcript from GOLD, a .txt file, or paste the text. Nothing is stored on a server." },
  { title: "Your requirements, checked", desc: "Schedule One compares what you've finished with your major's requirements and only plans courses that still count." },
  { title: "Checked before you see it", desc: "Every schedule is checked for time conflicts, prerequisites, unit limits, class standing and your preferences." },
  { title: "Backups for every pass time", desc: "A main schedule plus two backups, and swap options for each course in case a section fills." },
];

const STEPS = [
  { n: "1", title: "Pick your major", desc: "Add a second major or minor if you have one" },
  { n: "2", title: "Add your transcript", desc: "PDF, .txt or pasted text" },
  { n: "3", title: "Get your schedule", desc: "Built for you, or personalized" },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <div className="gold-bar" />

      <nav style={{ maxWidth: 900, margin: "0 auto", padding: ".9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="brand">Schedule One</span>
        <Link href="/onboarding" className="btn pri" style={{ textDecoration: "none" }}>
          Get started
        </Link>
      </nav>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "3.5rem 1.5rem 3rem" }}>
        <p className="fine" style={{ fontWeight: 600, margin: "0 0 .75rem" }}>UCSB, Winter 2027</p>
        <h1 style={{ fontSize: "clamp(2rem, 5.5vw, 3.2rem)", lineHeight: 1.1, margin: "0 0 1rem", maxWidth: 640 }}>
          Plan your next quarter around what you still need.
        </h1>
        <p style={{ fontSize: "1.1rem", color: "var(--ink2)", maxWidth: 560, margin: "0 0 2rem", lineHeight: 1.6 }}>
          Add your transcript, set a few preferences, and get a schedule with backups for each pass time. You still register in GOLD.
        </p>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link href="/onboarding" className="btn pri" style={{ textDecoration: "none", fontSize: "1rem", padding: ".6rem 1.5rem" }}>
            Plan my schedule
          </Link>
          <Link href="/dashboard" className="btn" style={{ textDecoration: "none", fontSize: "1rem", padding: ".6rem 1.5rem" }}>
            Open dashboard
          </Link>
        </div>
      </section>

      <section style={{ borderTop: "2px solid var(--line)", borderBottom: "2px solid var(--line)", background: "var(--surf)", padding: "2.5rem 1.5rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1.25rem" }}>How it works</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
            {STEPS.map((s) => (
              <li key={s.n} style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--plate)", color: "var(--gold)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flex: "none" }}>{s.n}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div className="fine">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <h2 style={{ fontSize: "1.3rem", marginBottom: "1.25rem" }}>What you get</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <div style={{ fontWeight: 700, marginBottom: ".25rem" }}>{f.title}</div>
              <p className="fine" style={{ margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: "1.5rem" }}>
          <strong>Not here yet:</strong>{" "}
          <span className="fine">study abroad courses (UCEAP and other universities), community-college transfer courses, and more majors and minors. They&apos;re on the way.</span>
        </div>
      </section>

      <section style={{ background: "var(--plate)", padding: "2.5rem 1.5rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", color: "var(--gold)", margin: "0 0 .5rem" }}>Ready to plan your quarter?</h2>
        <p style={{ color: "var(--ink3)", fontSize: ".9rem", margin: "0 0 1.25rem" }}>About two minutes. No account needed.</p>
        <Link href="/onboarding" className="btn gold" style={{ textDecoration: "none", fontSize: "1rem", padding: ".6rem 1.75rem" }}>
          Get started
        </Link>
      </section>
    </div>
  );
}
