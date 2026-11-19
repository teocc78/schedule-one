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
  resetClientForTests(async () => {});
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

  it("reports quota errors as busy with reason quota after trying every model", async () => {
    generateContent.mockRejectedValue(apiError(429, "RESOURCE_EXHAUSTED"));
    const err = await parseTranscript("x").catch((e) => e);
    expect(err).toBeInstanceOf(LLMBusyError);
    expect(err.reason).toBe("quota");
    expect(new Set(generateContent.mock.calls.map((c) => c[0].model)).size).toBe(2);
  });

  it("moves to the next model when one model's quota is used up", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED: quota exceeded"))
      .mockResolvedValue({ text: JSON.stringify(good) });
    await parseTranscript("x");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  });

  it("retries the same model once when Google is overloaded", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503, "The model is overloaded. Please try again later."))
      .mockResolvedValue({ text: JSON.stringify(good) });
    await parseTranscript("x");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.8-flash"]);
  });

  it("gets past an overloaded model and a missing alias to one that works (Nov 19 health check)", async () => {
    process.env.GEMINI_MODEL = "gemini-flash-latest";
    generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === "gemini-3.8-flash") throw apiError(503, '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
      if (model === "gemini-flash-latest") throw apiError(404, "models/gemini-flash-latest is not found for API version v1, or is not supported for generateContent.");
      return { text: JSON.stringify(good) };
    });
    const t = await parseTranscript("x");
    expect(t.completedCourses.map((c) => c.code)).toEqual(["PSTAT 8"]);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite",
    ]);
  });

  it("names a 403 as Google refusing the key, not a missing model", async () => {
    generateContent.mockRejectedValue(apiError(403, "PERMISSION_DENIED: Generative Language API has not been used in project"));
    await expect(parseTranscript("x")).rejects.toThrow(/Google refused this key \(403\)/);
  });

  it("gives a config error naming the models when none work", async () => {
    generateContent.mockRejectedValue(apiError(404, "models/x is not found"));
    await expect(parseTranscript("x")).rejects.toThrow(/None of these Gemini models exist/);
  });
});

describe("classifyError", () => {
  it("sorts common Gemini errors", () => {
    expect(classifyError(apiError(400, "API key not valid"))).toBe("key");
    expect(classifyError(apiError(429, "quota exceeded"))).toBe("quota");
    expect(classifyError(apiError(503, "The model is overloaded"))).toBe("overloaded");
    expect(classifyError(apiError(404, "not found"))).toBe("model");
    expect(classifyError(apiError(403, "PERMISSION_DENIED: Your API key was reported as leaked"))).toBe("access");
    expect(classifyError(apiError(403, "We are limiting access to the 2.5 models"))).toBe("access");
    expect(classifyError(apiError(500, "internal"))).toBe("other");
  });
});

describe("checkAI", () => {
  it("reports each model's result with Gemini's status", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED: requests per day"))
      .mockResolvedValue({ text: '{"ok":true}' });
    const r = await checkAI();
    expect(r.ok).toBe(true);
    expect(r.models[0]).toMatchObject({ model: "gemini-3.8-flash", ok: false, status: 429, kind: "quota" });
    expect(r.models[1]).toMatchObject({ model: "gemini-3.5-flash-lite", ok: true });
  });

  it("never echoes something that looks like a key", async () => {
    generateContent.mockRejectedValue(apiError(400, "bad request for AIzaSyA1234567890abcdefghijklmnop"));
    const r = await checkAI();
    expect(JSON.stringify(r)).not.toContain("AIzaSy");
  });
});

describe("rule-based transcript reading", () => {
  it("reads a regular transcript with no AI call", async () => {
    const fs = await import("node:fs");
    const text = fs.readFileSync("data/samples/transcript-mid.txt", "utf8");
    const t = await parseTranscript(text);
    expect(generateContent).not.toHaveBeenCalled();
    expect(t.completedCourses.length).toBeGreaterThanOrEqual(15);
    expect(t.completedCourses[0]).toEqual({ code: "MATH 3A", title: "Calculus with Applications I", units: 4, grade: "A", quarter: "Fall 2023" });
    expect(t.completedCourses.find((c) => c.code === "PSTAT 120A")?.quarter).toBe("Spring 2024");
  });

  it("uses what the rules found when the Gemini settings are wrong", async () => {
    generateContent.mockRejectedValue(apiError(404, "models/x is not found"));
    const text = "FALL 2025\nPSTAT 8  Transition to Data Science  4.0  A-\nSome odd row PSTAT 10 4.0 ??";
    const t = await parseTranscript(text);
    expect(t.completedCourses.map((c) => c.code)).toEqual(["PSTAT 8"]);
  });

  it("uses what the rules found when the AI is over quota", async () => {
    generateContent.mockRejectedValue(apiError(429, "RESOURCE_EXHAUSTED"));
    const text = "FALL 2025\nPSTAT 8  Transition to Data Science  4.0  A-\nSome odd row PSTAT 10 4.0 ??";
    const t = await parseTranscript(text);
    expect(t.completedCourses.map((c) => c.code)).toEqual(["PSTAT 8"]);
  });
});
