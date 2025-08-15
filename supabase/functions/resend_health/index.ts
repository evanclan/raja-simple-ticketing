import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function getCorsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  const allowList = (Deno.env.get("CORS_ALLOW_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowList.length > 0 && allowList.includes(origin)) {
    return { ...base, "Access-Control-Allow-Origin": origin };
  }
  const publicUrl = Deno.env.get("PUBLIC_APP_URL") || "";
  try {
    if (publicUrl) {
      const o = new URL(publicUrl).origin;
      return { ...base, "Access-Control-Allow-Origin": o };
    }
  } catch {}
  return { ...base, "Access-Control-Allow-Origin": "*" };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY" }),
        { status: 200, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Resend API error: ${errText}` }),
        { status: 200, headers: { "Content-Type": "application/json", ...cors } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error)?.message || String(e) }),
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
});


