import { NextRequest, NextResponse } from "next/server";
import { checkAI, DEFAULT_MODEL } from "@/lib/llm";

export const maxDuration = 30;

/**
 * Config check for the site owner. GET /api/health shows whether the Gemini
 * key is set (never the key itself). GET /api/health?ai=1 also makes one tiny
 * Gemini call and reports which model worked or what kind of error came back.
 */
export async function GET(req: NextRequest) {
  const keySet = Boolean(process.env.GEMINI_API_KEY?.trim());
  const body: Record<string, unknown> = {
    geminiKeySet: keySet,
    // Shows the GEMINI_MODEL environment variable; null means it isn't set
    // and the code default is used.
    geminiModelSetting: process.env.GEMINI_MODEL?.trim() || null,
    defaultModel: DEFAULT_MODEL,
    ucsbKeySet: Boolean(process.env.UCSB_API_KEY?.trim()),
  };
  if (req.nextUrl.searchParams.get("ai") === "1" && keySet) {
    body.ai = await checkAI();
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
