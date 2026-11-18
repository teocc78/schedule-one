import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import {
  parseTranscript,
  classifyError,
  resetClientForTests,
  LLMConfigError,
  LLMBusyError,
  DEFAULT_MODEL,
  checkAI,
} from "@/lib/llm";

function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

const good = {
  studentName: null,
  studentId: null,
  major: "Statistics",
  completedCourses: [
    { code: "pstat  8", title: "Transition to Data Science", units: "4.0", grade: "a-", quarter: "Fall 2025" },
    { code: "MATH 3A", title: "Calculus", units: 4, grade: "IP", quarter: "Winter 2026" },
    { code: "", title: "Bad row", units: 4, grade: "A", quarter: "Fall 2025" },
  ],
  totalUnitsEarned: "99",
};

beforeEach(() => {
  generateContent.mockReset();
  resetClientForTests();
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
});

describe("parseTranscript", () => {
  it("uses gemini-3.8-flash by default and sends no temperature", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(good) });
    await parseTranscript("PSTAT 8 A-");
    const args = generateContent.mock.calls[0][0];
    expect(DEFAULT_MODEL).toBe("gemini-3.8-flash");
    expect(args.model).toBe("gemini-3.8-flash");
    expect(args.config.temperature).toBeUndefined();
  });

  it("accepts nulls and numbers as strings, drops bad rows, recomputes units", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(good) });
    const t = await parseTranscript("x");
    expect(t.studentName).toBe("");
    expect(t.studentId).toBe("0000");
    expect(t.completedCourses).toEqual([
      { code: "PSTAT 8", title: "Transition to Data Science", units: 4, grade: "A-", quarter: "Fall 2025" },
    ]);
    expect(t.totalUnitsEarned).toBe(4);
  });

  it("falls back to another model when the configured one is not available to this key", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    generateContent
      .mockRejectedValueOnce(apiError(403, "We are limiting access to the 2.5 models to users who have actively used them"))
      .mockResolvedValue({ text: JSON.stringify(good) });
    const t = await parseTranscript("x");
    expect(t.completedCourses).toHaveLength(1);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-2.5-flash", "gemini-3.8-flash"]);
  });

  it("reports a rejected key as a config error", async () => {
    generateContent.mockRejectedValue(apiError(400, "API key not valid. Please pass a valid API key."));
    await expect(parseTranscript("x")).rejects.toBeInstanceOf(LLMConfigError);
  });

  it("reports a missing key as a config error", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(parseTranscript("x")).rejects.toBeInstanceOf(LLMConfigError);
  });

  it("reports quota errors as busy", async () => {
    generateContent.mockRejectedValue(apiError(429, "RESOURCE_EXHAUSTED"));
    await expect(parseTranscript("x")).rejects.toBeInstanceOf(LLMBusyError);
  });

  it("gives a config error naming the models when none work", async () => {
    generateContent.mockRejectedValue(apiError(404, "models/x is not found"));
    await expect(parseTranscript("x")).rejects.toThrow(/None of these Gemini models worked/);
  });
});

describe("classifyError", () => {
  it("sorts common Gemini errors", () => {
    expect(classifyError(apiError(400, "API key not valid"))).toBe("key");
    expect(classifyError(apiError(429, "quota exceeded"))).toBe("busy");
    expect(classifyError(apiError(404, "not found"))).toBe("model");
    expect(classifyError(apiError(500, "internal"))).toBe("other");
  });
});

describe("checkAI", () => {
  it("reports the model that worked", async () => {
    generateContent.mockResolvedValue({ text: '{"ok":true}' });
    expect(await checkAI()).toEqual({ ok: true, model: "gemini-3.8-flash" });
  });
});
