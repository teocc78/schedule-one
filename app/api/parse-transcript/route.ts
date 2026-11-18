import { NextRequest, NextResponse } from "next/server";
import { parseTranscript, LLMConfigError, LLMBusyError } from "@/lib/llm";
import type { ParseTranscriptRequest } from "@/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body: ParseTranscriptRequest = await req.json();
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "No transcript text provided", code: "empty" }, { status: 400 });
    }
    const transcript = await parseTranscript(body.text);
    if (transcript.completedCourses.length === 0) {
      return NextResponse.json(
        {
          error: "No finished courses were found in that text. Paste your unofficial transcript or progress check as plain text, with course codes and grades.",
          code: "no_courses",
        },
        { status: 422 }
      );
    }
    return NextResponse.json(transcript);
  } catch (err) {
    if (err instanceof LLMConfigError) {
      // The message names the setting to fix and never contains the key.
      console.error("[parse-transcript] configuration:", err.message);
      return NextResponse.json(
        { error: "The planner's AI isn't set up correctly on the server. The site owner needs to check the Gemini settings.", code: "ai_config" },
        { status: 503 }
      );
    }
    if (err instanceof LLMBusyError) {
      console.error("[parse-transcript] busy:", err.message);
      return NextResponse.json(
        { error: "The AI service is busy right now. Wait a minute and try again.", code: "ai_busy" },
        { status: 503 }
      );
    }
    // Transcript text is sensitive: log the error message only.
    console.error("[parse-transcript]", err instanceof Error ? err.message.slice(0, 300) : "unknown error");
    return NextResponse.json({ error: "Couldn't read that transcript. Please try again.", code: "parse_failed" }, { status: 500 });
  }
}
