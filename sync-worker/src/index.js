const ALLOWED_ORIGINS = new Set([
  "https://vibe-learn.ai",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);

const STATE_KEY = "default";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
      return json({ error: "unauthorized" }, 401, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/state") {
      return json({ error: "not found" }, 404, cors);
    }

    if (request.method === "GET") {
      const blob = await env.STATE.get(STATE_KEY);
      return json(blob ? JSON.parse(blob) : {}, 200, cors);
    }

    if (request.method === "PUT") {
      const body = await request.text();
      try { JSON.parse(body); }
      catch { return json({ error: "invalid json" }, 400, cors); }
      await env.STATE.put(STATE_KEY, body);
      return json({ ok: true, bytes: body.length }, 200, cors);
    }

    return json({ error: "method not allowed" }, 405, cors);
  },
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://vibe-learn.ai";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
