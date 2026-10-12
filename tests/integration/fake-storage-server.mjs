// 本機整合測試用：模擬 Supabase Storage API 中本專案用到的端點，檔案存在記憶體、metadata 寫入 PostgreSQL storage.objects。
// 權限檢查以「使用者 JWT 的身分 + storage.objects 的 RLS」執行，與 Supabase 行為一致（簡化版）。
// 需要：npm i --no-save pg；環境變數 LOCAL_JWT_SECRET、PGURL（postgres 超級使用者連線字串）。
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const SECRET = process.env.LOCAL_JWT_SECRET ?? "";
const pool = new pg.Pool({ connectionString: process.env.PGURL });
const files = new Map(); // `${bucket}/${path}` -> { bytes, mime }
const uploadTokens = new Map(); // token -> { bucket, path, sub }
const signTokens = new Map(); // token -> { bucket, path, exp }

function claimsOf(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
}

/** 以使用者身分在交易內執行（RLS 生效）。 */
async function asUser(claims, fn, { commit = true } = {}) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${claims?.role === "authenticated" ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? {})]);
    const r = await fn(c);
    await c.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
      let m;

      // 建立簽名上傳網址：需要 insert 權限（以 RLS 試插入後回滾）
      if (req.method === "POST" && (m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(p))) {
        const [, bucket, path] = m;
        const claims = claimsOf(req);
        try {
          await asUser(claims, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, path, claims?.sub ?? null]), { commit: false });
        } catch {
          return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
        }
        const token = crypto.randomBytes(16).toString("hex");
        uploadTokens.set(token, { bucket, path, sub: claims?.sub ?? null });
        return send(res, 200, { url: `/object/upload/sign/${bucket}/${path}?token=${token}` });
      }

      // 以簽名網址上傳
      if (req.method === "PUT" && (m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(p))) {
        const [, bucket, path] = m;
        const t = uploadTokens.get(url.searchParams.get("token") ?? "");
        if (!t || t.bucket !== bucket || t.path !== path) return send(res, 400, { statusCode: "400", message: "invalid token" });
        uploadTokens.delete(url.searchParams.get("token"));
        const body = await readBody(req);
        let bytes = body;
        let mime = (req.headers["content-type"] ?? "").split(";")[0];
        // storage-js 在 Node 以 FormData 上傳：取出檔案內容與類型
        if (mime === "multipart/form-data") {
          const boundary = /boundary=(.+)$/.exec(req.headers["content-type"])?.[1];
          const text = body.toString("latin1");
          const part = text.split(`--${boundary}`).find((s) => s.includes('name=""') || s.includes("filename"));
          const headerEnd = part.indexOf("\r\n\r\n");
          mime = /content-type:\s*([^\r\n;]+)/i.exec(part.slice(0, headerEnd))?.[1] ?? "application/octet-stream";
          bytes = Buffer.from(part.slice(headerEnd + 4, part.length - 2), "latin1");
        }
        const { rows } = await pool.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
        const b = rows[0];
        if (!b) return send(res, 404, { statusCode: "404", message: "Bucket not found" });
        if (b.file_size_limit && bytes.length > Number(b.file_size_limit)) return send(res, 413, { statusCode: "413", message: "Payload too large" });
        if (b.allowed_mime_types && !b.allowed_mime_types.includes(mime)) return send(res, 415, { statusCode: "415", message: `mime type ${mime} is not supported` });
        try {
          await pool.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [
            bucket,
            path,
            t.sub,
            JSON.stringify({ size: bytes.length, mimetype: mime }),
          ]);
        } catch {
          return send(res, 409, { statusCode: "409", message: "The resource already exists" });
        }
        files.set(`${bucket}/${path}`, { bytes, mime });
        return send(res, 200, { Key: `${bucket}/${path}` });
      }

      // 檔案資訊（RLS select）
      if (req.method === "GET" && (m = /^\/object\/info\/([^/]+)\/(.+)$/.exec(p))) {
        const [, bucket, path] = m;
        const rows = await asUser(claimsOf(req), (c) =>
          c.query("select id, name, bucket_id, created_at, metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, path]),
        );
        const o = rows.rows[0];
        if (!o) return send(res, 404, { statusCode: "404", message: "Object not found" });
        return send(res, 200, { id: o.id, name: o.name, bucket_id: o.bucket_id, created_at: o.created_at, size: o.metadata?.size, content_type: o.metadata?.mimetype, version: "1" });
      }

      // 建立簽名下載網址（單一 / 多個）
      if (req.method === "POST" && (m = /^\/object\/sign\/([^/]+)(?:\/(.+))?$/.exec(p))) {
        const [, bucket, single] = m;
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const paths = single ? [single] : body.paths ?? [];
        const rows = await asUser(claimsOf(req), (c) => c.query("select name from storage.objects where bucket_id = $1 and name = any($2)", [bucket, paths]));
        const visible = new Set(rows.rows.map((r) => r.name));
        const sign = (path) => {
          const token = crypto.randomBytes(16).toString("hex");
          signTokens.set(token, { bucket, path, exp: Date.now() + (body.expiresIn ?? 60) * 1000 });
          return `/object/sign/${bucket}/${path}?token=${token}`;
        };
        if (single) return visible.has(single) ? send(res, 200, { signedURL: sign(single) }) : send(res, 404, { statusCode: "404", message: "Object not found" });
        return send(res, 200, paths.map((path) => (visible.has(path) ? { path, signedURL: sign(path), error: null } : { path, signedURL: null, error: "Either the object does not exist or you do not have access to it" })));
      }

      // 下載（簽名或公開），支援 Range
      if (req.method === "GET" && ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(p)) || (m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(p)))) {
        const [, bucket, path] = m;
        if (p.startsWith("/object/sign/")) {
          const t = signTokens.get(url.searchParams.get("token") ?? "");
          if (!t || t.bucket !== bucket || t.path !== path || t.exp < Date.now()) return send(res, 400, { statusCode: "400", message: "invalid signature" });
        } else {
          const { rows } = await pool.query("select public from storage.buckets where id = $1", [bucket]);
          if (!rows[0]?.public) return send(res, 400, { statusCode: "400", message: "Bucket not public" });
        }
        const f = files.get(`${bucket}/${path}`);
        if (!f) return send(res, 404, { statusCode: "404", message: "Object not found" });
        const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? "");
        if (range) {
          const slice = f.bytes.subarray(Number(range[1]), Number(range[2]) + 1);
          res.writeHead(206, { "content-type": f.mime, "content-range": `bytes ${range[1]}-${range[2]}/${f.bytes.length}` });
          return res.end(slice);
        }
        res.writeHead(200, { "content-type": f.mime });
        return res.end(f.bytes);
      }

      // 刪除（RLS delete）
      if (req.method === "DELETE" && (m = /^\/object\/([^/]+)$/.exec(p))) {
        const [, bucket] = m;
        const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
        const rows = await asUser(claimsOf(req), (c) =>
          c.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name, bucket_id", [bucket, prefixes]),
        );
        for (const r of rows.rows) files.delete(`${bucket}/${r.name}`);
        return send(res, 200, rows.rows.map((r) => ({ name: r.name, bucket_id: r.bucket_id })));
      }

      send(res, 404, { statusCode: "404", message: "not emulated" });
    } catch (e) {
      send(res, 500, { statusCode: "500", message: String(e?.message ?? e) });
    }
  })
  .listen(Number(process.env.STORAGE_PORT ?? 54322));
