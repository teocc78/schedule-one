/**
 * Server-side client for the UCSB Academic Curriculums API v3.
 *
 * - The key comes ONLY from the UCSB_API_KEY environment variable and is
 *   sent as the `ucsb-api-key` header. It is never logged or sent to the
 *   browser. Import this module from server code only.
 * - Cache-first with a long TTL and a per-hour call budget: UCSB asked a
 *   past student project for about 2 calls per hour around pass times.
 * - Only course data is cached. Never store student information returned
 *   by any UCSB API.
 * - Without a key, callers get UcsbConfigError and should use fixtures
 *   (see getClasses below, which does that automatically).
 */
import type {
  UcsbClass,
  UcsbClassSearchParams,
  UcsbClassSearchResponse,
  UcsbFinal,
  UcsbSpaceAvailability,
} from "./types";
import { loadFixtureClasses } from "./fixtures";

if (typeof window !== "undefined") {
  throw new Error("lib/ucsb/client.ts is server-only");
}

export const UCSB_BASE_URL = "https://api.ucsb.edu/academics/curriculums";

/** Cache lifetime for course data. Seat counts use a shorter TTL. */
export const COURSE_TTL_MS = 12 * 60 * 60 * 1000;
export const SPACE_TTL_MS = 30 * 60 * 1000;
/** Live calls allowed per rolling hour per server instance. Keep low near pass times. */
export const MAX_LIVE_CALLS_PER_HOUR = Number(process.env.UCSB_MAX_CALLS_PER_HOUR ?? 10);

export class UcsbConfigError extends Error {}
export class UcsbRateLimitError extends Error {}
export class UcsbApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Fetch = typeof fetch;

interface CacheEntry {
  at: number;
  ttl: number;
  data: unknown;
}

export class UcsbClient {
  private cache = new Map<string, CacheEntry>();
  private calls: number[] = [];

  constructor(
    private readonly apiKey: string | undefined = process.env.UCSB_API_KEY,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Drop cached data (the "manual refresh" in the spec). */
  clearCache(prefix = ""): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
  }

  private async get<T>(path: string, query: Record<string, unknown>, ttl: number, force = false): Promise<T> {
    if (!this.apiKey) {
      throw new UcsbConfigError("UCSB_API_KEY is not set. Using saved fixtures instead of live UCSB data.");
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const url = `${UCSB_BASE_URL}${path}${qs.size ? `?${qs}` : ""}`;

    const hit = this.cache.get(url);
    if (!force && hit && this.now() - hit.at < hit.ttl) return hit.data as T;

    const hourAgo = this.now() - 60 * 60 * 1000;
    this.calls = this.calls.filter((t) => t > hourAgo);
    if (this.calls.length >= MAX_LIVE_CALLS_PER_HOUR) {
      if (hit) return hit.data as T; // serve stale rather than exceed the budget
      throw new UcsbRateLimitError("UCSB call budget for this hour is used up. Try again later.");
    }
    this.calls.push(this.now());

    const res = await this.fetchImpl(url, {
      headers: { "ucsb-api-key": this.apiKey, "ucsb-api-version": "3.0", accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (/Invalid\s*ApiKey/i.test(text)) {
      // Configuration problem, not a data problem. Never echo the key.
      throw new UcsbConfigError("UCSB rejected the API key (Invalid ApiKey for given resource). Check UCSB_API_KEY.");
    }
    if (!res.ok) {
      const msg =
        body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : `HTTP ${res.status}`;
      throw new UcsbApiError(`UCSB API ${res.status}: ${msg}`, res.status);
    }
    this.cache.set(url, { at: this.now(), ttl, data: body });
    return body as T;
  }

  searchClasses(params: UcsbClassSearchParams, force = false): Promise<UcsbClassSearchResponse> {
    if (params.pageSize && params.pageSize > 500) params = { ...params, pageSize: 500 };
    return this.get("/v3/classes/search", { ...params }, COURSE_TTL_MS, force);
  }

  getClass(quarter: string, enrollcode: string): Promise<UcsbClass> {
    return this.get(`/v3/classes/${encodeURIComponent(quarter)}/${encodeURIComponent(enrollcode)}`, {}, COURSE_TTL_MS);
  }

  getSpaceAvailability(
    quarter: string,
    opts: { enrollCode?: string; pageNumber?: number; pageSize?: number } = {},
    force = false
  ): Promise<UcsbSpaceAvailability> {
    return this.get(`/v3/classspaceavailability/${encodeURIComponent(quarter)}`, opts, SPACE_TTL_MS, force);
  }

  getFinals(quarter: string, enrollCode: string): Promise<UcsbFinal> {
    return this.get("/v3/finals", { quarter, enrollCode }, COURSE_TTL_MS);
  }
}

let shared: UcsbClient | null = null;
export function ucsbClient(): UcsbClient {
  return (shared ??= new UcsbClient());
}

/**
 * Classes for a quarter, live when a key is configured, otherwise from the
 * saved fixtures. GE filtering happens here from each class's
 * generalEducation[].geCode (the `areas` filter has no documented values).
 */
export async function getClasses(
  params: UcsbClassSearchParams & { geCode?: string },
  client: UcsbClient = ucsbClient()
): Promise<{ source: "live" | "fixture"; classes: UcsbClass[]; warning?: string }> {
  const { geCode, ...query } = params;
  const filterGE = (xs: UcsbClass[]) =>
    geCode
      ? xs.filter((c) => (c.generalEducation ?? []).some((g) => g.geCode.trim().toUpperCase() === geCode.toUpperCase()))
      : xs;

  if (!client.configured) {
    return { source: "fixture", classes: filterGE(loadFixtureClasses(query)), warning: "Sample data: no UCSB API key configured." };
  }
  try {
    const res = await client.searchClasses({ pageSize: 500, ...query });
    return { source: "live", classes: filterGE(res.classes ?? []) };
  } catch (err) {
    if (err instanceof UcsbConfigError || err instanceof UcsbRateLimitError) {
      return { source: "fixture", classes: filterGE(loadFixtureClasses(query)), warning: err.message };
    }
    throw err;
  }
}
