/**
 * Free tier of GOLD cart help (spec section 7A): a copy-paste prompt for a
 * browser assistant the student may already have. Cart only. The student
 * clicks Enroll themselves.
 */
import type { Pick } from "@/lib/schedule-engine";

export interface CartPromptInput {
  quarterLabel: string;
  picks: Pick[];
}

export function buildCartPrompt({ quarterLabel, picks }: CartPromptInput): string {
  const lines = picks.map((p, i) => {
    const sec = p.section ? `, with ${p.section.kind === "LAB" ? "lab" : "discussion"} section ${p.section.section} (enroll code ${p.section.enrollCode})` : "";
    return `${i + 1}. ${p.courseId}: lecture section ${p.lecture.section} (enroll code ${p.lecture.enrollCode})${sec}`;
  });
  return [
    `I'm planning my ${quarterLabel} classes in UCSB GOLD. I'm already signed in to GOLD in this browser. Please help me add these exact sections to my GOLD cart:`,
    "",
    ...lines,
    "",
    "Rules:",
    "- Add to cart ONLY. Never click Enroll, Register, Drop, Swap or anything that changes my enrollment.",
    "- Never ask for, enter or store my password or Duo code. If you see a sign-in or Duo page, stop and tell me.",
    "- Never change or drop classes I'm already enrolled in.",
    "- Before adding each class, check that the course title and section in GOLD match what I listed. If anything doesn't match, or a section isn't posted yet, don't guess: skip it and tell me.",
    "- If a section is full, restricted or needs approval, don't add a different one. Tell me instead.",
    "",
    "When you're done, give me a table with columns: Course | Section | Enroll code | Added to cart or Blocked | Reason.",
  ].join("\n");
}
