// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

type SheetSyncRequest = {
  sheetId: string;
  range?: string; // e.g. "Sheet1!A:Z"
};

const SHEETS_SCOPE_READONLY =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const SHEETS_SCOPE_RW = "https://www.googleapis.com/auth/spreadsheets";

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getAccessTokenFromServiceAccount(
  scope: string
): Promise<string> {
  const clientEmail = Deno.env.get("GOOGLE_CLIENT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key as CryptoKey);

  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", assertion);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function fetchSheetValues(
  sheetId: string,
  range: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  const hasSvcCreds = Boolean(
    Deno.env.get("GOOGLE_CLIENT_EMAIL") && Deno.env.get("GOOGLE_PRIVATE_KEY")
  );

  let values: string[][] = [];
  // Prefer service account for private sheets
  if (hasSvcCreds) {
    const accessToken = await getAccessTokenFromServiceAccount(
      SHEETS_SCOPE_READONLY
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      range
    )}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Sheets API (service account) error for sheetId='${sheetId}' range='${range}': ${err}`
      );
    }
    const data = await res.json();
    values = data.values ?? [];
  } else if (apiKey) {
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
        range
      )}`
    );
    url.searchParams.set("key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Sheets API (API key) error for sheetId='${sheetId}' range='${range}': ${err}`
      );
    }
    const data = await res.json();
    values = data.values ?? [];
  } else {
    throw new Error(
      "Missing Google credentials: set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY for private sheets, or GOOGLE_API_KEY for public sheets"
    );
  }

  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  // Find the first non-empty row to use as headers
  let headerRowIndex = 0;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(values.length, 5); i++) {
    // Check first 5 rows max
    const row = values[i] ?? [];
    const processedRow = row.map((h: string) => (h ?? "").trim());
    const nonEmptyCount = processedRow.filter((h) => h).length;

    console.log(`Debug - Row ${i}:`, row);
    console.log(`Debug - Processed row ${i}:`, processedRow);
    console.log(`Debug - Non-empty count in row ${i}:`, nonEmptyCount);

    if (nonEmptyCount > 0) {
      headers = processedRow;
      headerRowIndex = i;
      console.log(`Debug - Using row ${i} as headers:`, headers);
      console.log(
        `Debug - Headers detailed:`,
        headers.map((h, idx) => `${idx}: "${h}" (length: ${h?.length || 0})`)
      );
      break;
    }
  }

  // If still no valid headers found, generate column names based on the first row length
  if (headers.filter((h) => h).length === 0 && values[0]) {
    console.log("Debug - No valid headers found, generating column names");
    const firstRowLength = values[0].length;
    headers = Array.from(
      { length: firstRowLength },
      (_, i) => `Column ${i + 1}`
    );
    headerRowIndex = 0;
  }

  // Special case: if headers are empty but we have data, the first data row might be the actual headers
  const emptyHeaderCount = headers.filter((h) => !h || h.trim() === "").length;
  if (
    emptyHeaderCount > headers.length / 2 &&
    values.length > headerRowIndex + 1
  ) {
    console.log(
      "Debug - Headers mostly empty, checking if next row contains actual headers"
    );
    const nextRow = values[headerRowIndex + 1] ?? [];
    const processedNextRow = nextRow.map((h: string) => (h ?? "").trim());
    const nextRowNonEmptyCount = processedNextRow.filter((h) => h).length;

    console.log("Debug - Next row:", nextRow);
    console.log("Debug - Next row processed:", processedNextRow);
    console.log("Debug - Next row non-empty count:", nextRowNonEmptyCount);

    // If the next row looks like headers (has many non-empty strings that look like field names)
    const looksLikeHeaders = processedNextRow.some(
      (h) =>
        h.includes("タイムスタンプ") ||
        h.includes("メール") ||
        h.includes("氏名") ||
        h.includes("参加") ||
        h.includes("人数") ||
        h.includes("電話")
    );

    if (looksLikeHeaders && nextRowNonEmptyCount > headers.length / 2) {
      console.log(
        "Debug - Next row appears to contain actual headers, using it instead"
      );
      headers = processedNextRow;
      headerRowIndex = headerRowIndex + 1;
    } else {
      console.log("Debug - Using fallback Japanese form field names");
      const commonHeaders = [
        "タイムスタンプ",
        "メールアドレス",
        "代表者氏名",
        "フリガナ",
        "参加区分",
        "メールアドレス",
        "電話番号",
        "一般参加者の属性",
        "おとな参加人数（中学生以上)",
        "こども参加人数（年少～小学生）",
        "仮装の意志確認",
        "その他ご質問など",
        "こども参加人数（年少々以下）",
      ];

      for (let i = 0; i < headers.length; i++) {
        if (!headers[i] || headers[i].trim() === "") {
          headers[i] = commonHeaders[i] || `Column ${i + 1}`;
        }
      }
    }
    console.log("Debug - Final headers after processing:", headers);
  }

  const rows = values.slice(headerRowIndex + 1);
  console.log("Debug - Final headers:", headers);
  console.log("Debug - Using header row index:", headerRowIndex);
  console.log("Debug - Data rows count:", rows.length);

  return { headers, rows };
}

