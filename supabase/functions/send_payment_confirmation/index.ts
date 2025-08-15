// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SendRequest = {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  name?: string;
  from?: string;
};

function getCorsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function defaultHtml(name?: string) {
  const who = name ? `${name} 様` : "";
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, Apple Color Emoji, Segoe UI Emoji">
    <p>${who}</p>
    <p>お支払いを確認しました。ありがとうございます！</p>
    <p>This is a confirmation that we received your payment. Thank you.</p>
  </div>`;
}

function defaultText(name?: string) {
  const who = name ? `${name} 様\n` : "";
  return `${who}お支払いを確認しました。ありがとうございます！\nThis is a confirmation that we received your payment. Thank you.`;
}

async function requireAdmin(req: Request): Promise<void> {
  const adminSecret = Deno.env.get("ADMIN_SECRET");
  const secretHeader = req.headers.get("x-admin-secret");
  if (adminSecret && secretHeader && secretHeader === adminSecret) return;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) throw new Error("Server misconfigured");

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === anonKey) throw new Error("Unauthorized");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");

  const allowed = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0) {
    const email = (data.user.email || "").toLowerCase();
    if (!allowed.includes(email)) throw new Error("Forbidden");
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

async function sendViaResend({
  to,
  subject,
  html,
  text,
  from,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY env var");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${err}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
  try {
    await requireAdmin(req);

    const body = (await req.json()) as SendRequest;
    const to = (body?.to || "").trim();
    if (!to || !isEmail(to)) throw new Error("Invalid 'to' email address");

    const name = body?.name?.trim() || undefined;
    const subject = body?.subject?.trim() || "Payment confirmation";
    const html = body?.html || defaultHtml(name);
    const text = body?.text || defaultText(name);
    const from =
      body?.from?.trim() ||
      Deno.env.get("EMAIL_FROM") ||
      "no-reply@example.com";

    const result = await sendViaResend({ to, subject, html, text, from });

    return new Response(
      JSON.stringify({ ok: true, provider: "resend", result }),
      {
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }
});
