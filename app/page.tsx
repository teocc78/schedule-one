import Link from "next/link";

const FEATURES = [
  { icon: "📄", title: "Bring your transcript", desc: "PDF, .txt or pasted. Nothing is stored." },
  { icon: "🎓", title: "Your requirements, checked", desc: "Only plans courses that still count." },
  { icon: "✅", title: "Checked before you see it", desc: "No time conflicts or missing prerequisites." },
  { icon: "🔄", title: "Backups + a 4-year plan", desc: "Two backups and a plan to graduation." },
];

const STEPS = [
  { n: "01", title: "Pick your major", desc: "Plus a second major or minor" },
  { n: "02", title: "Add your transcript", desc: "PDF, .txt or pasted text" },
  { n: "03", title: "Get your schedule", desc: "In a few seconds" },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <div className="gold-bar" />

      {/* Nav */}
      <nav style={{ maxWidth: 900, margin: "0 auto", padding: ".9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--display)", fontSize: "1.4rem", transform: "skewX(-4deg)", display: "inline-block", letterSpacing: ".02em" }}>
          SCHEDULE ONE
        </span>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <Link href="/courses" className="btn" style={{ textDecoration: "none" }}>
            Browse classes
          </Link>
          <Link href="/onboarding" className="btn pri" style={{ textDecoration: "none" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "4rem 1.5rem 3rem", textAlign: "center" }}>
        <div style={{ display: "inline-block", border: "2px solid var(--line)", borderRadius: 999, padding: ".25rem .9rem", fontSize: ".78rem", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink2)", marginBottom: "1.5rem", background: "var(--surf)" }}>
          UCSB · Winter 2027
        </div>
        <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(2.4rem, 7vw, 4.5rem)", lineHeight: 1, margin: "0 0 1.25rem", letterSpacing: ".01em" }}>
          YOUR NEXT QUARTER,<br />
          <span style={{ color: "var(--gold)", WebkitTextStroke: "1px var(--gold-d)" }}>PLANNED IN SECONDS.</span>
        </h1>
        <p style={{ fontSize: "1.15rem", color: "var(--ink2)", maxWidth: 520, margin: "0 auto 2.5rem", lineHeight: 1.6 }}>
          Add your transcript. Get a checked schedule with backups.
        </p>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/onboarding" className="btn pri" style={{ textDecoration: "none", fontSize: "1rem", padding: ".6rem 1.75rem" }}>
            Plan my schedule
          </Link>
          <Link href="/dashboard" className="btn" style={{ textDecoration: "none", fontSize: "1rem", padding: ".6rem 1.75rem" }}>
            View dashboard
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: "var(--plate)", padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", color: "var(--gold)", textAlign: "center", marginBottom: "2rem" }}>
            THREE STEPS. NO HASSLE.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: "3.5rem", color: "rgba(254,188,17,.2)", lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: ".95rem", margin: ".25rem 0 .15rem" }}>{s.title}</div>
                <div style={{ fontSize: ".82rem", color: "var(--ink3)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.8rem", textAlign: "center", marginBottom: "2rem" }}>
          EVERYTHING HANDLED FOR YOU.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.75rem", lineHeight: 1, marginTop: ".1rem" }} aria-hidden="true">{f.icon}</span>
              <div>
                <div style={{ fontWeight: 700, marginBottom: ".2rem" }}>{f.title}</div>
                <p className="fine" style={{ margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: "1.5rem" }}>
          <strong>Not here yet:</strong>{" "}
          <span className="fine">study abroad and transfer courses.</span>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "var(--gold)", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "2rem", color: "var(--plate)", margin: "0 0 .75rem" }}>
          READY TO PLAN YOUR QUARTER?
        </h2>
        <p style={{ color: "var(--plate)", fontSize: ".9rem", marginBottom: "1.5rem", opacity: 0.75 }}>
          Takes about 2 minutes. No account required.
        </p>
        <Link href="/onboarding" className="btn pri" style={{ textDecoration: "none", fontSize: "1rem", padding: ".65rem 2rem" }}>
          Get started free
        </Link>
      </section>
    </div>
  );
}
