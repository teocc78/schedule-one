import { NextRequest, NextResponse } from "next/server";
import { parseTranscript, LLMConfigError } from "@/lib/llm";
import type { ParseTranscriptRequest } from "@/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body: ParseTranscriptRequest = await req.json();
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "No transcript text provided" }, { status: 400 });
    }
    const transcript = await parseTranscript(body.text);
    return NextResponse.json(transcript);
  } catch (err) {
    if (err instanceof LLMConfigError) {
      console.error("[parse-transcript] configuration:", err.message);
      return NextResponse.json({ error: "The planner isn't configured on the server yet (missing AI key)." }, { status: 503 });
    }
    // Transcript text is sensitive: log the error message only.
    console.error("[parse-transcript]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn't read that transcript. Please try again." }, { status: 500 });
  }
}
