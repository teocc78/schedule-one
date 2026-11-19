import type { Metadata } from "next";
import { Anton, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter", // CSS uses --font-inter; name kept for compatibility
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Schedule One | UCSB",
  description: "Plan your next UCSB quarter from your transcript, with backups for every pass time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${ibmPlexSans.variable} h-full`}>
      <body className="min-h-full">
        {children}
        {/* Required by UCSB's developer rules for student apps. */}
        <footer
          role="contentinfo"
          style={{ padding: "1rem", textAlign: "center", fontSize: ".75rem", color: "var(--ink3)", borderTop: "1px solid var(--line)" }}
        >
          Schedule One is a student project and is not an official UCSB application. Always confirm classes, times and
          requirements in GOLD.
        </footer>
      </body>
    </html>
  );
}
