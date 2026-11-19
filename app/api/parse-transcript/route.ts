import { NextRequest, NextResponse } from "next/server";
import { parseTranscriptText } from "@/lib/transcript-parser";
import type { ParseTranscriptRequest } from "@/types";

/** Reads a transcript with rules (no AI). Never logs the transcript text. */
export async function POST(req: NextRequest) {
  let body: ParseTranscriptRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON", code: "bad_request" }, { status: 400 });
  }
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "No transcript text provided", code: "empty" }, { status: 400 });
  }
  const { transcript } = parseTranscriptText(body.text);
  if (transcript.completedCourses.length === 0) {
    return NextResponse.json(
      {
        error:
          "No courses were found in that text. Paste your unofficial transcript from GOLD, or one course per line with its code, units and grade, like: PSTAT 120A  Probability  4.0  A-",
        code: "no_courses",
      },
      { status: 422 }
    );
  }
  return NextResponse.json(transcript);
}