async function getFirstSheetTitle(sheetId: string): Promise<string> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  const hasSvcCreds = Boolean(
    Deno.env.get("GOOGLE_CLIENT_EMAIL") && Deno.env.get("GOOGLE_PRIVATE_KEY")
  );

  if (hasSvcCreds) {
    const accessToken = await getAccessTokenFromServiceAccount(
      SHEETS_SCOPE_READONLY
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,hidden))`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Sheets API (service account) spreadsheet get error for sheetId='${sheetId}': ${err}`
      );
    }
    const data = await res.json();
    const sheets = (data?.sheets ?? []) as Array<{
      properties?: { title?: string; hidden?: boolean };
    }>;
    const firstVisible = sheets.find((s) => !s?.properties?.hidden);
    const title =
      firstVisible?.properties?.title ?? sheets[0]?.properties?.title;
    if (!title) throw new Error("No sheets found in spreadsheet");
    return title as string;
  } else if (apiKey) {
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`
    );
    url.searchParams.set("fields", "sheets(properties(title,hidden))");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Sheets API (API key) spreadsheet get error for sheetId='${sheetId}': ${err}`
      );
    }
    const data = await res.json();
    const sheets = (data?.sheets ?? []) as Array<{
      properties?: { title?: string; hidden?: boolean };
    }>;
    const firstVisible = sheets.find((s) => !s?.properties?.hidden);
    const title =
      firstVisible?.properties?.title ?? sheets[0]?.properties?.title;
    if (!title) throw new Error("No sheets found in spreadsheet");
    return title as string;
  } else {
    throw new Error(
      "Missing Google credentials: set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY for private sheets, or GOOGLE_API_KEY for public sheets"
    );
  }
}

