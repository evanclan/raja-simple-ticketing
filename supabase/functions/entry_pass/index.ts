// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6";

// Security constants
const MAX_REQUEST_SIZE = 1024 * 10; // 10KB max request size
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_IP = 100; // per window
const MAX_PIN_ATTEMPTS = 5; // reduced from 10
const PIN_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const TOKEN_MAX_LENGTH = 2048; // JWT tokens shouldn't be longer than this
const EMAIL_MAX_LENGTH = 254; // RFC 5321 limit
const MIN_PIN_LENGTH = 4; // Minimum PIN length
const MAX_PIN_LENGTH = 12; // Maximum PIN length

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
      pdfUrl?: string;
      pdfBase64?: string;
      pdfName?: string;
    }
  | {
      action: "bulk_send";
      baseUrl?: string;
      from?: string;
      subject?: string;
      html?: string;
      text?: string;
      pdfUrl?: string;
      pdfBase64?: string;
      pdfName?: string;
    };

// Rate limiting storage
const rateLimitStore = new Map<string, { count: number; ts: number }>();
const pinAttempts = new Map<
  string,
  { count: number; ts: number; lockedUntil?: number }
>();

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

// Security validation functions
function validateToken(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  if (token.length > TOKEN_MAX_LENGTH) return false;
  // JWT tokens have 3 parts separated by dots
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  // Each part should be base64url encoded (alphanumeric + - and _)
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => base64urlPattern.test(part));
}

function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > EMAIL_MAX_LENGTH) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function validatePin(pin: string): boolean {
  if (!pin || typeof pin !== "string") return false;
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) return false;
  return /^\d+$/.test(pin); // Only digits
}

function validateRowHash(hash: string): boolean {
  if (!hash || typeof hash !== "string") return false;
  if (hash.length < 10 || hash.length > 128) return false;
  // Should be alphanumeric
  return /^[A-Za-z0-9]+$/.test(hash);
}

function validateUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeString(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

// Enhanced rate limiting
function checkRateLimit(ip: string, action: string): boolean {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.ts > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(key, { count: 1, ts: now });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_IP) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Enhanced PIN rate limiting with lockout
function checkPinRateLimit(key: string): {
  allowed: boolean;
  lockedUntil?: number;
} {
  const now = Date.now();
  const entry = pinAttempts.get(key);

  // Check if locked out
  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, lockedUntil: entry.lockedUntil };
  }

  // Reset if window expired
  if (!entry || now - entry.ts > RATE_LIMIT_WINDOW) {
    pinAttempts.set(key, { count: 1, ts: now });
    return { allowed: true };
  }

  // Check if exceeded attempts
  if (entry.count >= MAX_PIN_ATTEMPTS) {
    const lockedUntil = now + PIN_LOCKOUT_TIME;
    pinAttempts.set(key, { ...entry, lockedUntil });
    return { allowed: false, lockedUntil };
  }

  entry.count += 1;
  return { allowed: true };
}

// Secure logging (remove sensitive data)
function secureLog(message: string, data?: any) {
  const isProduction = Deno.env.get("DENO_DEPLOYMENT_ID"); // Deno Deploy sets this
  if (isProduction) {
    // In production, only log essential info without sensitive data
    console.log(message);
  } else {
    // In development, log more details
    console.log(message, data);
  }
}

