import { NextRequest, NextResponse } from "next/server";
import { extractTextItems } from "unpdf";
import { itemsToLines } from "@/lib/pdf-text";

export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Turn an uploaded transcript (PDF or .txt) into plain text. The file is
 * read in memory and never stored or logged.
 */
export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "Send the file as form data.", code: "bad_request" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file was attached.", code: "no_file" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 5 MB. Upload the transcript PDF or a .txt file.", code: "too_big" }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isText = file.type.startsWith("text/") || name.endsWith(".txt");

  try {
    if (isText) return NextResponse.json({ text: await file.text() });
    if (!isPdf) {
      return NextResponse.json({ error: "Upload a PDF or a .txt file.", code: "bad_type" }, { status: 415 });
    }
    const { items } = await extractTextItems(new Uint8Array(await file.arrayBuffer()));
    const text = items.map((page) => itemsToLines(page)).join("\n");
    if (!text.trim()) {
      return NextResponse.json(
        { error: "That PDF has no readable text (it may be a scanned image). Download the transcript from GOLD as a PDF, or paste the text instead.", code: "no_text" },
        { status: 422 }
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    // Never log transcript contents; the error message is enough.
    console.error("[extract-text]", err instanceof Error ? err.message.slice(0, 200) : "unknown error");
    return NextResponse.json({ error: "Couldn't read that file. Try another PDF, or paste the text instead.", code: "read_failed" }, { status: 500 });
  }
}
