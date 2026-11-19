import { NextResponse, connection } from "next/server";

/**
 * Config check for the site owner. Shows whether the UCSB API key is set
 * (never the key itself). There is no AI: transcripts are read and schedules
 * are built by rules, so nothing else needs configuring.
 */
export async function GET() {
  await connection(); // read the env at request time, not build time
  return NextResponse.json(
    { ai: false, ucsbKeySet: Boolean(process.env.UCSB_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