function getSupabaseServiceClient() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  if (!serviceKey) throw new Error("Missing service role key");

  secureLog("Creating Supabase client");

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

  secureLog("Supabase client created successfully");

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
  attachments?: Array<{
    filename: string;
    content: string;
  }>;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY env var");

  const emailPayload: any = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  };
  if (params.attachments && params.attachments.length > 0) {
    emailPayload.attachments = params.attachments;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(emailPayload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${err}`);
  }
  return await res.json();
}

// Helper function to fetch PDF content for attachment
async function fetchPdfAttachment(pdfUrl: string): Promise<{
  filename: string;
  content: string;
} | null> {
  try {
    if (!pdfUrl || !validateUrl(pdfUrl)) return null;

    const response = await fetch(pdfUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/pdf")) return null;

    const arrayBuffer = await response.arrayBuffer();
    const base64Content = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    // Extract filename from URL or use default
    const urlParts = pdfUrl.split("/");
    const filename = urlParts[urlParts.length - 1] || "event-instructions.pdf";

    return {
      filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      content: base64Content,
    };
  } catch (error) {
    secureLog("Error fetching PDF attachment", { error: error.message });
    return null;
  }
}

// Template processing function
function processEmailTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    processed = processed.replace(regex, value || "");
  }
  return processed;
}

// Legacy function - removed in favor of enhanced checkPinRateLimit

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

  // Security: Check request size
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
    return new Response(JSON.stringify({ error: "Request too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "";

  // Basic bot detection
  if (
    userAgent.includes("bot") ||
    userAgent.includes("crawler") ||
    userAgent.includes("spider")
  ) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = (await req.json()) as ActionRequest;

    // Validate action exists and is allowed
    const allowedActions = [
      "generate_link",
      "resolve",
      "check_in",
      "send_email",
      "bulk_send",
    ];
    if (!body.action || !allowedActions.includes(body.action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check rate limiting for this IP and action
    if (!checkRateLimit(ip, body.action)) {
      secureLog(`Rate limit exceeded for IP: ${ip.slice(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if this is a public action that doesn't require authentication
    const publicActions = ["resolve"];
    const isPublicAction = publicActions.includes(body.action);

    secureLog(`Processing action: ${body.action}`);

    // For public actions, we still need to use the service client but don't require user auth
    const supabase = getSupabaseServiceClient();

    if (body.action === "generate_link") {
      await requireAdmin(req);

      // Input validation
      const baseUrl =
        body.baseUrl?.trim() || Deno.env.get("PUBLIC_APP_URL") || "";
      if (!baseUrl) throw new Error("Missing baseUrl");
      if (!validateUrl(baseUrl)) throw new Error("Invalid baseUrl format");
      if (!body.row_hash) throw new Error("row_hash is required");
      if (!validateRowHash(body.row_hash))
        throw new Error("Invalid row_hash format");

      const token = await signToken({ rh: body.row_hash });
      const url = `${baseUrl.replace(/\/$/, "")}/pass/${token}`;

      secureLog("Entry pass link generated successfully");
      return new Response(JSON.stringify({ ok: true, url, token }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (body.action === "resolve") {
      try {
        // Input validation
        if (!body.token) throw new Error("Token is required");
        if (!validateToken(body.token)) throw new Error("Invalid token format");

        const { rh } = await verifyToken(body.token);
        if (!rh || typeof rh !== "string")
          throw new Error("Invalid token payload");
        if (!validateRowHash(rh)) throw new Error("Invalid row hash in token");

        secureLog("Resolving entry pass");

        // Try using Supabase client directly - it should use service role key
        const { data, error } = await supabase
          .from("paidparticipants")
          .select("row_number, headers, data")
          .eq("row_hash", rh)
          .single();

        if (error) {
          secureLog(`Database error: ${error.code}`, {
            message: error.message,
          });
          throw new Error("Failed to retrieve entry pass data");
        }

        secureLog("Participant data retrieved successfully");

        const { data: checkin, error: cErr } = await supabase
          .from("checkins")
          .select("row_hash, checked_in_at, checked_in_by")
          .eq("row_hash", rh)
          .maybeSingle();

        if (cErr) {
          secureLog("Checkin fetch warning", { code: cErr.code });
        }

        return new Response(
          JSON.stringify({ ok: true, participant: data, checkin }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        secureLog("Error in resolve action", { error: error.message });
        throw error;
      }
    }

    if (body.action === "check_in") {
      // Input validation
      if (!body.token) throw new Error("Token is required");
      if (!validateToken(body.token)) throw new Error("Invalid token format");
      if (!body.pin) throw new Error("PIN is required");
      if (!validatePin(body.pin)) {
        secureLog(
          `PIN validation failed - length: ${
            body.pin.length
          }, content type: ${typeof body.pin}`
        );
        throw new Error("Invalid PIN format");
      }

      // Enhanced rate limiting for PIN attempts
      const ip =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const key = `${ip}:${body.token.slice(0, 16)}`;
      const rateLimitResult = checkPinRateLimit(key);

      if (!rateLimitResult.allowed) {
        const errorMessage = rateLimitResult.lockedUntil
          ? "Account temporarily locked due to too many failed attempts"
          : "Too many attempts";

        secureLog(`PIN rate limit exceeded for IP: ${ip.slice(0, 8)}...`);
        return new Response(
          JSON.stringify({
            ok: false,
            error: errorMessage,
            lockedUntil: rateLimitResult.lockedUntil,
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Verify PIN
      const pin = body.pin.trim();
      const expected = requiredEnv("ENTRY_ADMIN_PIN");
      if (pin !== expected) {
        secureLog(`Invalid PIN attempt from IP: ${ip.slice(0, 8)}...`);
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid PIN" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Verify token and extract row hash
      const { rh } = await verifyToken(body.token);
      if (!rh || typeof rh !== "string")
        throw new Error("Invalid token payload");
      if (!validateRowHash(rh)) throw new Error("Invalid row hash in token");

      // Perform check-in
      const { error } = await supabase.from("checkins").upsert(
        [
          {
            row_hash: rh,
            checked_in_at: new Date().toISOString(),
            checked_in_by: ip.slice(0, 12), // Store partial IP for audit
          },
        ],
        {
          onConflict: "row_hash",
        }
      );

      if (error) {
        secureLog("Check-in database error", { code: error.code });
        throw new Error("Failed to record check-in");
      }

      secureLog("Check-in successful");
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

      // Template variables for processing
      const templateVars = {
        name: name || "",
        email: to || "",
        url: url,
      };

      const defaultHtml = `<div>
  <p>${name ? `${name} 様` : ""}</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="${url}">${url}</a></p>
</div>`;
      const defaultText = `${
        name ? `${name} 様\n` : ""
      }イベントの入場用リンクです。当日入口でスタッフにお見せください。\nThis is your entry pass. Show this link at the entrance.\n${url}`;

      // Process templates with variables
      const html = processEmailTemplate(body.html || defaultHtml, templateVars);
      const text = processEmailTemplate(body.text || defaultText, templateVars);

      // Handle PDF attachment if provided
      let attachments: Array<{ filename: string; content: string }> | undefined;

      if (body.pdfBase64 && body.pdfName) {
        // Handle base64 PDF attachment
        const base64Content = body.pdfBase64.includes(",")
          ? body.pdfBase64.split(",")[1]
          : body.pdfBase64;

        attachments = [
          {
            filename: body.pdfName,
            content: base64Content,
          },
        ];
      } else if (body.pdfUrl) {
        // Handle URL-based PDF attachment
        const pdfAttachment = await fetchPdfAttachment(body.pdfUrl);
        if (pdfAttachment) {
          attachments = [pdfAttachment];
        }
      }

      const result = await sendViaResend({
        to,
        subject,
        html,
        text,
        from,
        attachments,
      });
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
          const subject = (body as any).subject || "Your Entry Pass";

          // Template variables for processing
          const templateVars = {
            name: name || "",
            email: to || "",
            url: url,
          };

          const defaultHtml = `<div>
  <p>${name ? `${name} 様` : ""}</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="${url}">${url}</a></p>
</div>`;
          const defaultText = `${
            name ? `${name} 様\n` : ""
          }イベントの入場用リンクです。当日入口でスタッフにお見せください。\nThis is your entry pass. Show this link at the entrance.\n${url}`;

          // Process templates with variables
          const html = processEmailTemplate(
            (body as any).html || defaultHtml,
            templateVars
          );
          const text = processEmailTemplate(
            (body as any).text || defaultText,
            templateVars
          );

          // Handle PDF attachment if provided (shared across all emails in bulk send)
          let attachments:
            | Array<{ filename: string; content: string }>
            | undefined;

          if ((body as any).pdfBase64 && (body as any).pdfName) {
            // Handle base64 PDF attachment
            const base64Content = (body as any).pdfBase64.includes(",")
              ? (body as any).pdfBase64.split(",")[1]
              : (body as any).pdfBase64;

            attachments = [
              {
                filename: (body as any).pdfName,
                content: base64Content,
              },
            ];
          } else if ((body as any).pdfUrl) {
            // Handle URL-based PDF attachment
            const pdfAttachment = await fetchPdfAttachment(
              (body as any).pdfUrl
            );
            if (pdfAttachment) {
              attachments = [pdfAttachment];
            }
          }

          try {
            const result = await sendViaResend({
              to,
              subject,
              html,
              text,
              from,
              attachments,
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
    secureLog("Function error", {
      error: err?.message,
      stack: err?.stack?.split("\n")[0],
    });

    // Don't expose internal errors in production
    const isProduction = Deno.env.get("DENO_DEPLOYMENT_ID");
    const errorMessage = isProduction
      ? "An internal error occurred"
      : err?.message ?? "Unknown error";

    // Determine appropriate status code
    let status = 400;
    if (
      err?.message?.includes("Unauthorized") ||
      err?.message?.includes("Forbidden")
    ) {
      status = 403;
    } else if (err?.message?.includes("Not found")) {
      status = 404;
    } else if (err?.message?.includes("Too many")) {
      status = 429;
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req.headers.get("Origin")),
        },
      }
    );
  }
});
