/**
 * POST JSON and return parsed JSON, with a readable error when the server
 * answers with something that isn't JSON (for example Vercel's HTML
 * "function timed out" page). Calling res.json() on that page used to throw
 * "Unexpected token 'A', "An error o"... is not valid JSON", which is what
 * the schedule screen showed when generation glitched.
 */
export async function postJson<T>(url: string, body: unknown, fallbackError: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : res.status === 504 || /timed? ?out/i.test(text)
          ? "The server took too long to respond. Please try again."
          : `${fallbackError} (HTTP ${res.status})`;
    throw new Error(msg);
  }
  if (data === null) throw new Error(`${fallbackError}: the server sent an empty or unreadable response.`);
  return data as T;
}
