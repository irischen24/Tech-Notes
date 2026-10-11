// 本機整合測試用：把 /rest/v1/* 轉給 PostgREST，模擬 Supabase 閘道。
import http from "node:http";
http.createServer((req, res) => {
  if (req.url.startsWith("/auth/v1/health")) { res.writeHead(200, {"content-type":"application/json"}); return res.end('{"ok":true}'); }
  if (!req.url.startsWith("/rest/v1")) { res.writeHead(404); return res.end(); }
  const p = http.request({ host: "127.0.0.1", port: 3300, path: req.url.slice("/rest/v1".length) || "/", method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(p);
}).listen(54321);
