// 本機整合測試用：模擬 Supabase 閘道。
//   /rest/v1/*      → 轉給 PostgREST（127.0.0.1:3300）
//   /auth/v1/health → 200
//   /auth/v1/user   → 以 HS256 驗證 Bearer JWT 後回傳使用者（supabase-js getClaims() 對 HS256 會呼叫此端點）
// JWT secret 由環境變數 LOCAL_JWT_SECRET 提供，只用於本機。
import crypto from "node:crypto";
import http from "node:http";

const SECRET = process.env.LOCAL_JWT_SECRET ?? "";

function verify(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!h || !p || !s || !SECRET) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/auth/v1/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"ok":true}');
    }
    if (req.url.startsWith("/auth/v1/user")) {
      const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!claims?.sub) {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end('{"code":401,"error_code":"bad_jwt","msg":"invalid JWT"}');
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
    }
    if (!req.url.startsWith("/rest/v1")) {
      res.writeHead(404);
      return res.end();
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: 3300, path: req.url.slice("/rest/v1".length) || "/", method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(54321);
