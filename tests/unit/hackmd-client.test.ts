import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HackmdError } from "@/lib/hackmd/errors";

const TOKEN = "hmd_TEST_TOKEN_should_never_leak";

async function load() {
  vi.resetModules();
  return import("@/lib/hackmd/client");
}

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("HackMD client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("HACKMD_API_TOKEN", TOKEN);
    vi.stubEnv("HACKMD_API_BASE_URL", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Token 只出現在 Authorization 標頭，網址正確", async () => {
    fetchMock.mockResolvedValue(respond(200, [], { "x-ratelimit-userlimit": "100", "x-ratelimit-userremaining": "97", "x-ratelimit-userreset": "1760000000" }));
    const { getHackmdNotes } = await load();
    const result = await getHackmdNotes();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.hackmd.io/v1/notes");
    expect(String(url)).not.toContain(TOKEN);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result.rateLimit).toEqual({ limit: 100, remaining: 97, resetAt: new Date(1760000000 * 1000).toISOString() });
  });

  it("note id 會先驗證並編碼，不合法時不發出請求", async () => {
    const { getHackmdNoteById } = await load();
    await expect(getHackmdNoteById("../me")).rejects.toMatchObject({ kind: "bad_request" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(respond(200, { id: "Abc_12-z", title: "T", content: "# T\nx", tags: [] }));
    const note = await getHackmdNoteById("Abc_12-z");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.hackmd.io/v1/notes/Abc_12-z");
    expect(note.data.content).toBe("# T\nx");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "upstream"],
    [502, "upstream"],
  ])("HTTP %i → %s，錯誤訊息不含 Token", async (status, kind) => {
    fetchMock.mockResolvedValue(respond(status, { error: `token ${TOKEN} rejected` }));
    const { getHackmdMe } = await load();
    const error = await getHackmdMe().catch((e: unknown) => e);
    // vi.resetModules() 會載入新的類別實例，因此以 name 判斷
    expect(error).toMatchObject({ name: "HackmdError", kind });
    expect((error as HackmdError).message).not.toContain(TOKEN);
  });

  it("逾時 → timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const { getHackmdMe } = await load();
    await expect(getHackmdMe()).rejects.toMatchObject({ kind: "timeout" });
  });

  it("網路錯誤 → network", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { getHackmdMe } = await load();
    await expect(getHackmdMe()).rejects.toMatchObject({ kind: "network" });
  });

  it("非 JSON 或格式不符 → invalid_response", async () => {
    const { getHackmdNotes } = await load();
    fetchMock.mockResolvedValueOnce(respond(200, "<html>"));
    await expect(getHackmdNotes()).rejects.toMatchObject({ kind: "invalid_response" });
    fetchMock.mockResolvedValueOnce(respond(200, { notes: "nope" }));
    await expect(getHackmdNotes()).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("未設定 Token 時不發出請求", async () => {
    vi.stubEnv("HACKMD_API_TOKEN", "");
    const { getHackmdMe } = await load();
    await expect(getHackmdMe()).rejects.toMatchObject({ kind: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("placeholder Token 視為未設定", async () => {
    vi.stubEnv("HACKMD_API_TOKEN", "YOUR_HACKMD_API_TOKEN");
    const { getHackmdMe } = await load();
    await expect(getHackmdMe()).rejects.toMatchObject({ kind: "not_configured" });
  });

  it("HACKMD_API_BASE_URL 只允許 https 或 localhost", async () => {
    const { parseServerEnv } = await import("@/lib/env.server");
    expect(() => parseServerEnv({ HACKMD_API_BASE_URL: "http://evil.example.com/v1" })).toThrow();
    expect(parseServerEnv({ HACKMD_API_BASE_URL: "http://localhost:4010/v1" }).HACKMD_API_BASE_URL).toBe("http://localhost:4010/v1");
    expect(() => parseServerEnv({ HACKMD_API_TOKEN: "x", HACKMD_API_BASE_URL: "ftp://x" })).toThrow(/HACKMD_API_BASE_URL/);
  });
});
