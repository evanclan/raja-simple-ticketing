// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6";

type ActionRequest =
  | { action: "generate_link"; row_hash: string; baseUrl?: string }
  | { action: "resolve"; token: string }
  | { action: "check_in"; token: string; pin: string }
  | { action: "test_db" }
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

function getCorsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-admin-secret",
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
    "";
  if (!serviceKey) throw new Error("Missing service role key");

  console.log("Creating Supabase client with URL:", url);
  console.log("Service key available:", serviceKey ? "Yes" : "No");

  // Create client with service role key - this should bypass RLS
  const client = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  console.log("Client created with service key");

  return client;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

function resolveAllowedFrom(requested?: string): string {
  const fromEnv = (
    Deno.env.get("ALLOWED_FROM") ||
    Deno.env.get("EMAIL_FROM") ||
    "no-reply@example.com"
  ).trim();
  const allowed = fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // If no specific sender requested, use first allowed or default
  if (!requested) return allowed[0] || "no-reply@example.com";

  const req = requested.trim();

  // If no allowed senders configured, allow any sender
  if (allowed.length === 0) return req;

  // Check if requested sender is in allowed list
  if (allowed.includes(req)) return req;

  // More detailed error message for debugging
  console.error(
    `Sender not allowed. Requested: "${req}", Allowed: ${JSON.stringify(
      allowed
    )}`
  );
  throw new Error(
    `Sender not allowed: "${req}". Allowed senders: ${allowed.join(", ")}`
  );
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

// naive in-memory rate limiter for PIN attempts (per token+ip)
const pinAttempts = new Map<string, { count: number; ts: number }>();
function rateLimitPin(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = pinAttempts.get(key);
  if (!entry || now - entry.ts > windowMs) {
    pinAttempts.set(key, { count: 1, ts: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
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
      await requireAdmin(req);
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
      try {
        console.log("Starting resolve action...");
        console.log("Token received:", body.token ? "Yes" : "No");

        const { rh } = await verifyToken(body.token);
        if (!rh || typeof rh !== "string") throw new Error("Invalid token");

        console.log("Resolving entry pass for hash:", rh);

        // Try using Supabase client directly - it should use service role key
        console.log("Using Supabase client with service role...");
        const { data, error } = await supabase
          .from("paidparticipants")
          .select("row_number, headers, data")
          .eq("row_hash", rh)
          .single();

        if (error) {
          console.error("Supabase client error:", error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
          console.error("Error details:", error.details);
          console.error("Error hint:", error.hint);
          throw new Error(
            `Database error: ${error.message} (Code: ${error.code})`
          );
        }

        console.log("Participant data fetched successfully");

        const { data: checkin, error: cErr } = await supabase
          .from("checkins")
          .select("row_hash, checked_in_at, checked_in_by")
          .eq("row_hash", rh)
          .maybeSingle();

        if (cErr) {
          console.warn("Checkin fetch error:", cErr.message);
        }

        return new Response(
          JSON.stringify({ ok: true, participant: data, checkin }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        console.error("Error in resolve action:", error);
        throw error;
      }
    }

    if (body.action === "test_db") {
      try {
        console.log("Testing database connection with service role...");

        // Test 1: Try to query paidparticipants table
        const {
          data: testData,
          error: testError,
          count,
        } = await supabase
          .from("paidparticipants")
          .select("row_hash", { count: "exact" })
          .limit(1);

        if (testError) {
          console.error("Test query failed:", testError);
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Database test failed",
              details: testError,
              service_key_length: (
                Deno.env.get("SERVICE_ROLE_KEY") ||
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
                ""
              ).length,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            message: "Database connection successful",
            count: count,
            has_data: testData && testData.length > 0,
            service_key_length: (
              Deno.env.get("SERVICE_ROLE_KEY") ||
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
              ""
            ).length,
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        console.error("Test action error:", error);
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Test failed with exception",
            message: error.message,
            service_key_length: (
              Deno.env.get("SERVICE_ROLE_KEY") ||
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
              ""
            ).length,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    if (body.action === "check_in") {
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      const key = `${ip}:${(body.token || "").slice(0, 16)}`;
      if (!rateLimitPin(key)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Too many attempts" }),
          {
            status: 429,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
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
      await requireAdmin(req);
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
      if (!to || !isEmail(to))
        throw new Error("Recipient email not found for this row");
      const name = (
        body.name ||
        detectName(data?.headers, data?.data) ||
        ""
      ).trim();
      const subject = (body.subject || "Your Entry Pass").trim();
      const from = resolveAllowedFrom(body.from);
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
      await requireAdmin(req);
      const baseUrl =
        body.baseUrl?.trim() || Deno.env.get("PUBLIC_APP_URL") || "";
      if (!baseUrl) throw new Error("Missing baseUrl (set PUBLIC_APP_URL)");
      const from = resolveAllowedFrom(body.from);
      const { data, error } = await supabase
        .from("paidparticipants")
        .select("row_hash, headers, data")
        .order("row_number", { ascending: true });
      if (error) throw error;
      const results: any[] = [];
      const list = data || [];
      const CONC = 5;
      let idx = 0;
      async function worker() {
        while (true) {
          const current = idx++;
          if (current >= list.length) break;
          const row = list[current] as any;
          const token = await signToken({ rh: row.row_hash });
          const url = `${baseUrl.replace(/\/$/, "")}/pass/${token}`;
          const to = detectEmail(row.headers as any, row.data as any);
          if (!to || !isEmail(to)) {
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
            const result = await sendViaResend({
              to,
              subject,
              html,
              text,
              from,
            });
            results.push({ row_hash: row.row_hash, sent: true, result });
          } catch (e: any) {
            results.push({
              row_hash: row.row_hash,
              sent: false,
              error: e?.message || String(e),
            });
          }
        }
      }
      const workers = Array.from({ length: Math.min(CONC, list.length) }, () =>
        worker()
      );
      await Promise.all(workers);
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("Function error:", err);
    console.error("Error stack:", err?.stack);
    return new Response(
      JSON.stringify({
        error: err?.message ?? String(err),
        details: err?.stack ? err.stack.split("\n").slice(0, 5) : undefined,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req.headers.get("Origin")),
        },
      }
    );
  }
});
