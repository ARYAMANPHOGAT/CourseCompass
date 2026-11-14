import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { durationLabel, formatMinutes, priceLabel } from "../lib/format";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("encodes array filters as repeated query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.courses({ q: "sql", level: ["beginner", "advanced"], free_only: true, min_rating: undefined });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname.endsWith("/courses")).toBe(true);
    expect(url.searchParams.get("q")).toBe("sql");
    expect(url.searchParams.getAll("level")).toEqual(["beginner", "advanced"]);
    expect(url.searchParams.get("free_only")).toBe("true");
    expect(url.searchParams.has("min_rating")).toBe(false);
  });

  it("turns backend error bodies into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "course_not_found", message: "No course" } }), { status: 404 })),
    );
    await expect(api.course("x")).rejects.toMatchObject({ status: 404, code: "course_not_found", message: "No course" });
  });

  it("reports an unreachable backend clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network_error");
    expect(err.message).toMatch(/run.bat/);
  });

  it("sends JSON bodies for mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.logSession("c1", { minutes: 30, lessons_completed: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ minutes: 30, lessons_completed: 1 });
  });
});

describe("formatting helpers", () => {
  it("formats durations, prices and minutes without inventing data", () => {
    expect(durationLabel({ duration_hours: 14, duration_months: null, duration_bucket: "medium" })).toBe("14 h");
    expect(durationLabel({ duration_hours: null, duration_months: 6, duration_bucket: "extended" })).toBe("6 mo");
    expect(durationLabel({ duration_hours: null, duration_months: null, duration_bucket: null })).toBe("Length not listed");
    expect(priceLabel({ price_status: "not_listed" })).toBe("Price not listed");
    expect(priceLabel({ price_status: null })).toBe("Price unknown");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(150)).toBe("2 h 30 min");
  });
});