async function clearAndWriteSheetValues(
  sheetId: string,
  range: string,
  values: string[][]
): Promise<void> {
  const accessToken = await getAccessTokenFromServiceAccount(SHEETS_SCOPE_RW);
  const encodedRange = encodeURIComponent(range);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedRange}`;
  // Clear existing range
  const clearRes = await fetch(`${base}:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!clearRes.ok) {
    const err = await clearRes.text();
    throw new Error(`Failed clearing target range: ${err}`);
  }
  // Write values
  const updateRes = await fetch(`${base}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`Failed updating target range: ${err}`);
  }
}

function mapRowToObject(headers: string[], row: string[]): Record<string, any> {
  const obj: Record<string, any> = {};
  headers.forEach((header, idx) => {
    obj[header || `col_${idx + 1}`] = row[idx] ?? null;
  });
  return obj;
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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    await requireAdmin(req);

    const payload = await req.json();
    const action = (payload?.action as string | undefined) ?? "sync";
    const sheetId = (payload?.sheetId as string | undefined) ?? "";
    const rangeInput = (payload?.range as string | undefined) ?? "";

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole =
      Deno.env.get("SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";
    if (!serviceRole) throw new Error("Missing service role key");
    const supabase = createClient(url, serviceRole);

    if (action === "clear") {
      const { error } = await supabase
        .from("sheet_participants")
        .delete()
        .neq("row_hash", "");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, cleared: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "clear_paid") {
      const { error } = await supabase
        .from("paidparticipants")
        .delete()
        .neq("row_hash", "");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, clearedPaid: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "clear_all") {
      const { error: err1 } = await supabase
        .from("sheet_participants")
        .delete()
        .neq("row_hash", "");
      if (err1) throw err1;
      const { error: err2 } = await supabase
        .from("paidparticipants")
        .delete()
        .neq("row_hash", "");
      if (err2) throw err2;
      return new Response(
        JSON.stringify({
          ok: true,
          clearedParticipants: true,
          clearedPaid: true,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!sheetId) {
      return new Response(JSON.stringify({ error: "sheetId is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!/^[\w-]+$/.test(sheetId)) {
      return new Response(JSON.stringify({ error: "Invalid sheetId" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Determine effective range
    let effectiveRange: string;
    if (!rangeInput || rangeInput.trim().length === 0) {
      const firstTitle = await getFirstSheetTitle(sheetId);
      effectiveRange = firstTitle;
    } else if (!rangeInput.includes("!")) {
      const firstTitle = await getFirstSheetTitle(sheetId);
      effectiveRange = `${firstTitle}!${rangeInput.trim()}`;
    } else {
      effectiveRange = rangeInput.trim();
    }

    // Export paidparticipants to Google Sheets
    if (action === "export_paid") {
      // Load from DB
      const { data, error } = await supabase
        .from("paidparticipants")
        .select("row_number, headers, data")
        .order("row_number", { ascending: true });
      if (error) throw error;
      const list = (data || []) as Array<{
        row_number: number;
        headers: string[];
        data: Record<string, any>;
      }>;
      const headers =
        (list?.[0]?.headers as string[] | undefined) ?? ([] as string[]);
      const headerRow = headers.length > 0 ? headers : [];
      const valueRows: string[][] = list.map((r) =>
        (headers.length > 0 ? headers : Object.keys(r.data || {})).map(
          (h, i) => {
            const key = h || `col_${i + 1}`;
            const val = r.data?.[key];
            return val == null ? "" : String(val);
          }
        )
      );
      const allValues =
        headerRow.length > 0 ? [headerRow, ...valueRows] : valueRows;
      // Determine write target: if rangeInput includes '!' use as-is; else write to first visible sheet starting at A1
      let writeRange = "";
      if (
        !rangeInput ||
        rangeInput.trim().length === 0 ||
        !rangeInput.includes("!")
      ) {
        const firstTitle = await getFirstSheetTitle(sheetId);
        writeRange = `${firstTitle}!A1`;
      } else {
        writeRange = rangeInput.trim();
      }
      await clearAndWriteSheetValues(sheetId, writeRange, allValues);
      return new Response(
        JSON.stringify({
          ok: true,
          rowsExported: allValues.length - (headerRow.length > 0 ? 1 : 0),
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { headers, rows } = await fetchSheetValues(sheetId, effectiveRange);

    type Payload = {
      row_hash: string;
      row_number: number;
      headers: string[];
      data: Record<string, any>;
    };
    // Preserve duplicates within the same sheet by including row_number in the hash
    const upsertPayload: Payload[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const obj = mapRowToObject(headers, row);
      const rowNumber = i + 2; // account for header row
      const rowHash = await sha256Hex(JSON.stringify({ rowNumber, data: obj }));
      upsertPayload.push({
        row_hash: rowHash,
        row_number: rowNumber,
        headers,
        data: obj,
      });
    }

    let rowsUpserted = 0;
    // If replacing, clear tables first (after we've successfully fetched/parsed rows)
    if (action === "replace") {
      const { error: clearParticipantsErr } = await supabase
        .from("sheet_participants")
        .delete()
        .neq("row_hash", "");
      if (clearParticipantsErr) throw clearParticipantsErr;
      // Also clear paid list to reset when switching to a new sheet
      const { error: clearPaidErr } = await supabase
        .from("paidparticipants")
        .delete()
        .neq("row_hash", "");
      if (clearPaidErr) throw clearPaidErr;
    }

    // If sync_replace, only clear sheet_participants but preserve paid participants
    if (action === "sync_replace") {
      const { error: clearParticipantsErr } = await supabase
        .from("sheet_participants")
        .delete()
        .neq("row_hash", "");
      if (clearParticipantsErr) throw clearParticipantsErr;
    }
    if (upsertPayload.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < upsertPayload.length; i += CHUNK_SIZE) {
        const chunk = upsertPayload.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from("sheet_participants")
          .upsert(chunk, { onConflict: "row_hash" });
        if (error) throw error;
        rowsUpserted += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rowsFetched: rows.length,
        rowsUpserted,
        rowsSkipped: 0,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req.headers.get("Origin")),
        },
      }
    );
  }
});
