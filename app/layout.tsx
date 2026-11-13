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
  title: "Schedule One — UCSB",
  description: "AI-powered class schedule planner for UCSB students",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${ibmPlexSans.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
