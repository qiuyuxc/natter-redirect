/**
 * natter-redirect —— 给动态公网地址一个固定域名
 *
 * 背景：Natter 这类打洞工具拿到的公网 IP:PORT 会随重拨/映射回收变化，
 * 而 DNS 的 A 记录存不了端口。这个 Worker 做两件事：
 *   1. 接收设备上报的 IP:PORT，存进 KV
 *   2. 访问固定域名时 302 到当前地址（保留 path 和 query）
 *
 * 需要绑定：
 *   - KV namespace  -> 变量名 KV
 *   - Secret        -> 变量名 SECRET（自定义长随机串）
 */

const KEY = "addr";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function validAddr(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(s);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) return false;
  }
  const port = Number(m[5]);
  return port >= 1 && port <= 65535;
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 没配 SECRET 时一律拒绝：否则空串和空串相等，等于没有鉴权
function authorized(request, env) {
  const secret = env.SECRET;
  if (typeof secret !== "string" || secret.length < 16) return false;
  return safeEqual(request.headers.get("x-auth") || "", secret);
}

async function readAddr(env) {
  const raw = await env.KV.get(KEY);
  if (!raw) return { addr: null, ts: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { addr: raw, ts: 0 };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 上报：POST /_nat/update  body: "1.2.3.4:5678"  header: x-auth: <SECRET>
    if (url.pathname === "/_nat/update") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      const addr = (await request.text()).trim();
      if (!validAddr(addr)) return json({ error: "bad address" }, 400);
      await env.KV.put(KEY, JSON.stringify({ addr, ts: Date.now() }));
      return new Response("ok " + addr + "\n", { headers: { "cache-control": "no-store" } });
    }

    // 查询：GET /_nat/status（同样要鉴权，别把当前地址白送）
    if (url.pathname === "/_nat/status") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      return json(await readAddr(env));
    }

    // 跳转
    const { addr } = await readAddr(env);
    if (!addr) {
      return new Response("No address reported yet.\n", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return Response.redirect("http://" + addr + url.pathname + url.search, 302);
  },
};
