import { describe, expect, it } from "vitest";
import { classifyHealthResponse } from "@/lib/supabase/health";

describe("classifyHealthResponse", () => {
  it("2xx 為 ok", () => {
    expect(classifyHealthResponse(200, 42)).toEqual({ status: "ok", latencyMs: 42 });
  });
  it("401/403 為 unauthorized", () => {
    expect(classifyHealthResponse(401, 1).status).toBe("unauthorized");
    expect(classifyHealthResponse(403, 1).status).toBe("unauthorized");
  });
  it("5xx 為 unreachable", () => {
    expect(classifyHealthResponse(503, 1).status).toBe("unreachable");
  });
});
