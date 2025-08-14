// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type SendRequest = {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  name?: string;
  from?: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  try {
    const body = (await req.json()) as SendRequest;
    const to = (body?.to || "").trim();
    if (!to) throw new Error("Missing 'to' email address");

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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
