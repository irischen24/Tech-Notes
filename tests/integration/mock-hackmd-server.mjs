// 本機整合測試用的 HackMD API v1 模擬伺服器（欄位依官方 @hackmd/api SDK 型別）。
//   GET /v1/me、GET /v1/notes、GET /v1/notes/:id
//   POST /__set/:id  以 JSON {content, title} 修改遠端內容（模擬在 HackMD 編輯）
// Token 由環境變數 MOCK_HACKMD_TOKEN 指定；特殊 id：rateLimited1 → 429、serverError1 → 500。
import http from "node:http";

const TOKEN = process.env.MOCK_HACKMD_TOKEN ?? "";
const PORT = Number(process.env.MOCK_HACKMD_PORT ?? 4010);
const now = () => new Date().toISOString();
const notes = new Map([
  ["JoinNote01", { id: "JoinNote01", title: "SQL JOIN 筆記", tags: ["SQL", "資料表關聯"], content: "---\ntitle: SQL JOIN 筆記\n---\n# SQL JOIN 筆記\n\n[TOC]\n\n## INNER JOIN\n\n```sql\nSELECT * FROM a JOIN b ON a.id = b.a_id;\n```\n", lastChangedAt: now() }],
  ["LinuxNote1", { id: "LinuxNote1", title: "Linux 權限", tags: ["Linux"], content: "# Linux 權限\n\n## chmod\n\n`chmod 755 file`\n", lastChangedAt: now() }],
  ["XssNote001", { id: "XssNote001", title: "XSS 測試", tags: [], content: "# XSS\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n", lastChangedAt: now() }],
  ["rateLimited1", { id: "rateLimited1", title: "會被限流", tags: [], content: "x", lastChangedAt: now() }],
]);
let remaining = 100;

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "x-ratelimit-userlimit": "100",
    "x-ratelimit-userremaining": String(Math.max(remaining, 0)),
    "x-ratelimit-userreset": String(Math.floor(Date.now() / 1000) + 300),
  });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST" && url.pathname.startsWith("/__set/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const id = url.pathname.split("/").pop();
        const note = notes.get(id);
        if (!note) return send(res, 404, {});
        Object.assign(note, JSON.parse(body), { lastChangedAt: now() });
        send(res, 200, { ok: true });
      });
      return;
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "Unauthorized" });
    remaining--;
    if (url.pathname === "/v1/me") return send(res, 200, { id: "u1", name: "Iris", userPath: "iris", email: null, photo: "", teams: [] });
    if (url.pathname === "/v1/notes") {
      return send(res, 200, [...notes.values()].map(({ content, ...rest }) => ({ ...rest, shortId: rest.id, publishType: "view", publishLink: "" })));
    }
    const m = /^\/v1\/notes\/([^/]+)$/.exec(url.pathname);
    if (m) {
      if (m[1] === "rateLimited1") return send(res, 429, { error: "Too many requests" });
      if (m[1] === "serverError1") return send(res, 500, {});
      const note = notes.get(m[1]);
      return note ? send(res, 200, { ...note, shortId: note.id, publishType: "view", publishLink: "" }) : send(res, 404, { error: "Not found" });
    }
    send(res, 404, {});
  })
  .listen(PORT);
