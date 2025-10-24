import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

// Simple fetch with timeout to avoid indefinite hanging during network issues
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 12000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input, {
      ...(init || {}),
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

function CheckinsView() {
  const supabaseClient = supabase;
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<
    Array<{
      row_hash: string;
      email: string;
      name: string;
      category: string;
      adult: number;
      child: number;
      infant: number;
    }>
  >([]);

  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  function detectEmail(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
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
    return "";
  }
  function detectName(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
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
    return "";
  }
  function detectCategory(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
    const candidates = (headers || []).map((h) => String(h || ""));
    const patterns = [
      "参加区分",
      "区分",
      "参加",
      "カテゴリ",
      "カテゴリー",
      "category",
      "type",
    ];
    for (const key of candidates) {
      const k = String(key || "").toLowerCase();
      if (patterns.some((p) => k.includes(p.toLowerCase()))) {
        const v = data?.[key];
        if (v != null) return String(v);
      }
    }
    return "";
  }
  function detectAdultKey(headers: string[] | null | undefined): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        [
          "おとな",
          "大人",
          "成人",
          "中学生以上",
          "おとな参加人数",
          "adult",
        ].some((p) => h.includes(p))
      )
        return header;
    }
    return null;
  }
  function detectChildKey(headers: string[] | null | undefined): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        [
          "こども",
          "子ども",
          "子供",
          "小学生",
          "年少",
          "こども参加人数",
          "child",
        ].some((p) => h.includes(p))
      )
        return header;
    }
    return null;
  }
  function detectInfantKey(
    headers: string[] | null | undefined
  ): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        ["年少々以下", "未就学", "幼児", "乳幼児", "未就園"].some((p) =>
          h.includes(p)
        )
      )
        return header;
    }
    return null;
  }
  function normalizeDigits(input: string): string {
    if (!input) return "";
    return input.replace(/[\uFF10-\uFF19]/g, (d) =>
      String(d.charCodeAt(0) - 0xff10)
    );
  }
  function parseCount(value: unknown): number {
    if (value == null) return 0;
    const text = normalizeDigits(String(value));
    const match = text.match(/(\d+)/);
    if (!match) return 0;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  async function handleRemove(row_hash: string) {
    if (!confirm("Remove this check-in?")) return;
    const { error: delErr } = await supabaseClient
      .from("checkins")
      .delete()
      .eq("row_hash", row_hash);
    if (delErr) {
      alert(delErr.message || String(delErr));
      return;
    }
    setRows((prev) => prev.filter((r) => r.row_hash !== row_hash));
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const { data: checkins, error: cErr } = await supabaseClient
          .from("checkins")
          .select("row_hash, checked_in_at")
          .order("checked_in_at", { ascending: false });
        if (cErr) throw cErr;
        const list = (checkins || []) as Array<{
          row_hash: string;
          checked_in_at: string;
        }>;
        if (list.length === 0) {
          setRows([]);
          return;
        }
        const hashes = Array.from(new Set(list.map((c) => c.row_hash)));
        const { data: participants, error: pErr } = await supabaseClient
          .from("paidparticipants")
          .select("row_hash, row_number, headers, data")
          .in("row_hash", hashes);
        if (pErr) throw pErr;
        const map = new Map<
          string,
          { row_number: number; headers: string[]; data: Record<string, any> }
        >();
        for (const r of participants || []) {
          map.set((r as any).row_hash as string, {
            row_number: (r as any).row_number as number,
            headers: ((r as any).headers as string[]) || [],
            data: ((r as any).data as Record<string, any>) || {},
          });
        }
        const merged = list.map((c) => {
          const p = map.get(c.row_hash);
          const headers = p?.headers || [];
          const data = p?.data || {};
          const email = detectEmail(headers, data);
          const name = detectName(headers, data);
          const category = detectCategory(headers, data);
          const adultKey = detectAdultKey(headers);
          const childKey = detectChildKey(headers);
          const infantKey = detectInfantKey(headers);
          const adult = parseCount(adultKey ? data[adultKey] : undefined);
          const child = parseCount(childKey ? data[childKey] : undefined);
          const infant = parseCount(infantKey ? data[infantKey] : undefined);
          return {
            row_hash: c.row_hash,
            email,
            name,
            category,
            adult,
            child,
            infant,
          };
        });
        setRows(merged);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabaseClient]);

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">チェックイン済みの参加者</h2>
        <span className="text-sm text-gray-600">Total: {rows.length}</span>
      </div>
      {loading ? (
        <div className="text-gray-600">読み込み中…</div>
      ) : error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-gray-600">No check-ins yet.</div>
      ) : (
        <div className="table-scroll overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-red-50/60 border-b border-red-100">
              <tr>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  メールアドレス
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  代表者氏名
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  参加区分
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  おとな参加人数（中学生以上)
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  こども参加人数（年少～小学生）
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  こども参加人数（年少々以下）
                </th>
                <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row_hash} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.email}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.category}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.adult}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.child}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    {r.infant}
                  </td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                    <button
                      onClick={() => handleRemove(r.row_hash)}
                      className="rounded px-3 py-1 text-sm border text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EntryPassView({ token }: { token: string }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [participant, setParticipant] = useState<{
    row_number: number;
    headers: string[];
    data: Record<string, any>;
  } | null>(null);
  const [checkin, setCheckin] = useState<{
    row_hash: string;
    checked_in_at: string | null;
    checked_in_by?: string | null;
  } | null>(null);
  const [pin, setPin] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Field detectors
  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  function detectEmail(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
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
    return "";
  }
  function detectName(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
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
    return "";
  }
  function detectCategory(
    headers: string[] | null | undefined,
    data: Record<string, any>
  ): string {
    const candidates = (headers || []).map((h) => String(h || ""));
    const patterns = [
      "参加区分",
      "区分",
      "参加",
      "カテゴリ",
      "カテゴリー",
      "category",
      "type",
    ];
    for (const key of candidates) {
      const k = String(key || "").toLowerCase();
      if (patterns.some((p) => k.includes(p.toLowerCase()))) {
        const v = data?.[key];
        if (v != null) return String(v);
      }
    }
    return "";
  }
  function detectAdultKey(headers: string[] | null | undefined): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        [
          "おとな",
          "大人",
          "成人",
          "中学生以上",
          "おとな参加人数",
          "adult",
        ].some((p) => h.includes(p))
      )
        return header;
    }
    return null;
  }
  function detectChildKey(headers: string[] | null | undefined): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        [
          "こども",
          "子ども",
          "子供",
          "小学生",
          "年少",
          "こども参加人数",
          "child",
        ].some((p) => h.includes(p))
      )
        return header;
    }
    return null;
  }
  function detectInfantKey(
    headers: string[] | null | undefined
  ): string | null {
    const list = (headers || []).map((h) => String(h || ""));
    for (const header of list) {
      const h = header.toLowerCase();
      if (
        ["年少々以下", "未就学", "幼児", "乳幼児", "未就園"].some((p) =>
          h.includes(p)
        )
      )
        return header;
    }
    return null;
  }
  function normalizeDigits(input: string): string {
    if (!input) return "";
    return input.replace(/[\uFF10-\uFF19]/g, (d) =>
      String(d.charCodeAt(0) - 0xff10)
    );
  }
  function parseCount(value: unknown): number {
    if (value == null) return 0;
    const text = normalizeDigits(String(value));
    const match = text.match(/(\d+)/);
    if (!match) return 0;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  useEffect(() => {
    if (!supabaseUrl) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    (async () => {
      let retries = 2; // Allow 2 retries for better reliability during high load

      while (retries >= 0) {
        try {
          setLoading(true);
          setError("");
          const resp = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/entry_pass`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
                Authorization: `Bearer ${
                  import.meta.env.VITE_SUPABASE_ANON_KEY as string
                }`,
              },
              body: JSON.stringify({ action: "resolve", token }),
            },
            25000 // Increased timeout to 25 seconds for high-load scenarios
          );
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${txt}`);
          }
          const json = await resp.json();
          const p = json?.participant;
          setParticipant(
            p
              ? {
                  row_number: p.row_number as number,
                  headers: (p.headers as string[]) || [],
                  data: (p.data as Record<string, any>) || {},
                }
              : null
          );
          setCheckin(json?.checkin ?? null);
          // Success - exit retry loop
          return;
        } catch (e: any) {
          retries--;

          if (retries >= 0) {
            // Wait before retrying (exponential backoff)
            const delay = (2 - retries) * 1000; // 1s, 2s
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // All retries exhausted
          if (e?.name === "AbortError") {
            setError(
              "Request timed out. The system may be experiencing high traffic. Please wait a moment and try refreshing the page."
            );
          } else {
            setError(
              e?.message ||
                String(e) +
                  " - If the problem persists, please contact event staff."
            );
          }
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [supabaseUrl, token]);

  async function handleApprove() {
    try {
      setSubmitting(true);
      setError("");
      const resp = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${
            import.meta.env.VITE_SUPABASE_ANON_KEY as string
          }`,
        },
        body: JSON.stringify({ action: "check_in", token, pin }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${resp.status}`);
      }
      // re-fetch status
      const resp2 = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${
            import.meta.env.VITE_SUPABASE_ANON_KEY as string
          }`,
        },
        body: JSON.stringify({ action: "resolve", token }),
      });
      const json2 = await resp2.json();
      setCheckin(
        json2?.checkin ?? {
          row_hash: "",
          checked_in_at: new Date().toISOString(),
        }
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-red-100 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-4">
          <h1 className="text-base sm:text-xl font-semibold text-indigo-700">
            WEB チケット
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {loading ? (
          <div className="rounded border bg-white p-6">読み込み中…</div>
        ) : error ? (
          <div className="rounded border border-red-300 bg-red-50 p-6 text-red-800">
            {error}
          </div>
        ) : !participant ? (
          <div className="rounded border bg-white p-6">
            見つかりませんでした。
          </div>
        ) : (
          <div className="rounded border bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">ご登録内容</h2>
              {checkin?.checked_in_at ? (
                <span className="rounded bg-green-100 px-2 py-1 text-sm text-green-800">
                  チェックイン済み
                </span>
              ) : (
                <span className="rounded bg-yellow-100 px-2 py-1 text-sm text-yellow-800">
                  未チェックイン
                </span>
              )}
            </div>
            <div className="table-scroll overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      メールアドレス
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectEmail(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      代表者氏名
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectName(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      参加区分
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectCategory(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      おとな参加人数（中学生以上)
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {(() => {
                        const key = detectAdultKey(participant.headers);
                        return parseCount(
                          key ? participant.data[key] : undefined
                        );
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      こども参加人数（年少～小学生）
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {(() => {
                        const key = detectChildKey(participant.headers);
                        return parseCount(
                          key ? participant.data[key] : undefined
                        );
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-indigo-700 whitespace-nowrap">
                      こども参加人数（年少々以下）
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {(() => {
                        const key = detectInfantKey(participant.headers);
                        return parseCount(
                          key ? participant.data[key] : undefined
                        );
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm text-gray-700">
                入場時にこの画面を提示してください。管理者が内容を確認し、入場を承認します。
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
                <label className="block">
                  <span className="text-sm text-gray-700">管理者用PIN</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="PINを入力（管理者のみ）"
                  />
                </label>
                <button
                  onClick={handleApprove}
                  disabled={submitting || !pin || !!checkin?.checked_in_at}
                  className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {checkin?.checked_in_at
                    ? "承認済み"
                    : submitting
                    ? "承認中…"
                    : "入場を承認"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {checkin?.checked_in_at && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="text-center space-y-3">
            <div className="inline-block rounded-lg bg-white px-6 py-4 shadow-lg">
              <div className="text-green-600 text-3xl font-extrabold tracking-wide">
                受付完了しました！✅
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Pass page route detection (simple router)
  const passToken = useMemo(() => {
    try {
      const path = window.location.pathname || "";
      const m = path.match(/^\/pass\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }, []);
  const isCheckinsRoute = useMemo(() => {
    try {
      return (window.location.pathname || "") === "/checkins";
    } catch {
      return false;
    }
  }, []);
  // Auth state
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [signinEmail, setSigninEmail] = useState<string>("");
  const [signinPassword, setSigninPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  const [sheetId, setSheetId] = useState<string>(
    "1he2VxMHqmTs_gIdu-vtel77h9ISFAZa2GfK629Rd9IU"
  );
  const [range] = useState<string>("フォームの回答 1!A:Z");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string>("");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const [resendOk, setResendOk] = useState<boolean | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  // Participants view state
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<
    Array<{ row_number: number; row_hash: string; data: Record<string, any> }>
  >([]);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [simpleMode, setSimpleMode] = useState<boolean>(true); // Toggle for hiding columns

  // Paid participants view state
  const [simpleModeForPaid, setSimpleModeForPaid] = useState<boolean>(true); // Toggle for hiding columns in paid table
  const [paidHeaders, setPaidHeaders] = useState<string[]>([]);
  const [paidRows, setPaidRows] = useState<
    Array<{ row_number: number; row_hash: string; data: Record<string, any> }>
  >([]);
  const [paidHashes, setPaidHashes] = useState<Set<string>>(new Set());
  const [pendingUnmarkHash, setPendingUnmarkHash] = useState<string | null>(
    null
  );
  const [processingUnmarkHash, setProcessingUnmarkHash] = useState<
    string | null
  >(null);

  // Email templates + sending state
  const [sendingConfirmHash, setSendingConfirmHash] = useState<string | null>(
    null
  );
  const [sentConfirmations, setSentConfirmations] = useState<Set<string>>(
    new Set()
  );
  const [activePage, setActivePage] = useState<
    "main" | "editMail" | "editEntryPass"
  >("main");
  const [subjectTemplate, setSubjectTemplate] = useState<string>(
    "Payment confirmation"
  );
  const [htmlTemplate, setHtmlTemplate] = useState<string>(
    `<div>
  <p>{{name}} 様</p>
  <p>お支払いを確認しました。ありがとうございます！</p>
  <p>領収書を添付しております。ご確認ください。</p>
  <p>This is a confirmation that we received your payment. Thank you!</p>
  <p>Please find your receipt attached to this email.</p>
</div>`
  );
  const [textTemplate, setTextTemplate] = useState<string>(
    `{{name}} 様\nお支払いを確認しました。ありがとうございます！\n領収書を添付しております。ご確認ください。\n\nThis is a confirmation that we received your payment. Thank you!\nPlease find your receipt attached to this email.`
  );
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [testRecipient, setTestRecipient] = useState<string>(
    "eoalferez@gmail.com"
  );
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [fromDisplay, setFromDisplay] = useState<string>(
    "RaJA <no-reply@info.raja-international.com>"
  );

  // Entry pass email state
  const [sendingPassHash, setSendingPassHash] = useState<string | null>(null);
  const [sentPasses, setSentPasses] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("sent_entry_passes");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Receipt upload state - stores uploaded PDF receipts per participant
  // @ts-ignore - temporarily disabled
  const [uploadingReceiptHash, setUploadingReceiptHash] = useState<
    string | null
  >(null);
  const [uploadedReceipts, setUploadedReceipts] = useState<
    Map<string, { fileName: string; fileData: string }>
  >(() => {
    try {
      const saved = localStorage.getItem("uploaded_receipts");
      if (saved) {
        const obj = JSON.parse(saved);
        return new Map(Object.entries(obj));
      }
    } catch {
      // ignore
    }
    return new Map();
  });

  // Manual check-in state
  const [manualCheckingInHash, setManualCheckingInHash] = useState<
    string | null
  >(null);

  // Dropdown menu state for actions
  const [openDropdownHash, setOpenDropdownHash] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const dropdownButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Entry pass email template state
  const [entryPassSubject, setEntryPassSubject] = useState<string>(() => {
    try {
      return localStorage.getItem("entry_pass_subject") || "Your Entry Pass";
    } catch {
      return "Your Entry Pass";
    }
  });
  const [entryPassHtml, setEntryPassHtml] = useState<string>(() => {
    try {
      return (
        localStorage.getItem("entry_pass_html") ||
        `<div>
  <p>{{name}} 様</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="{{url}}">{{url}}</a></p>
</div>`
      );
    } catch {
      return `<div>
  <p>{{name}} 様</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="{{url}}">{{url}}</a></p>
</div>`;
    }
  });
  const [entryPassText, setEntryPassText] = useState<string>(() => {
    try {
      return (
        localStorage.getItem("entry_pass_text") ||
        `{{name}} 様
イベントの入場用リンクです。当日入口でスタッフにお見せください。
This is your entry pass. Show this link at the entrance.
{{url}}`
      );
    } catch {
      return `{{name}} 様
イベントの入場用リンクです。当日入口でスタッフにお見せください。
This is your entry pass. Show this link at the entrance.
{{url}}`;
    }
  });
  const [entryPassPdf, setEntryPassPdf] = useState<File | null>(null);
  const [entryPassPdfUrl, setEntryPassPdfUrl] = useState<string>(() => {
    try {
      return localStorage.getItem("entry_pass_pdf_url") || "";
    } catch {
      return "";
    }
  });
  const [entryPassPdfBase64, setEntryPassPdfBase64] = useState<string>("");
  const [entryPassPdfName, setEntryPassPdfName] = useState<string>("");
  const [isBulkSendingPasses, setIsBulkSendingPasses] =
    useState<boolean>(false);
  const [entryPassTestRecipient, setEntryPassTestRecipient] = useState<string>(
    "eoalferez@gmail.com"
  );
  const [isSendingTestPass, setIsSendingTestPass] = useState<boolean>(false);

  // Calculation module state
  const [calcLoading, setCalcLoading] = useState<boolean>(false);
  const [adultCount, setAdultCount] = useState<number>(0);
  const [childCount, setChildCount] = useState<number>(0);
  const [infantCount, setInfantCount] = useState<number>(0);
  const [adultHeaderKey, setAdultHeaderKey] = useState<string | null>(null);
  const [childHeaderKey, setChildHeaderKey] = useState<string | null>(null);
  const [infantHeaderKey, setInfantHeaderKey] = useState<string | null>(null);
  const [categoryHeaderKey, setCategoryHeaderKey] = useState<string | null>(
    null
  );
  const [estimatedTotal, setEstimatedTotal] = useState<number>(0);
  const [repNameHeaderKey, setRepNameHeaderKey] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  type DetailRow = {
    rowNumber: number;
    name: string;
    adult: number;
    child: number;
    infant: number;
    category: string;
    total: number;
  };
  const [details, setDetails] = useState<DetailRow[]>([]);

  function extractSheetId(input: string): string {
    if (!input) return "";
    // If a full URL is pasted, extract the ID between /spreadsheets/d/ and the next /
    try {
      const url = new URL(input);
      const parts = url.pathname.split("/");
      const idx = parts.findIndex((p) => p === "d");
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    } catch {
      // Not a URL; fall through and return as-is
    }
    return input.trim();
  }

  useEffect(() => {
    // Initialize auth session
    if (!isSupabaseConfigured) {
      setIsAuthLoading(false);
      return;
    }
    let unsub: { unsubscribe: () => void } | null = null;
    // Fallback: stop loading if something hangs longer than 8s
    const authTimeout = setTimeout(() => setIsAuthLoading(false), 8000);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data.session?.user?.email ?? null;
        setUserEmail(email);
        setUserToken(data.session?.access_token ?? null);
      } finally {
        clearTimeout(authTimeout);
        setIsAuthLoading(false);
      }
    })();

    const sub = supabase.auth.onAuthStateChange(
      async (_event: any, session: any) => {
        setUserEmail(session?.user?.email ?? null);
        setUserToken(session?.access_token ?? null);
      }
    );
    // Align with current supabase-js v2 API
    // sub.data.subscription.unsubscribe() in examples; keep safe access:
    unsub = sub?.data?.subscription ?? (sub as any)?.subscription ?? null;

    return () => {
      try {
        unsub?.unsubscribe?.();
      } catch {}
    };
  }, [isSupabaseConfigured]);

  useEffect(() => {
    // Load sent confirmations
    const sent = localStorage.getItem("sent_confirmations");
    if (sent) {
      try {
        setSentConfirmations(new Set(JSON.parse(sent)));
      } catch {}
    }

    // Load sent entry passes
    const sentPass = localStorage.getItem("sent_entry_passes");
    if (sentPass) {
      try {
        setSentPasses(new Set(JSON.parse(sentPass)));
      } catch {}
    }
  }, []);

  // Load templates from database AFTER authentication is ready
  useEffect(() => {
    if (!userToken) return; // Wait for authentication

    (async () => {
      const s = await loadSetting("email_tpl_subject", "Payment confirmation");
      const h = await loadSetting(
        "email_tpl_html",
        `<div>
  <p>{{name}} 様</p>
  <p>お支払いを確認しました。ありがとうございます！</p>
  <p>領収書を添付しております。ご確認ください。</p>
  <p>This is a confirmation that we received your payment. Thank you!</p>
  <p>Please find your receipt attached to this email.</p>
</div>`
      );
      const t = await loadSetting(
        "email_tpl_text",
        `{{name}} 様\nお支払いを確認しました。ありがとうございます！\n領収書を添付しております。ご確認ください。\n\nThis is a confirmation that we received your payment. Thank you!\nPlease find your receipt attached to this email.`
      );
      const tr = await loadSetting("email_tpl_test_recipient");
      const from = await loadSetting(
        "email_tpl_from",
        "RaJA <no-reply@info.raja-international.com>"
      );

      if (s) setSubjectTemplate(s);
      if (h) setHtmlTemplate(h);
      if (t) setTextTemplate(t);
      if (tr) setTestRecipient(tr);
      if (from) setFromDisplay(from);
    })();
  }, [userToken]); // Load when user is authenticated

  // Auto-save email templates whenever they change (to both localStorage and database)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Save to both localStorage and database for cross-device sync
      saveSetting("email_tpl_subject", subjectTemplate);
      saveSetting("email_tpl_html", htmlTemplate);
      saveSetting("email_tpl_text", textTemplate);
      saveSetting("email_tpl_from", fromDisplay);
    }, 500); // Debounce by 500ms to avoid saving on every keystroke

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectTemplate, htmlTemplate, textTemplate, fromDisplay]);

  // Auto-save entry pass templates whenever they change
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("entry_pass_subject", entryPassSubject);
      localStorage.setItem("entry_pass_html", entryPassHtml);
      localStorage.setItem("entry_pass_text", entryPassText);
      localStorage.setItem("entry_pass_pdf_url", entryPassPdfUrl);
    }, 500); // Debounce by 500ms to avoid saving on every keystroke

    return () => clearTimeout(timer);
  }, [entryPassSubject, entryPassHtml, entryPassText, entryPassPdfUrl]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      try {
        const resp = await fetchWithTimeout(
          `${supabaseUrl}/functions/v1/resend_health`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${supabaseAnonKey}` },
          }
        );
        const json = await resp.json().catch(() => ({} as any));
        setResendOk(Boolean(json?.ok));
        setResendError(json?.ok ? null : json?.error || null);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          setResendOk(false);
          setResendError("Request timed out");
        } else {
          setResendOk(false);
          setResendError("Request failed");
        }
      }
    })();
  }, [supabaseUrl, supabaseAnonKey, isSupabaseConfigured]);

  const isDisabled = useMemo(() => isSyncing, [isSyncing]);

  async function handleSync() {
    if (!userToken) {
      alert("Please sign in first");
      return;
    }
    if (!confirm("Sync from the Google Sheet now?")) return;
    try {
      setIsSyncing(true);
      setResultMessage("");
      const normalizedId = extractSheetId(sheetId);
      setSheetId(normalizedId);
      // Persist (disabled for fixed sheet; keep for compatibility but no-op)

      const resp = await fetch(
        `${supabaseUrl}/functions/v1/sync_participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            action: "sync_replace",
            sheetId: normalizedId,
            range,
          }),
        }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      setResultMessage(
        `OK: rowsFetched=${data?.rowsFetched ?? 0}, upserted=${
          data?.rowsUpserted ?? 0
        }`
      );
      await loadParticipants(1);
      await loadPaidParticipants();
      await calculateTotalsAcrossAllRows();
    } catch (err: any) {
      setResultMessage(`Error: ${err?.message ?? String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function loadParticipants(nextPage: number) {
    const from = (nextPage - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("sheet_participants")
      .select("row_number, row_hash, headers, data")
      .order("row_number", { ascending: true })
      .range(from, to);
    if (error) return; // silent; keep UI stable
    const headersFromFirst =
      (data?.[0]?.headers as string[] | undefined) ?? tableHeaders;

    // Debug log to check what headers we're getting from DB
    console.log("Debug - Headers from DB:", data?.[0]?.headers);
    console.log("Debug - Final headers:", headersFromFirst);
    console.log(
      "Debug - Headers detailed:",
      headersFromFirst.map((h, i) => `${i}: "${h}" (length: ${h?.length || 0})`)
    );

    setTableHeaders(headersFromFirst);
    setRows(
      (data ?? []).map((r: any) => ({
        row_number: r.row_number,
        row_hash: r.row_hash,
        data: r.data as Record<string, any>,
      }))
    );
    setPage(nextPage);
    setHasMore((data ?? []).length === pageSize);
  }

  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter((row) => {
      // match row number
      if (String(row.row_number).toLowerCase().includes(query)) return true;
      // match any displayed cell value, using same header resolution as renderer
      for (let idx = 0; idx < tableHeaders.length; idx++) {
        const header = tableHeaders[idx];
        const key = header || `col_${idx + 1}`;
        const value = row.data?.[key];
        if (value != null && String(value).toLowerCase().includes(query)) {
          return true;
        }
      }
      return false;
    });
  }, [rows, tableHeaders, searchQuery]);

  // Filter headers based on simple mode toggle
  const displayHeaders = useMemo(() => {
    if (!simpleMode) return tableHeaders;

    // Find the indices of the columns to hide
    const startIdx = tableHeaders.findIndex((h) => h === "フリガナ");
    const endIdx = tableHeaders.findIndex((h) => h === "園児（利用者）氏名");

    // If either column is not found, return all headers
    if (startIdx === -1 || endIdx === -1) return tableHeaders;

    // Filter out columns from startIdx to endIdx (inclusive)
    return tableHeaders.filter((_, idx) => idx < startIdx || idx > endIdx);
  }, [tableHeaders, simpleMode]);

  // Filter paid headers based on simple mode toggle
  const displayPaidHeaders = useMemo(() => {
    if (!simpleModeForPaid) return paidHeaders;

    // Find the indices of the columns to hide
    const startIdx = paidHeaders.findIndex((h) => h === "フリガナ");
    const endIdx = paidHeaders.findIndex((h) => h === "園児（利用者）氏名");

    // If either column is not found, return all headers
    if (startIdx === -1 || endIdx === -1) return paidHeaders;

    // Filter out columns from startIdx to endIdx (inclusive)
    return paidHeaders.filter((_, idx) => idx < startIdx || idx > endIdx);
  }, [paidHeaders, simpleModeForPaid]);

  // Attempt to auto-detect adult/child header keys from current headers
  useEffect(() => {
    if (!tableHeaders || tableHeaders.length === 0) return;
    const detectKey = (patterns: string[]): string | null => {
      const lowerHeaders = tableHeaders.map((h) => String(h || ""));
      for (const header of lowerHeaders) {
        const h = header.toLowerCase();
        if (patterns.some((p) => h.includes(p))) return header;
      }
      return null;
    };
    // Adult related patterns
    const adultKey =
      detectKey([
        "おとな",
        "大人",
        "成人",
        "中学生以上",
        "おとな参加人数",
        "adult",
      ]) || null;
    // Child related patterns
    const childKey =
      detectKey([
        "こども",
        "子ども",
        "子供",
        "小学生",
        "年少",
        "こども参加人数",
        "child",
      ]) || null;
    // Infant related patterns (年少々以下)
    const infantKey =
      detectKey([
        "年少々以下",
        "未就学",
        "幼児",
        "乳幼児",
        "未就園",
        "赤ちゃん",
        "baby",
        "infant",
      ]) || null;
    // Category related patterns (参加区分)
    const categoryKey =
      detectKey([
        "参加区分",
        "区分",
        "参加",
        "カテゴリ",
        "カテゴリー",
        "category",
        "type",
      ]) || null;
    // Representative name patterns
    const repNameKey =
      detectKey([
        "代表者氏名",
        "代表者",
        "氏名",
        "お名前",
        "名前",
        "name",
        "申込者",
      ]) || null;
    setAdultHeaderKey(adultKey);
    setChildHeaderKey(childKey);
    setInfantHeaderKey(infantKey);
    setCategoryHeaderKey(categoryKey);
    setRepNameHeaderKey(repNameKey);
  }, [tableHeaders]);

  // Auto-calc when keys are detected and user is signed in
  useEffect(() => {
    if (userEmail && adultHeaderKey && childHeaderKey) {
      calculateTotalsAcrossAllRows();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userEmail,
    adultHeaderKey,
    childHeaderKey,
    infantHeaderKey,
    categoryHeaderKey,
  ]);

  function normalizeDigits(input: string): string {
    if (!input) return "";
    // Convert full-width digits to ASCII digits
    return input.replace(/[\uFF10-\uFF19]/g, (d) =>
      String(d.charCodeAt(0) - 0xff10)
    );
  }

  function parseCount(value: unknown): number {
    if (value == null) return 0;
    const text = normalizeDigits(String(value));
    const match = text.match(/(\d+)/);
    if (!match) return 0;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  // ------ Email utilities ------
  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  function findEmailForRow(rowData: Record<string, any>): string | null {
    const candidates =
      paidHeaders && paidHeaders.length > 0 ? paidHeaders : tableHeaders;
    const lower = candidates.map((h) => String(h || "").toLowerCase());
    const patterns = ["email", "e-mail", "mail", "メール", "メールアドレス"];
    for (let i = 0; i < candidates.length; i++) {
      const h = lower[i];
      if (patterns.some((p) => h.includes(p))) {
        const key = candidates[i];
        const val = rowData?.[key];
        if (typeof val === "string" && EMAIL_REGEX.test(val)) return val.trim();
      }
    }
    for (const v of Object.values(rowData || {})) {
      if (typeof v === "string" && EMAIL_REGEX.test(v)) return v.trim();
    }
    return null;
  }

  function findNameForRow(rowData: Record<string, any>): string | undefined {
    if (repNameHeaderKey && rowData?.[repNameHeaderKey]) {
      return String(rowData[repNameHeaderKey]);
    }
    const candidates =
      paidHeaders && paidHeaders.length > 0 ? paidHeaders : tableHeaders;
    const patterns = ["代表者氏名", "代表者", "氏名", "お名前", "名前", "name"];
    for (const key of candidates) {
      const k = String(key || "").toLowerCase();
      if (patterns.some((p) => k.includes(p.toLowerCase()))) {
        const v = rowData?.[key];
        if (v) return String(v);
      }
    }
    return undefined;
  }

  function renderTemplate(template: string, vars: Record<string, any>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
      const v = vars[key];
      return v == null ? "" : String(v);
    });
  }

  function persistSentConfirmations(next: Set<string>) {
    localStorage.setItem(
      "sent_confirmations",
      JSON.stringify(Array.from(next))
    );
  }

  // Helper function to load a setting from database with localStorage fallback
  async function loadSetting(
    key: string,
    fallbackValue?: string
  ): Promise<string | null> {
    try {
      if (!supabase) return localStorage.getItem(key) || fallbackValue || null;

      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      if (error) {
        console.warn(`Failed to load setting ${key} from database:`, error);
        return localStorage.getItem(key) || fallbackValue || null;
      }

      return data?.value || localStorage.getItem(key) || fallbackValue || null;
    } catch (e) {
      console.warn(`Error loading setting ${key}:`, e);
      return localStorage.getItem(key) || fallbackValue || null;
    }
  }

  // Helper function to save a setting to both database and localStorage
  async function saveSetting(key: string, value: string): Promise<void> {
    try {
      // Always save to localStorage for backwards compatibility
      localStorage.setItem(key, value);

      if (!supabase || !userToken) return;

      // Save to database for cross-device sync
      const { error } = await supabase
        .from("settings")
        .upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );

      if (error) {
        console.warn(`Failed to save setting ${key} to database:`, error);
      }
    } catch (e) {
      console.warn(`Error saving setting ${key}:`, e);
    }
  }

  function persistTemplates() {
    localStorage.setItem("email_tpl_subject", subjectTemplate);
    localStorage.setItem("email_tpl_html", htmlTemplate);
    localStorage.setItem("email_tpl_text", textTemplate);
    localStorage.setItem("email_tpl_from", fromDisplay);
  }

  function persistEntryPassTemplates() {
    localStorage.setItem("entry_pass_subject", entryPassSubject);
    localStorage.setItem("entry_pass_html", entryPassHtml);
    localStorage.setItem("entry_pass_text", entryPassText);
    localStorage.setItem("entry_pass_pdf_url", entryPassPdfUrl);
  }

  function persistSentPasses(next: Set<string>) {
    localStorage.setItem("sent_entry_passes", JSON.stringify(Array.from(next)));
  }

  function persistUploadedReceipts(
    receipts: Map<string, { fileName: string; fileData: string }>
  ) {
    try {
      const obj = Object.fromEntries(receipts);
      localStorage.setItem("uploaded_receipts", JSON.stringify(obj));
    } catch (e) {
      console.error("Failed to persist uploaded receipts", e);
    }
  }

  async function handleSendTestEmail() {
    try {
      if (!userToken) {
        alert("Please sign in first");
        return;
      }
      const to = (testRecipient || "").trim();
      if (!to) {
        alert("Enter a test recipient email");
        return;
      }
      saveSetting("email_tpl_test_recipient", to);
      setIsSendingTest(true);

      const vars = {
        name: "Test User",
        email: to,
        adult: 2,
        child: 0,
        category: "RaJA",
        total: 4000,
        row_number: 0,
      } as Record<string, any>;
      const subject = renderTemplate(subjectTemplate, vars);
      const html = renderTemplate(htmlTemplate, vars);
      const text = renderTemplate(textTemplate, vars);

      const resp = await fetch(
        `${supabaseUrl}/functions/v1/send_payment_confirmation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            to,
            name: vars.name,
            subject,
            html,
            text,
            from: fromDisplay,
          }),
        }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      setResultMessage(`Test email sent to ${to}`);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setIsSendingTest(false);
    }
  }

  // Derive paid participants counts using the same detection and parsing logic
  const { paidAdultCount, paidChildCount } = useMemo(() => {
    if (!paidRows || paidRows.length === 0) {
      return { paidAdultCount: 0, paidChildCount: 0 };
    }
    const detectFromPaid = (patterns: string[]): string | null => {
      const list = (paidHeaders || []).map((h) => String(h || ""));
      for (const header of list) {
        const h = header.toLowerCase();
        if (patterns.some((p) => h.includes(p))) return header;
      }
      return null;
    };
    const resolvedAdultKey =
      adultHeaderKey ||
      detectFromPaid([
        "おとな",
        "大人",
        "成人",
        "中学生以上",
        "おとな参加人数",
        "adult",
      ]);
    const resolvedChildKey =
      childHeaderKey ||
      detectFromPaid([
        "こども",
        "子ども",
        "子供",
        "小学生",
        "年少",
        "こども参加人数",
        "child",
      ]);
    let a = 0;
    let c = 0;
    for (const r of paidRows) {
      const d = r.data || {};
      const av = resolvedAdultKey ? d[resolvedAdultKey] : undefined;
      const cv = resolvedChildKey ? d[resolvedChildKey] : undefined;
      a += parseCount(av);
      c += parseCount(cv);
    }
    return { paidAdultCount: a, paidChildCount: c };
  }, [paidRows, paidHeaders, adultHeaderKey, childHeaderKey]);

  function isRajaFamily(categoryValue: unknown): boolean {
    if (categoryValue == null) return false;
    const text = String(categoryValue).trim();
    // Exact provided label
    if (text.includes("RaJA在籍者（生徒・保護者・講師とその家族）"))
      return true;
    // Fallback heuristics
    const lower = text.toLowerCase();
    return (
      lower.includes("raja") ||
      text.includes("在籍者") ||
      text.includes("生徒") ||
      text.includes("保護者") ||
      text.includes("講師")
    );
  }

  function computeRowPrice(
    adultNum: number,
    childNum: number,
    isRaja: boolean
  ): number {
    const BASE_PRICE = 4000;
    const INCLUDED_ADULTS = 2;
    const INCLUDED_CHILDREN = isRaja ? 2 : 1;
    const EXTRA_ADULT_PRICE = isRaja ? 1500 : 2000;
    const EXTRA_CHILD_PRICE = 1000; // 年少以上 only; assumed provided child count is 年少以上

    const totalPeople = adultNum + childNum;
    if (totalPeople <= 0) return 0; // no attendees, no charge

    // Special case per request: RaJA family adult-only pricing (no children)
    // In this case, charge 1,500 yen per adult without applying the base fee
    if (isRaja && childNum === 0) {
      return adultNum * 1500;
    }

    const extraAdults = Math.max(0, adultNum - INCLUDED_ADULTS);
    const extraChildren = Math.max(0, childNum - INCLUDED_CHILDREN);
    return (
      BASE_PRICE +
      extraAdults * EXTRA_ADULT_PRICE +
      extraChildren * EXTRA_CHILD_PRICE
    );
  }

  async function calculateTotalsAcrossAllRows(): Promise<void> {
    setCalcLoading(true);
    try {
      const ADULT_KEY = adultHeaderKey;
      const CHILD_KEY = childHeaderKey;
      const INFANT_KEY = infantHeaderKey;
      const CATEGORY_KEY = categoryHeaderKey;
      if (!ADULT_KEY || !CHILD_KEY) {
        // We will still try to compute, but most likely counts will remain 0
        // because the keys are unknown
      }

      const CHUNK_SIZE = 1000;
      let from = 0;
      let totalAdult = 0;
      let totalChild = 0;
      let totalInfant = 0;
      let totalAmount = 0;
      // Fetch in chunks until fewer than CHUNK_SIZE rows are returned
      // We only need headers and data for counting
      // Using range() paging

      while (true) {
        const { data, error } = await supabase
          .from("sheet_participants")
          .select("data")
          .order("row_number", { ascending: true })
          .range(from, from + CHUNK_SIZE - 1);
        if (error) break;
        const batch = (data ?? []) as Array<{ data: Record<string, any> }>;
        if (batch.length === 0) break;
        for (const row of batch) {
          const d = row.data || {};
          const adultVal = ADULT_KEY ? d[ADULT_KEY] : undefined;
          const childVal = CHILD_KEY ? d[CHILD_KEY] : undefined;
          const infantVal = INFANT_KEY ? d[INFANT_KEY] : undefined;
          const categoryVal = CATEGORY_KEY ? d[CATEGORY_KEY] : undefined;
          const a = parseCount(adultVal);
          const c = parseCount(childVal);
          const i = parseCount(infantVal);
          totalAdult += a;
          totalChild += c;
          totalInfant += i;
          const isRaja = isRajaFamily(categoryVal);
          totalAmount += computeRowPrice(a, c, isRaja);
        }
        if (batch.length < CHUNK_SIZE) break;
        from += CHUNK_SIZE;
      }
      setAdultCount(totalAdult);
      setChildCount(totalChild);
      setInfantCount(totalInfant);
      setEstimatedTotal(totalAmount);
    } finally {
      setCalcLoading(false);
    }
  }

  async function loadDetailsAcrossAllRows(): Promise<void> {
    setDetailsLoading(true);
    try {
      const ADULT_KEY = adultHeaderKey;
      const CHILD_KEY = childHeaderKey;
      const INFANT_KEY = infantHeaderKey;
      const CATEGORY_KEY = categoryHeaderKey;
      const NAME_KEY = repNameHeaderKey;

      const CHUNK_SIZE = 1000;
      let from = 0;
      const accum: DetailRow[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("sheet_participants")
          .select("row_number, data")
          .order("row_number", { ascending: true })
          .range(from, from + CHUNK_SIZE - 1);
        if (error) break;
        const batch = (data ?? []) as Array<{
          row_number: number;
          data: Record<string, any>;
        }>;
        if (batch.length === 0) break;
        for (const row of batch) {
          const d = row.data || {};
          const a = parseCount(ADULT_KEY ? d[ADULT_KEY] : undefined);
          const c = parseCount(CHILD_KEY ? d[CHILD_KEY] : undefined);
          const i = parseCount(INFANT_KEY ? d[INFANT_KEY] : undefined);
          const catVal = CATEGORY_KEY ? d[CATEGORY_KEY] : undefined;
          const nameVal = NAME_KEY ? d[NAME_KEY] : undefined;
          const total = computeRowPrice(a, c, isRajaFamily(catVal));
          if (a + c + i <= 0 || total <= 0) continue;
          accum.push({
            rowNumber: row.row_number,
            name: String(nameVal ?? ""),
            adult: a,
            child: c,
            infant: i,
            category: String(catVal ?? ""),
            total,
          });
        }
        if (batch.length < CHUNK_SIZE) break;
        from += CHUNK_SIZE;
      }
      setDetails(accum);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function loadPaidParticipants() {
    const { data, error } = await supabase
      .from("paidparticipants")
      .select("row_number, row_hash, headers, data")
      .order("row_number", { ascending: true });
    if (error) return; // silent
    const headersFromFirst =
      (data?.[0]?.headers as string[] | undefined) ?? paidHeaders;
    setPaidHeaders(headersFromFirst);
    const mapped = (data ?? []).map((r: any) => ({
      row_number: r.row_number as number,
      row_hash: r.row_hash as string,
      data: r.data as Record<string, any>,
    }));
    setPaidRows(mapped);
    setPaidHashes(new Set(mapped.map((r: any) => r.row_hash)));
  }

  useEffect(() => {
    if (userEmail) {
      loadParticipants(1);
      loadPaidParticipants();
    } else {
      setRows([]);
      setTableHeaders([]);
      setPage(1);
      setHasMore(false);
      setPaidHeaders([]);
      setPaidRows([]);
      setPaidHashes(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  async function handleMarkPaid(row: {
    row_number: number;
    row_hash: string;
    data: Record<string, any>;
  }) {
    try {
      // Upsert into paidparticipants; do not modify source table
      const { error } = await supabase.from("paidparticipants").upsert(
        [
          {
            row_hash: row.row_hash,
            row_number: row.row_number,
            headers: tableHeaders,
            data: row.data,
          },
        ],
        { onConflict: "row_hash" }
      );
      if (error) throw error;
      await loadPaidParticipants();
    } catch (e: any) {
      console.error(e);
      const message =
        e?.message || e?.error_description || e?.hint || String(e);
      alert(
        `Failed to mark as paid. ${message}\n\nEnsure table 'paidparticipants' exists with columns: row_hash text primary key, row_number int, headers jsonb, data jsonb (and RLS policies for authenticated users).`
      );
    }
  }

  async function handleUnmarkPaid(rowHash: string) {
    try {
      setProcessingUnmarkHash(rowHash);
      const { error } = await supabase
        .from("paidparticipants")
        .delete()
        .eq("row_hash", rowHash);
      if (error) throw error;
      await loadPaidParticipants();
    } catch (e: any) {
      console.error(e);
      const message =
        e?.message || e?.error_description || e?.hint || String(e);
      alert(`Failed to unmark as paid. ${message}`);
    } finally {
      setProcessingUnmarkHash(null);
      setPendingUnmarkHash(null);
    }
  }

  async function handleSendConfirmation(row: {
    row_number: number;
    row_hash: string;
    data: Record<string, any>;
  }) {
    try {
      if (!userToken) {
        alert("Please sign in first");
        return;
      }
      const email = findEmailForRow(row.data);
      if (!email) {
        alert("No email found in this row.");
        return;
      }

      // Check if receipt is uploaded (DISABLED - allow sending without receipt)
      const receipt = uploadedReceipts.get(row.row_hash);
      // if (!receipt) {
      //   alert(
      //     "領収書必要です\n\nReceipt is required!\n\nPlease upload the receipt PDF first before sending confirmation email."
      //   );
      //   return;
      // }

      const name = findNameForRow(row.data) || "";

      // Check if already sent
      const alreadySent = sentConfirmations.has(row.row_hash);
      const confirmMessage = alreadySent
        ? `このユーザーには既に確認メールを送信済みです。\n再送信しますか？\n\nThis user has already received a confirmation email.\nResend confirmation email to:\n${name} (${email})${
            receipt ? `\n\nReceipt: ${receipt.fileName}` : ""
          }`
        : `確認メールを送信しますか？\n\nSend confirmation email to:\n${name} (${email})${
            receipt ? `\n\nReceipt: ${receipt.fileName}` : ""
          }`;

      if (!confirm(confirmMessage)) {
        return;
      }

      setSendingConfirmHash(row.row_hash);

      // derive values for variables
      const resolvedAdultKey = adultHeaderKey;
      const resolvedChildKey = childHeaderKey;
      const resolvedCategoryKey = categoryHeaderKey;
      const a = parseCount(
        resolvedAdultKey ? row.data?.[resolvedAdultKey] : undefined
      );
      const c = parseCount(
        resolvedChildKey ? row.data?.[resolvedChildKey] : undefined
      );
      const cat = resolvedCategoryKey
        ? row.data?.[resolvedCategoryKey]
        : undefined;
      const total = computeRowPrice(a, c, isRajaFamily(cat));

      const vars = {
        name,
        email,
        adult: a,
        child: c,
        category: cat ?? "",
        total,
        row_number: row.row_number,
      } as Record<string, any>;

      const subject = renderTemplate(subjectTemplate, vars);
      const html = renderTemplate(htmlTemplate, vars);
      const text = renderTemplate(textTemplate, vars);

      const resp = await fetch(
        `${supabaseUrl}/functions/v1/send_payment_confirmation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            to: email,
            name,
            subject,
            html,
            text,
            from: fromDisplay,
            // Attach the uploaded receipt PDF (optional - only if available)
            pdfBase64: receipt?.fileData,
            pdfName: receipt?.fileName,
          }),
        }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      setResultMessage(`Confirmation sent to ${email}`);
      setSentConfirmations((prev) => {
        const next = new Set(prev);
        next.add(row.row_hash);
        persistSentConfirmations(next);
        return next;
      });
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setSendingConfirmHash(null);
    }
  }

  async function handleSendEntryPass(row: {
    row_number: number;
    row_hash: string;
    data: Record<string, any>;
  }) {
    try {
      if (!userToken) {
        alert("Please sign in first");
        return;
      }
      // Check if already sent
      const email = findEmailForRow(row.data);
      const name = findNameForRow(row.data) || "";
      const alreadySent = sentPasses.has(row.row_hash);

      if (alreadySent) {
        if (
          !confirm(
            `このユーザーには既にWEB チケットを送信済みです。\n再送信しますか？\n\nThis user has already received a web ticket.\nResend web ticket to:\n${name} (${email})?`
          )
        ) {
          return;
        }
      }

      setSendingPassHash(row.row_hash);
      const baseUrl = window.location.origin;

      // Templates will be processed on the backend with the actual participant data

      const resp = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          action: "send_email",
          row_hash: row.row_hash,
          baseUrl,
          from: fromDisplay,
          subject: entryPassSubject,
          html: entryPassHtml,
          text: entryPassText,
          pdfUrl: entryPassPdfUrl || undefined,
          pdfBase64: entryPassPdfBase64 || undefined,
          pdfName: entryPassPdfName || undefined,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      setResultMessage(`Entry pass sent. Link: ${data?.url ?? "(hidden)"}`);
      setSentPasses((prev) => {
        const next = new Set(prev);
        next.add(row.row_hash);
        persistSentPasses(next);
        return next;
      });
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setSendingPassHash(null);
    }
  }

  // @ts-ignore - temporarily disabled
  function handleUploadReceipt(row: {
    row_number: number;
    row_hash: string;
    data: Record<string, any>;
  }) {
    // Create a hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";

    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) return;

      // Check if it's a PDF
      if (file.type !== "application/pdf") {
        alert(
          "PDFファイルのみアップロードできます。\nOnly PDF files are allowed."
        );
        return;
      }

      const name = findNameForRow(row.data) || "";
      const email = findEmailForRow(row.data) || "";

      if (
        !confirm(
          `領収書をアップロードしますか？\n\nUpload receipt for:\n${name} (${email})\n\nFile: ${file.name}`
        )
      ) {
        return;
      }

      try {
        setUploadingReceiptHash(row.row_hash);

        // Convert file to base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;

          // Store in state (this will be used when sending confirmation email)
          setUploadedReceipts((prev) => {
            const next = new Map(prev);
            next.set(row.row_hash, {
              fileName: file.name,
              fileData: base64Data,
            });
            persistUploadedReceipts(next);
            return next;
          });

          alert(
            `✓ 領収書がアップロードされました！\n✓ Receipt uploaded successfully!\n\nFile: ${file.name}\n\nYou can now send the confirmation email with this receipt attached.`
          );
        };

        reader.onerror = () => {
          throw new Error("Failed to read file");
        };

        reader.readAsDataURL(file);
      } catch (e: any) {
        alert(e?.message || String(e));
      } finally {
        setUploadingReceiptHash(null);
      }
    };

    input.click();
  }

  async function handleManualCheckIn(row: {
    row_number: number;
    row_hash: string;
    data: Record<string, any>;
  }) {
    try {
      if (!userToken) {
        alert("Please sign in first");
        return;
      }

      const email = findEmailForRow(row.data);
      const name = findNameForRow(row.data) || "";

      // Check if already checked in
      const { data: existingCheckin, error: checkError } = await supabase
        .from("checkins")
        .select("checked_in_at")
        .eq("row_hash", row.row_hash)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError;
      }

      if (existingCheckin) {
        const checkedInTime = new Date(
          existingCheckin.checked_in_at
        ).toLocaleString();
        if (
          !confirm(
            `⚠️ 警告 / WARNING ⚠️\n\nこの参加者は既にチェックイン済みです。\nThis participant is already checked in.\n\nChecked in at: ${checkedInTime}\n\n再度チェックインしますか？\nCheck in again?`
          )
        ) {
          return;
        }
      } else {
        if (
          !confirm(
            `⚠️ 手動チェックインの確認 / CONFIRMATION ⚠️\n\nこの操作でこの参加者をチェックインします。\nThis will check in the following participant:\n\n${name}\n${email}\n\n実行しますか？\nProceed with manual check-in?`
          )
        ) {
          return;
        }
      }

      setManualCheckingInHash(row.row_hash);

      // Insert or update check-in record
      const { error: insertError } = await supabase.from("checkins").upsert(
        {
          row_hash: row.row_hash,
          checked_in_at: new Date().toISOString(),
          checked_in_by: userEmail || "manual",
        },
        { onConflict: "row_hash" }
      );

      if (insertError) throw insertError;

      alert(
        `✓ チェックイン完了！\n✓ Check-in successful!\n\n${name} (${email})`
      );
      setResultMessage(`Manually checked in: ${name}`);
    } catch (e: any) {
      console.error(e);
      const message =
        e?.message || e?.error_description || e?.hint || String(e);
      alert(`Failed to check in. ${message}`);
    } finally {
      setManualCheckingInHash(null);
    }
  }

  async function handleBulkSendPasses() {
    if (!confirm("Send entry pass email to all paid participants?")) return;
    try {
      if (!userToken) {
        alert("Please sign in first");
        return;
      }
      setIsBulkSendingPasses(true);
      const baseUrl = window.location.origin;
      const resp = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          action: "bulk_send",
          baseUrl,
          from: fromDisplay,
          subject: entryPassSubject,
          html: entryPassHtml,
          text: entryPassText,
          pdfUrl: entryPassPdfUrl || undefined,
          pdfBase64: entryPassPdfBase64 || undefined,
          pdfName: entryPassPdfName || undefined,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      const okList = (data?.results || [])
        .filter((r: any) => r.sent)
        .map((r: any) => r.row_hash);
      setSentPasses((prev) => {
        const next = new Set(prev);
        for (const h of okList) next.add(h);
        persistSentPasses(next);
        return next;
      });
      setResultMessage(`Entry passes sent: ${okList.length}`);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setIsBulkSendingPasses(false);
    }
  }

  async function handleSendTestEntryPass() {
    try {
      if (!paidRows || paidRows.length === 0) {
        alert("No paid participants to base the test pass on.");
        return;
      }
      if (!userToken) {
        alert("Please sign in first");
        return;
      }
      const testTo = (entryPassTestRecipient || "").trim();
      if (!testTo) {
        alert("Enter a test recipient email");
        return;
      }
      setIsSendingTestPass(true);
      const baseUrl = window.location.origin;
      const row = paidRows[0];
      const resp = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          action: "send_email",
          row_hash: row.row_hash,
          baseUrl,
          from: fromDisplay,
          to: testTo,
          subject: entryPassSubject,
          html: entryPassHtml,
          text: entryPassText,
          pdfUrl: entryPassPdfUrl || undefined,
          pdfBase64: entryPassPdfBase64 || undefined,
          pdfName: entryPassPdfName || undefined,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      setResultMessage(
        `Test entry pass sent to ${testTo}. Link: ${data?.url ?? "(hidden)"}`
      );
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setIsSendingTestPass(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signinEmail.trim(),
        password: signinPassword,
      });
      if (error) {
        setAuthError(error.message);
      }
    } catch (err: any) {
      setAuthError(err?.message ?? "Sign in failed");
    }
  }

  async function handleSignOut() {
    setAuthError("");
    await supabase.auth.signOut();
  }

  if (passToken) {
    return <EntryPassView token={passToken} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-red-100 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-base sm:text-xl font-semibold text-indigo-700">
              <a href="/">RaJA Ticketing System</a>
            </h1>
            <p className="text-xs sm:text-sm text-gray-900 opacity-60">
              Created and licensed by RaJA IT department
            </p>
          </div>
          {userEmail && (
            <nav className="flex w-full sm:w-auto items-center gap-2 text-sm justify-start sm:justify-end">
              <button
                onClick={() => (window.location.href = "/")}
                className="rounded border px-3 py-1 text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Dashboard
              </button>
              <button
                onClick={() => (window.location.href = "/checkins")}
                className="rounded border px-3 py-1 text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Checked-in
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        {!isSupabaseConfigured && (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <p className="text-red-700">
              Supabase is not configured. Set VITE_SUPABASE_URL and
              VITE_SUPABASE_ANON_KEY.
            </p>
          </div>
        )}
        {!isCheckinsRoute && userEmail && (
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2">
              <h2 className="text-xs font-medium text-gray-700">
                システム状況
              </h2>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              <li className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs text-gray-800">Supabase</span>
              </li>
              <li
                className="flex items-center gap-2"
                title={resendError || undefined}
              >
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${
                    resendOk === null
                      ? "bg-yellow-400 animate-pulse"
                      : resendOk
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }`}
                ></span>
                <span className="text-xs text-gray-800">Resend サービス</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs text-gray-800">UI</span>
              </li>
            </ul>
          </div>
        )}

        {isAuthLoading ? (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <p className="text-gray-600">読み込み中…</p>
          </div>
        ) : userEmail ? (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            {!isCheckinsRoute && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Sync participants from Google Sheets
                </h2>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600">
                    Signed in as {userEmail}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="rounded border px-3 py-1 text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
            {isCheckinsRoute ? (
              <CheckinsView />
            ) : activePage === "editMail" ? (
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">自動メール編集</h3>
                  <button
                    onClick={() => setActivePage("main")}
                    className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    戻る
                  </button>
                </div>
                <div className="rounded border p-4 grid gap-3">
                  <div className="text-sm text-gray-700">
                    変数は二重かっこで挿入できます（例）： {"{{name}}"}、{" "}
                    {"{{email}}"}、 {"{{adult}}"}、 {"{{child}}"}、{" "}
                    {"{{category}}"}、 {"{{total}}"}
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">
                      送信者（From）
                    </span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                      value={fromDisplay}
                      onChange={(e) => setFromDisplay(e.target.value)}
                      placeholder="RaJA <no-reply@info.raja-international.com>"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        テスト送信先
                      </span>
                      <input
                        className="mt-1 w-full rounded border px-3 py-2"
                        type="email"
                        value={testRecipient}
                        onChange={(e) => setTestRecipient(e.target.value)}
                        placeholder="test@example.com"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={handleSendTestEmail}
                        disabled={isSendingTest}
                        className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isSendingTest ? "送信中…" : "テストメールを送信"}
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">件名</span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                      value={subjectTemplate}
                      onChange={(e) => setSubjectTemplate(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">HTML本文</span>
                      <textarea
                        ref={htmlRef}
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                        value={htmlTemplate}
                        onChange={(e) => setHtmlTemplate(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        プレーンテキスト本文
                      </span>
                      <textarea
                        ref={textRef}
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                        value={textTemplate}
                        onChange={(e) => setTextTemplate(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {[
                      "name",
                      "email",
                      "adult",
                      "child",
                      "category",
                      "total",
                      "row_number",
                    ].map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          const token = `{{${v}}}`;
                          if (htmlRef.current) {
                            setHtmlTemplate((prev) => prev + token);
                          }
                          if (textRef.current) {
                            setTextTemplate((prev) => prev + token);
                          }
                        }}
                        className="rounded border px-2 py-1 text-xs text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        差し込み {"{{"}
                        {v}
                        {"}}"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 italic">
                      ✓ 自動保存有効 (Auto-save enabled)
                    </span>
                    <button
                      onClick={() => {
                        setSubjectTemplate("Payment confirmation");
                        setHtmlTemplate(
                          `<div>\n  <p>{{name}}</p>\n  <p>お支払いを確認しました。ありがとうございます！</p>\n  <p>This is a confirmation that we received your payment. Thank you.</p>\n</div>`
                        );
                        setTextTemplate(
                          `{{name}}\\nお支払いを確認しました。ありがとうございます！\\nThis is a confirmation that we received your payment. Thank you.`
                        );
                        setTimeout(() => persistTemplates(), 0);
                      }}
                      className="rounded border px-4 py-2 text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      既定にリセット
                    </button>
                  </div>
                </div>
              </div>
            ) : activePage === "editEntryPass" ? (
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    WEB チケット メール編集 (Web Ticket Email Editor)
                  </h3>
                  <button
                    onClick={() => setActivePage("main")}
                    className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    戻る
                  </button>
                </div>
                <div className="rounded border p-4 grid gap-3">
                  <div className="text-sm text-gray-700">
                    変数は二重かっこで挿入できます（例）： {"{{name}}"}、{" "}
                    {"{{email}}"}、 {"{{url}}"}
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">
                      送信者（From）
                    </span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                      value={fromDisplay}
                      onChange={(e) => setFromDisplay(e.target.value)}
                      placeholder="RaJA <no-reply@info.raja-international.com>"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        テスト送信先
                      </span>
                      <input
                        className="mt-1 w-full rounded border px-3 py-2"
                        type="email"
                        value={entryPassTestRecipient}
                        onChange={(e) =>
                          setEntryPassTestRecipient(e.target.value)
                        }
                        placeholder="test@example.com"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={handleSendTestEntryPass}
                        disabled={isSendingTestPass}
                        className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isSendingTestPass ? "送信中…" : "テストWEB チケット送信"}
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">件名</span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                      value={entryPassSubject}
                      onChange={(e) => setEntryPassSubject(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-gray-700">
                      PDF添付 (Event Day Instructions)
                    </span>
                    <div className="mt-1 space-y-2">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && file.type === "application/pdf") {
                            setEntryPassPdf(file);
                            setEntryPassPdfName(file.name);

                            // Convert PDF to base64 for sending to backend
                            try {
                              const arrayBuffer = await file.arrayBuffer();
                              const base64 = btoa(
                                String.fromCharCode(
                                  ...new Uint8Array(arrayBuffer)
                                )
                              );
                              setEntryPassPdfBase64(base64);

                              // Clear URL since we're using base64 now
                              setEntryPassPdfUrl("");
                            } catch (error) {
                              console.error(
                                "Error converting PDF to base64:",
                                error
                              );
                              alert(
                                "PDFファイルの処理中にエラーが発生しました"
                              );
                            }
                          } else {
                            alert("PDFファイルを選択してください");
                          }
                        }}
                        className="w-full rounded border px-3 py-2"
                      />
                      {entryPassPdf && (
                        <div className="text-sm text-green-600">
                          選択済み: {entryPassPdf.name}
                        </div>
                      )}
                      <input
                        type="url"
                        placeholder="または PDF の URL を入力"
                        value={entryPassPdfUrl}
                        onChange={(e) => setEntryPassPdfUrl(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                      />
                    </div>
                  </label>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">HTML本文</span>
                      <textarea
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                        value={entryPassHtml}
                        onChange={(e) => setEntryPassHtml(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        プレーンテキスト本文
                      </span>
                      <textarea
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                        value={entryPassText}
                        onChange={(e) => setEntryPassText(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {["name", "email", "url"].map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          const token = `{{${v}}}`;
                          setEntryPassHtml((prev) => prev + token);
                          setEntryPassText((prev) => prev + token);
                        }}
                        className="rounded border px-2 py-1 text-xs text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        差し込み {"{{"}
                        {v}
                        {"}}"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 italic">
                      ✓ 自動保存有効 (Auto-save enabled)
                    </span>
                    <button
                      onClick={() => {
                        setEntryPassSubject("Your Entry Pass");
                        setEntryPassHtml(`<div>
  <p>{{name}} 様</p>
  <p>イベントの入場用リンクです。こちらのリンクを当日入口でスタッフにお見せください。</p>
  <p>This is your entry pass. Show this link at the entrance on event day.</p>
  <p><a href="{{url}}">{{url}}</a></p>
</div>`);
                        setEntryPassText(`{{name}} 様
イベントの入場用リンクです。当日入口でスタッフにお見せください。
This is your entry pass. Show this link at the entrance.
{{url}}`);
                        setTimeout(() => persistEntryPassTemplates(), 0);
                      }}
                      className="rounded border px-4 py-2 text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      既定にリセット
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleSync}
                    disabled={isDisabled}
                    className={`rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50`}
                  >
                    {isSyncing ? "Syncing…" : "Sync now"}
                  </button>
                  {resultMessage && (
                    <span className="text-sm text-gray-700" role="status">
                      {resultMessage}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  This calls a Supabase Edge Function named{" "}
                  <code>sync_participants</code> which reads your Google Sheet
                  and upserts rows into the <code>sheet_participants</code>{" "}
                  table.
                </p>
                <div className="mt-6">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-medium">Latest imported rows</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSimpleMode(!simpleMode)}
                        className={`rounded border px-3 py-1 text-sm whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                          simpleMode
                            ? "text-white bg-indigo-600 border-indigo-600 hover:bg-indigo-700"
                            : "text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50"
                        }`}
                      >
                        簡単モード
                      </button>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="このページを検索…"
                        className="rounded border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                      />
                      <button
                        onClick={() => loadParticipants(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        前へ
                      </button>
                      <span className="text-sm text-gray-600">Page {page}</span>
                      <button
                        onClick={() => loadParticipants(page + 1)}
                        disabled={!hasMore}
                        className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        次へ
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-red-50/60 border-b border-red-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                            #
                          </th>
                          {displayHeaders.map((h, idx) => (
                            <th
                              key={`${h || ""}-${idx}`}
                              className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap"
                            >
                              {h || "(empty)"}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={2 + displayHeaders.length}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              データがありません
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((r) => (
                            <tr
                              key={r.row_hash || r.row_number}
                              className="odd:bg-white even:bg-gray-50"
                            >
                              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                {r.row_number}
                              </td>
                              {displayHeaders.map((h, idx) => (
                                <td
                                  key={`${r.row_number}-${idx}`}
                                  className="px-3 py-2 text-gray-800 whitespace-nowrap"
                                >
                                  {String(
                                    r.data?.[h || `col_${idx + 1}`] ?? ""
                                  )}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                <button
                                  onClick={() => handleMarkPaid(r)}
                                  disabled={paidHashes.has(r.row_hash)}
                                  className={`rounded px-3 py-1 text-sm border ${
                                    paidHashes.has(r.row_hash)
                                      ? "text-green-700 border-green-300 bg-green-50 cursor-default"
                                      : "text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100"
                                  }`}
                                >
                                  {paidHashes.has(r.row_hash)
                                    ? "Paid"
                                    : "Mark paid"}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Paid participants list */}
                  <div className="mt-10">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium">支払い済み参加者一覧</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setSimpleModeForPaid(!simpleModeForPaid)
                          }
                          className={`rounded border px-3 py-1 text-sm whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                            simpleModeForPaid
                              ? "text-white bg-indigo-600 border-indigo-600 hover:bg-indigo-700"
                              : "text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50"
                          }`}
                        >
                          簡単モード
                        </button>
                        <button
                          onClick={loadPaidParticipants}
                          className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          更新
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                "すべての領収書データを削除しますか？\n\nClear all uploaded receipt PDFs?\n\nThis will remove all stored receipt files from browser storage."
                              )
                            ) {
                              setUploadedReceipts(new Map());
                              localStorage.removeItem("uploaded_receipts");
                              alert(
                                "✓ すべての領収書を削除しました\n✓ All receipts cleared"
                              );
                            }
                          }}
                          className="rounded border px-3 py-1 text-sm text-red-700 border-red-300 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                        >
                          領収書を全削除
                        </button>
                        <button
                          onClick={handleBulkSendPasses}
                          disabled={true}
                          className="rounded border px-3 py-1 text-sm text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-100 disabled:opacity-50"
                        >
                          {isBulkSendingPasses
                            ? "送信中…"
                            : "WEB チケットを一括送信"}
                        </button>
                      </div>
                    </div>
                    <div className="table-scroll overflow-auto border rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-red-50/60 border-b border-red-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                              #
                            </th>
                            {displayPaidHeaders.map((h, idx) => (
                              <th
                                key={`paid-${idx}-${h || ""}`}
                                className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap"
                              >
                                {h || "(empty)"}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={2 + displayPaidHeaders.length}
                                className="px-3 py-4 text-center text-gray-500"
                              >
                                No paid participants yet
                              </td>
                            </tr>
                          ) : (
                            paidRows.map((r) => (
                              <tr
                                key={`paid-${r.row_hash}`}
                                className="odd:bg-white even:bg-gray-50"
                              >
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {r.row_number}
                                </td>
                                {displayPaidHeaders.map((h, idx) => (
                                  <td
                                    key={`paid-${r.row_number}-${idx}`}
                                    className="px-3 py-2 text-gray-800 whitespace-nowrap"
                                  >
                                    {String(
                                      r.data?.[h || `col_${idx + 1}`] ?? ""
                                    )}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                  {processingUnmarkHash === r.row_hash ? (
                                    <button
                                      disabled
                                      className="rounded px-3 py-1 text-sm border text-gray-500 border-gray-300 bg-gray-100 cursor-wait"
                                    >
                                      処理中…
                                    </button>
                                  ) : pendingUnmarkHash === r.row_hash ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() =>
                                          handleUnmarkPaid(r.row_hash)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                                      >
                                        確認
                                      </button>
                                      <button
                                        onClick={() =>
                                          setPendingUnmarkHash(null)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-gray-700 border-gray-300 bg-white hover:bg-gray-50"
                                      >
                                        キャンセル
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative">
                                      <button
                                        ref={(el) => {
                                          if (el) {
                                            dropdownButtonRefs.current.set(
                                              r.row_hash,
                                              el
                                            );
                                          }
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const isOpening =
                                            openDropdownHash !== r.row_hash;
                                          if (isOpening) {
                                            const button =
                                              dropdownButtonRefs.current.get(
                                                r.row_hash
                                              );
                                            if (button) {
                                              const rect =
                                                button.getBoundingClientRect();
                                              setDropdownPosition({
                                                top: rect.bottom + 8,
                                                right:
                                                  window.innerWidth -
                                                  rect.right,
                                              });
                                            }
                                          }
                                          setOpenDropdownHash(
                                            isOpening ? r.row_hash : null
                                          );
                                        }}
                                        className="rounded px-4 py-2 text-sm border text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex items-center gap-2"
                                      >
                                        <span>操作</span>
                                        <svg
                                          className={`w-4 h-4 transition-transform ${
                                            openDropdownHash === r.row_hash
                                              ? "rotate-180"
                                              : ""
                                          }`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 9l-7 7-7-7"
                                          />
                                        </svg>
                                      </button>

                                      {openDropdownHash === r.row_hash &&
                                        dropdownPosition && (
                                          <>
                                            {/* Backdrop to close dropdown when clicking outside */}
                                            <div
                                              className="fixed inset-0 z-10"
                                              onClick={() => {
                                                setOpenDropdownHash(null);
                                                setDropdownPosition(null);
                                              }}
                                            />
                                            <div
                                              className="fixed w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 max-h-96 overflow-y-auto"
                                              style={{
                                                top: `${dropdownPosition.top}px`,
                                                right: `${dropdownPosition.right}px`,
                                              }}
                                            >
                                              <div className="py-1">
                                                {/* Send Confirmation Email */}
                                                <button
                                                  onClick={() => {
                                                    setOpenDropdownHash(null);
                                                    setDropdownPosition(null);
                                                    handleSendConfirmation(r);
                                                  }}
                                                  disabled={
                                                    sendingConfirmHash ===
                                                    r.row_hash
                                                  }
                                                  className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                    />
                                                  </svg>
                                                  <span>
                                                    {sentConfirmations.has(
                                                      r.row_hash
                                                    )
                                                      ? "✓ 確認メール送信済み"
                                                      : sendingConfirmHash ===
                                                        r.row_hash
                                                      ? "送信中…"
                                                      : "確認メールを送信"}
                                                  </span>
                                                </button>

                                                {/* Send Entry Pass */}
                                                <button
                                                  onClick={() => {
                                                    setOpenDropdownHash(null);
                                                    setDropdownPosition(null);
                                                    handleSendEntryPass(r);
                                                  }}
                                                  disabled={
                                                    sendingPassHash ===
                                                    r.row_hash
                                                  }
                                                  className="w-full text-left px-4 py-2 text-sm text-purple-700 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                                                    />
                                                  </svg>
                                                  <span>
                                                    {sentPasses.has(r.row_hash)
                                                      ? "✓ WEB チケット送信済み"
                                                      : sendingPassHash ===
                                                        r.row_hash
                                                      ? "送信中…"
                                                      : "WEB チケットを送信"}
                                                  </span>
                                                </button>

                                                {/* Upload Receipt - TEMPORARILY DISABLED */}
                                                {/* <button
                                                  onClick={() => {
                                                    setOpenDropdownHash(null);
                                                    setDropdownPosition(null);
                                                    handleUploadReceipt(r);
                                                  }}
                                                  disabled={
                                                    uploadingReceiptHash ===
                                                    r.row_hash
                                                  }
                                                  className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                                    />
                                                  </svg>
                                                  <span className="truncate">
                                                    {uploadedReceipts.has(
                                                      r.row_hash
                                                    )
                                                      ? `✓ ${
                                                          uploadedReceipts.get(
                                                            r.row_hash
                                                          )?.fileName ||
                                                          "領収書"
                                                        }`
                                                      : uploadingReceiptHash ===
                                                        r.row_hash
                                                      ? "アップロード中…"
                                                      : "領収書をアップロード"}
                                                  </span>
                                                </button> */}

                                                {/* Manual Check-in */}
                                                <button
                                                  onClick={() => {
                                                    setOpenDropdownHash(null);
                                                    setDropdownPosition(null);
                                                    handleManualCheckIn(r);
                                                  }}
                                                  disabled={
                                                    manualCheckingInHash ===
                                                    r.row_hash
                                                  }
                                                  className="w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                                    />
                                                  </svg>
                                                  <span>
                                                    {manualCheckingInHash ===
                                                    r.row_hash
                                                      ? "チェックイン中…"
                                                      : "手動チェックイン"}
                                                  </span>
                                                </button>

                                                {/* Divider */}
                                                <div className="border-t border-gray-200 my-1" />

                                                {/* Unmark as Paid */}
                                                <button
                                                  onClick={() => {
                                                    setOpenDropdownHash(null);
                                                    setDropdownPosition(null);
                                                    setPendingUnmarkHash(
                                                      r.row_hash
                                                    );
                                                  }}
                                                  className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M6 18L18 6M6 6l12 12"
                                                    />
                                                  </svg>
                                                  <span>支払い済みを解除</span>
                                                </button>
                                              </div>
                                            </div>
                                          </>
                                        )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setActivePage("editMail")}
                        className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        自動メール編集
                      </button>
                      <button
                        onClick={() => setActivePage("editEntryPass")}
                        className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        WEB チケット メール編集
                      </button>
                    </div>
                    {/* Estimated Expected Calculation */}
                    <div className="mt-6 grid gap-4 rounded border p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">予測見込計算（参考）</h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={calculateTotalsAcrossAllRows}
                            className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            disabled={calcLoading}
                          >
                            {calcLoading ? "計算中…" : "再計算（全行）"}
                          </button>
                          <button
                            onClick={async () => {
                              await loadDetailsAcrossAllRows();
                              setIsDetailsOpen(true);
                            }}
                            className="rounded border px-3 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          >
                            詳細を見る
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            検出された大人人数の項目名
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {adultHeaderKey || "(not detected)"}
                          </div>
                        </div>
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            検出されたこども人数の項目名
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {childHeaderKey || "(not detected)"}
                          </div>
                        </div>
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            検出された赤ちゃんの数の項目名
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {infantHeaderKey || "(not detected)"}
                          </div>
                        </div>
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            検出された参加区分の項目名
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {categoryHeaderKey || "(not detected)"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">
                            登録済み大人人数（合計）
                          </div>
                          <div className="text-lg font-semibold">
                            {adultCount}
                          </div>
                        </div>
                        <div className="rounded bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">
                            登録済みこども人数（合計）
                          </div>
                          <div className="text-lg font-semibold">
                            {childCount}
                          </div>
                        </div>
                        <div className="rounded bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">
                            登録済み赤ちゃんの数（合計）
                          </div>
                          <div className="text-lg font-semibold">
                            {infantCount}
                          </div>
                        </div>
                        <div className="rounded bg-blue-50 p-3">
                          <div className="text-xs text-gray-500">
                            登録済み総人数（合計）
                          </div>
                          <div className="text-lg font-semibold text-blue-700">
                            {adultCount + childCount + infantCount}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t pt-3">
                        <div className="text-sm text-gray-600 mr-3">
                          見込合計（計算式）
                        </div>
                        <div className="text-xl font-bold">
                          {estimatedTotal}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                        <div className="rounded bg-green-50 p-3">
                          <div className="text-xs text-gray-500">
                            支払い済み大人人数（合計）
                          </div>
                          <div className="text-lg font-semibold">
                            {paidAdultCount}
                          </div>
                        </div>
                        <div className="rounded bg-green-50 p-3">
                          <div className="text-xs text-gray-500">
                            支払い済みこども人数（合計）
                          </div>
                          <div className="text-lg font-semibold">
                            {paidChildCount}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t pt-3">
                        <div className="text-sm text-gray-600 mr-3">
                          支払い合計（計算式）
                        </div>
                        <div className="text-xl font-bold">
                          {/** computed below via useMemo */}
                          {(() => {
                            const list = paidRows;
                            if (!list || list.length === 0) return 0;
                            const detectFromPaid = (
                              patterns: string[]
                            ): string | null => {
                              const listHeaders = (paidHeaders || []).map((h) =>
                                String(h || "")
                              );
                              for (const header of listHeaders) {
                                const h = header.toLowerCase();
                                if (patterns.some((p) => h.includes(p)))
                                  return header;
                              }
                              return null;
                            };
                            const resolvedAdultKey =
                              adultHeaderKey ||
                              detectFromPaid([
                                "おとな",
                                "大人",
                                "成人",
                                "中学生以上",
                                "おとな参加人数",
                                "adult",
                              ]);
                            const resolvedChildKey =
                              childHeaderKey ||
                              detectFromPaid([
                                "こども",
                                "子ども",
                                "子供",
                                "小学生",
                                "年少",
                                "こども参加人数",
                                "child",
                              ]);
                            const resolvedCategoryKey =
                              categoryHeaderKey ||
                              detectFromPaid([
                                "参加区分",
                                "区分",
                                "参加",
                                "カテゴリ",
                                "カテゴリー",
                                "category",
                                "type",
                              ]);
                            let sum = 0;
                            for (const r of list) {
                              const d = r.data || {};
                              const a = parseCount(
                                resolvedAdultKey
                                  ? d[resolvedAdultKey as string]
                                  : undefined
                              );
                              const c = parseCount(
                                resolvedChildKey
                                  ? d[resolvedChildKey as string]
                                  : undefined
                              );
                              const cat = resolvedCategoryKey
                                ? d[resolvedCategoryKey as string]
                                : undefined;
                              sum += computeRowPrice(a, c, isRajaFamily(cat));
                            }
                            return sum;
                          })()}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        備考：数値は「2名」「２人」などの文字列から最初の数値を抽出して計算します。料金は固定ルールを使用します：RaJA在籍者は基本4,000円（大人2名＋こども2名まで含む）、超過は大人1,500円/人・こども1,000円/人。その他は基本4,000円（大人2名＋こども1名まで含む）、超過は大人2,000円/人・こども1,000円/人。人数0の行は集計対象外です。
                      </p>
                    </div>
                    {/* Details Modal */}
                    {isDetailsOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded bg-white shadow-lg">
                          <div className="flex items-center justify-between border-b px-4 py-3">
                            <h4 className="font-medium">ユーザー別合計</h4>
                            <button
                              onClick={() => setIsDetailsOpen(false)}
                              className="rounded border px-2 py-1 text-sm text-indigo-700 border-indigo-300 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                              閉じる
                            </button>
                          </div>
                          <div className="px-4 py-3">
                            {detailsLoading ? (
                              <div className="text-sm text-gray-600">
                                読み込み中…
                              </div>
                            ) : details.length === 0 ? (
                              <div className="text-sm text-gray-600">
                                出席者のいる行がありません。
                              </div>
                            ) : (
                              <div className="table-scroll overflow-auto border rounded">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-red-50/60 border-b border-red-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        #
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        代表者氏名
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        おとな参加人数（中学生以上）
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        こども参加人数（年少～小学生）
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        赤ちゃんの数（年少々以下）
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        参加区分
                                      </th>
                                      <th className="px-3 py-2 text-left text-indigo-700 whitespace-nowrap">
                                        合計（¥）
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.map((d) => (
                                      <tr
                                        key={`detail-${d.rowNumber}`}
                                        className="odd:bg-white even:bg-gray-50"
                                      >
                                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                          {d.rowNumber}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.name}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.adult}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.child}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.infant}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.category}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                                          {d.total}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Moved: Entry pass test sender (to bottom to avoid confusion with bulk send) */}
                    <div className="mt-10">
                      <div className="mb-2">
                        <h3 className="font-medium">WEB チケット（テスト送信）</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={entryPassTestRecipient}
                          onChange={(e) =>
                            setEntryPassTestRecipient(e.target.value)
                          }
                          placeholder="test@example.com（テスト用）"
                          className="rounded border px-2 py-1 text-sm"
                        />
                        <button
                          onClick={handleSendTestEntryPass}
                          disabled={isSendingTestPass}
                          className="rounded border px-3 py-1 text-sm text-fuchsia-700 border-fuchsia-300 bg-fuchsia-50 hover:bg-fuchsia-100 disabled:opacity-50"
                        >
                          {isSendingTestPass
                            ? "送信中…"
                            : "テストWEB チケットを送信"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">管理者サインイン</h2>
            <form onSubmit={handleSignIn} className="grid gap-3 max-w-sm">
              <label className="block">
                <span className="text-sm text-gray-700">メールアドレス</span>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  type="email"
                  placeholder="you@example.com"
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-700">パスワード</span>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  type="password"
                  placeholder="パスワード"
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  required
                />
              </label>
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              <div className="mt-2">
                <button className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                  サインイン
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                メモ：Supabase Auth
                で管理者ユーザーを作成してからサインインしてください。
              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
