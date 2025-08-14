// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6";

type ActionRequest =
  | { action: "generate_link"; row_hash: string; baseUrl?: string }
  | { action: "resolve"; token: string }
  | { action: "check_in"; token: string; pin: string }
  | {
      action: "send_email";
      row_hash: string;
      baseUrl?: string;
      to?: string;
      name?: string;
      subject?: string;
      html?: string;
      text?: string;
      from?: string;
    }
  | { action: "bulk_send"; baseUrl?: string; from?: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getSupabaseServiceClient() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    requiredEnv("SUPABASE_ANON_KEY");
  return createClient(url, serviceKey);
}

async function signToken(payload: Record<string, any>): Promise<string> {
  const secret = new TextEncoder().encode(requiredEnv("ENTRY_JWT_SECRET"));
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 60; // 60 days
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
}

async function verifyToken(token: string): Promise<any> {
  const secret = new TextEncoder().encode(requiredEnv("ENTRY_JWT_SECRET"));
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

function detectEmail(
  headers: string[] | null | undefined,
  data: Record<string, any>
): string | null {
  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const candidates = (headers || []).map((h) => String(h || ""));
  const lower = candidates.map((h) => h.toLowerCase());
  const patterns = ["email", "e-mail", "mail", "メール", "メールアドレス"];
  for (let i = 0; i < candidates.length; i++) {
    const h = lower[i];
    if (patterns.some((p) => h.includes(p))) {
      const key = candidates[i];
      const val = data?.[key];
      if (typeof val === "string" && EMAIL_REGEX.test(val)) return val.trim();
    }
  }
  for (const v of Object.values(data || {})) {
    if (typeof v === "string" && EMAIL_REGEX.test(v)) return v.trim();
  }
  return null;
}

function detectName(
  headers: string[] | null | undefined,
  data: Record<string, any>
): string | undefined {
  const candidates = (headers || []).map((h) => String(h || ""));
  const patterns = [
    "代表者氏名",
    "代表者",
    "氏名",
    "お名前",
    "名前",
    "name",
    "申込者",
  ];
  for (const key of candidates) {
    const k = String(key || "").toLowerCase();
    if (patterns.some((p) => k.includes(p.toLowerCase()))) {
      const v = data?.[key];
      if (v) return String(v);
    }
  }
  return undefined;
}

async function sendViaResend(params: {
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
    body: JSON.stringify(params),
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
    const body = (await req.json()) as ActionRequest;
    const supabase = getSupabaseServiceClient();

    if (body.action === "generate_link") {
      const baseUrl =
        body.baseUrl?.trim() || Deno.env.get("PUBLIC_APP_URL") || "";
      if (!baseUrl) throw new Error("Missing baseUrl (set PUBLIC_APP_URL)");
      if (!body.row_hash) throw new Error("row_hash is required");
      const token = await signToken({ rh: body.row_hash });
      const url = `${baseUrl.replace(/\/$/, "")}/pass/${token}`;
      return new Response(JSON.stringify({ ok: true, url, token }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (body.action === "resolve") {
      const { rh } = await verifyToken(body.token);
      if (!rh || typeof rh !== "string") throw new Error("Invalid token");
      const { data, error } = await supabase
        .from("paidparticipants")
        .select("row_number, headers, data")
        .eq("row_hash", rh)
        .single();
      if (error) throw error;
      const { data: checkin, error: cErr } = await supabase
        .from("checkins")
        .select("row_hash, checked_in_at, checked_in_by")
        .eq("row_hash", rh)
        .maybeSingle();
      if (cErr) throw cErr;
      return new Response(
        JSON.stringify({ ok: true, participant: data, checkin }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (body.action === "check_in") {
      const pin = (body.pin || "").trim();
      const expected = requiredEnv("ENTRY_ADMIN_PIN");
      if (!pin || pin !== expected) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const { rh } = await verifyToken(body.token);
      if (!rh || typeof rh !== "string") throw new Error("Invalid token");
      const { error } = await supabase
        .from("checkins")
        .upsert([{ row_hash: rh, checked_in_at: new Date().toISOString() }], {
          onConflict: "row_hash",
        });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (body.action === "send_email") {
      const baseUrl =
        body.baseUrl?.trim() || Deno.env.get("PUBLIC_APP_URL") || "";
      if (!baseUrl) throw new Error("Missing baseUrl (set PUBLIC_APP_URL)");
      if (!body.row_hash) throw new Error("row_hash is required");
      const token = await signToken({ rh: body.row_hash });
      const url = `${baseUrl.replace(/\/$/, "")}/pass/${token}`;
      const { data, error } = await supabase
        .from("paidparticipants")
        .select("headers, data")
        .eq("row_hash", body.row_hash)
        .single();
      if (error) throw error;
      const to = (
        body.to ||
        detectEmail(data?.headers, data?.data) ||
        ""
      ).trim();
      if (!to) throw new Error("Recipient email not found for this row");
      const name = (
        body.name ||
        detectName(data?.headers, data?.data) ||
        ""
      ).trim();
      const subject = (body.subject || "Your Entry Pass").trim();
      const from =
        body.from?.trim() ||
        Deno.env.get("EMAIL_FROM") ||
        "no-reply@example.com";
      const defaultHtml = `<div>
  <p>${name ? `${name} 様` : ""}</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="${url}">${url}</a></p>
</div>`;
      const defaultText = `${
        name ? `${name} 様\n` : ""
      }イベントの入場用リンクです。当日入口でスタッフにお見せください。\nThis is your entry pass. Show this link at the entrance.\n${url}`;
      const html = body.html || defaultHtml;
      const text = body.text || defaultText;
      const result = await sendViaResend({ to, subject, html, text, from });
      return new Response(
        JSON.stringify({ ok: true, url, token, provider: "resend", result }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (body.action === "bulk_send") {
      const baseUrl =
        body.baseUrl?.trim() || Deno.env.get("PUBLIC_APP_URL") || "";
      if (!baseUrl) throw new Error("Missing baseUrl (set PUBLIC_APP_URL)");
      const from =
        body.from?.trim() ||
        Deno.env.get("EMAIL_FROM") ||
        "no-reply@example.com";
      const { data, error } = await supabase
        .from("paidparticipants")
        .select("row_hash, headers, data")
        .order("row_number", { ascending: true });
      if (error) throw error;
      const results: any[] = [];
      for (const row of data || []) {
        const token = await signToken({ rh: row.row_hash });
        const url = `${baseUrl.replace(/\/$/, "")}/pass/${token}`;
        const to = detectEmail(row.headers as any, row.data as any);
        if (!to) {
          results.push({
            row_hash: row.row_hash,
            skipped: true,
            reason: "no-email",
          });
          continue;
        }
        const name = detectName(row.headers as any, row.data as any) || "";
        const subject = "Your Entry Pass";
        const html = `<div>
  <p>${name ? `${name} 様` : ""}</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="${url}">${url}</a></p>
</div>`;
        const text = `${
          name ? `${name} 様\n` : ""
        }イベントの入場用リンクです。当日入口でスタッフにお見せください。\nThis is your entry pass. Show this link at the entrance.\n${url}`;
        try {
          const result = await sendViaResend({ to, subject, html, text, from });
          results.push({ row_hash: row.row_hash, sent: true, result });
        } catch (e: any) {
          results.push({
            row_hash: row.row_hash,
            sent: false,
            error: e?.message || String(e),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
