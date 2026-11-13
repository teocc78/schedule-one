import { NextRequest, NextResponse } from "next/server";
import { parseTranscript } from "@/lib/llm";
import type { ParseTranscriptRequest } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body: ParseTranscriptRequest = await req.json();
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "No transcript text provided" }, { status: 400 });
    }
    const transcript = await parseTranscript(body.text);
    return NextResponse.json(transcript);
  } catch (err) {
    console.error("[parse-transcript]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse transcript" },
      { status: 500 }
    );
  }
}
