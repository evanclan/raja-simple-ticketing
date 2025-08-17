import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

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
        <h2 className="text-lg font-semibold">Checked-in participants</h2>
        <span className="text-sm text-gray-600">Total: {rows.length}</span>
      </div>
      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-gray-600">No check-ins yet.</div>
      ) : (
        <div className="table-scroll overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  メールアドレス
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  代表者氏名
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  参加区分
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  おとな参加人数（中学生以上)
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  こども参加人数（年少～小学生）
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  こども参加人数（年少々以下）
                </th>
                <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                  Actions
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
                      Remove
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
    (async () => {
      try {
        setLoading(true);
        setError("");
        const resp = await fetch(`${supabaseUrl}/functions/v1/entry_pass`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "resolve", token }),
        });
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
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
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
      <header className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="text-base sm:text-xl font-semibold">Entry Pass</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {loading ? (
          <div className="rounded border bg-white p-6">Loading…</div>
        ) : error ? (
          <div className="rounded border border-red-300 bg-red-50 p-6 text-red-800">
            {error}
          </div>
        ) : !participant ? (
          <div className="rounded border bg-white p-6">Not found.</div>
        ) : (
          <div className="rounded border bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your details</h2>
              {checkin?.checked_in_at ? (
                <span className="rounded bg-green-100 px-2 py-1 text-sm text-green-800">
                  Checked-in
                </span>
              ) : (
                <span className="rounded bg-yellow-100 px-2 py-1 text-sm text-yellow-800">
                  Not checked-in
                </span>
              )}
            </div>
            <div className="table-scroll overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      メールアドレス
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectEmail(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      代表者氏名
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectName(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      参加区分
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                      {detectCategory(participant.headers, participant.data)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
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
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
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
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
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
                Present this page at the entrance. An admin will verify your
                details and approve entry.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
                <label className="block">
                  <span className="text-sm text-gray-700">Admin PIN</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter PIN (admin only)"
                  />
                </label>
                <button
                  onClick={handleApprove}
                  disabled={submitting || !pin || !!checkin?.checked_in_at}
                  className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {checkin?.checked_in_at
                    ? "Already approved"
                    : submitting
                    ? "Approving…"
                    : "Approve entry"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
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

  // Participants view state
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<
    Array<{ row_number: number; row_hash: string; data: Record<string, any> }>
  >([]);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Paid participants view state
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
  const [activePage, setActivePage] = useState<"main" | "editMail">("main");
  const [subjectTemplate, setSubjectTemplate] = useState<string>(
    "Payment confirmation"
  );
  const [htmlTemplate, setHtmlTemplate] = useState<string>(
    `<div>
  <p>{{name}}</p>
  <p>お支払いを確認しました。ありがとうございます！</p>
  <p>This is a confirmation that we received your payment. Thank you.</p>
</div>`
  );
  const [textTemplate, setTextTemplate] = useState<string>(
    `{{name}}\nお支払いを確認しました。ありがとうございます！\nThis is a confirmation that we received your payment. Thank you.`
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
  const [adultHeaderKey, setAdultHeaderKey] = useState<string | null>(null);
  const [childHeaderKey, setChildHeaderKey] = useState<string | null>(null);
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
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email ?? null;
      setUserEmail(email);
      setUserToken(data.session?.access_token ?? null);
      setIsAuthLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
        setUserToken(session?.access_token ?? null);
      }
    );

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Load sent confirmations
    const sent = localStorage.getItem("sent_confirmations");
    if (sent) {
      try {
        setSentConfirmations(new Set(JSON.parse(sent)));
      } catch {}
    }
    // Load templates
    const s = localStorage.getItem("email_tpl_subject");
    const h = localStorage.getItem("email_tpl_html");
    const t = localStorage.getItem("email_tpl_text");
    const tr = localStorage.getItem("email_tpl_test_recipient");
    const from = localStorage.getItem("email_tpl_from");
    if (s) setSubjectTemplate(s);
    if (h) setHtmlTemplate(h);
    if (t) setTextTemplate(t);
    if (tr) setTestRecipient(tr);
    if (from) setFromDisplay(from);

    // Load sent entry passes
    const sentPass = localStorage.getItem("sent_entry_passes");
    if (sentPass) {
      try {
        setSentPasses(new Set(JSON.parse(sentPass)));
      } catch {}
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/resend_health`, {
          method: "GET",
          headers: { Authorization: `Bearer ${supabaseAnonKey}` },
        });
        const json = await resp.json().catch(() => ({} as any));
        setResendOk(Boolean(json?.ok));
        setResendError(json?.ok ? null : json?.error || null);
      } catch {
        setResendOk(false);
        setResendError("Request failed");
      }
    })();
  }, [supabaseUrl, supabaseAnonKey]);

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
            action: "sync",
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
    setCategoryHeaderKey(categoryKey);
    setRepNameHeaderKey(repNameKey);
  }, [tableHeaders]);

  // Auto-calc when keys are detected and user is signed in
  useEffect(() => {
    if (userEmail && adultHeaderKey && childHeaderKey) {
      calculateTotalsAcrossAllRows();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, adultHeaderKey, childHeaderKey, categoryHeaderKey]);

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

  function persistTemplates() {
    localStorage.setItem("email_tpl_subject", subjectTemplate);
    localStorage.setItem("email_tpl_html", htmlTemplate);
    localStorage.setItem("email_tpl_text", textTemplate);
    localStorage.setItem("email_tpl_from", fromDisplay);
  }

  function persistSentPasses(next: Set<string>) {
    localStorage.setItem("sent_entry_passes", JSON.stringify(Array.from(next)));
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
      localStorage.setItem("email_tpl_test_recipient", to);
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
      const CATEGORY_KEY = categoryHeaderKey;
      if (!ADULT_KEY || !CHILD_KEY) {
        // We will still try to compute, but most likely counts will remain 0
        // because the keys are unknown
      }

      const CHUNK_SIZE = 1000;
      let from = 0;
      let totalAdult = 0;
      let totalChild = 0;
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
          const categoryVal = CATEGORY_KEY ? d[CATEGORY_KEY] : undefined;
          const a = parseCount(adultVal);
          const c = parseCount(childVal);
          totalAdult += a;
          totalChild += c;
          const isRaja = isRajaFamily(categoryVal);
          totalAmount += computeRowPrice(a, c, isRaja);
        }
        if (batch.length < CHUNK_SIZE) break;
        from += CHUNK_SIZE;
      }
      setAdultCount(totalAdult);
      setChildCount(totalChild);
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
          const catVal = CATEGORY_KEY ? d[CATEGORY_KEY] : undefined;
          const nameVal = NAME_KEY ? d[NAME_KEY] : undefined;
          const total = computeRowPrice(a, c, isRajaFamily(catVal));
          if (a + c <= 0 || total <= 0) continue;
          accum.push({
            rowNumber: row.row_number,
            name: String(nameVal ?? ""),
            adult: a,
            child: c,
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
    setPaidHashes(new Set(mapped.map((r) => r.row_hash)));
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
      const name = findNameForRow(row.data) || "";

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
      setSendingPassHash(row.row_hash);
      const baseUrl = window.location.origin;
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
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-base sm:text-xl font-semibold">
              RaJA Ticketing System
            </h1>
            <p className="text-xs sm:text-sm text-gray-900 opacity-60">
              Created and licensed by RaJA IT department
            </p>
          </div>
          <nav className="flex w-full sm:w-auto items-center gap-2 text-sm justify-start sm:justify-end">
            <button
              onClick={() => (window.location.href = "/")}
              className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Dashboard
            </button>
            <button
              onClick={() => (window.location.href = "/checkins")}
              className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Checked-in
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        {!isCheckinsRoute && (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-medium text-gray-700">
                System status
              </h2>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <li className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-sm text-gray-800">Supabase</span>
              </li>
              <li
                className="flex items-center gap-2"
                title={resendError || undefined}
              >
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    resendOk === null
                      ? "bg-yellow-400 animate-pulse"
                      : resendOk
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }`}
                ></span>
                <span className="text-sm text-gray-800">Resender</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-sm text-gray-800">React + Tailwind</span>
              </li>
            </ul>
          </div>
        )}

        {isAuthLoading ? (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <p className="text-gray-600">Loading…</p>
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
                    className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50"
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
                  <h3 className="font-medium">Edit Auto Mail</h3>
                  <button
                    onClick={() => setActivePage("main")}
                    className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                </div>
                <div className="rounded border p-4 grid gap-3">
                  <div className="text-sm text-gray-700">
                    Use variables with double curly braces, for example:{" "}
                    {"{{name}}"}, {"{{email}}"}, {"{{adult}}"}, {"{{child}}"},{" "}
                    {"{{category}}"}, {"{{total}}"}.
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">From (sender)</span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2"
                      value={fromDisplay}
                      onChange={(e) => setFromDisplay(e.target.value)}
                      placeholder="RaJA <no-reply@info.raja-international.com>"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        Test recipient
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
                        {isSendingTest ? "Sending…" : "Send test email"}
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-700">Subject</span>
                    <input
                      className="mt-1 w-full rounded border px-3 py-2"
                      value={subjectTemplate}
                      onChange={(e) => setSubjectTemplate(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-gray-700">HTML body</span>
                      <textarea
                        ref={htmlRef}
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
                        value={htmlTemplate}
                        onChange={(e) => setHtmlTemplate(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-700">
                        Plain text body
                      </span>
                      <textarea
                        ref={textRef}
                        rows={12}
                        className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
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
                        className="rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Insert {"{{"}
                        {v}
                        {"}}"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        persistTemplates();
                        alert("Saved.");
                      }}
                      className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
                    >
                      Save
                    </button>
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
                      className="rounded border px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      Reset to default
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
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search this page…"
                        className="rounded border px-3 py-1 text-sm"
                      />
                      <button
                        onClick={() => loadParticipants(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="rounded border px-3 py-1 text-sm text-gray-700 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-gray-600">Page {page}</span>
                      <button
                        onClick={() => loadParticipants(page + 1)}
                        disabled={!hasMore}
                        className="rounded border px-3 py-1 text-sm text-gray-700 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                            #
                          </th>
                          {tableHeaders.map((h, idx) => (
                            <th
                              key={`${h || ""}-${idx}`}
                              className="px-3 py-2 text-left text-gray-700 whitespace-nowrap"
                            >
                              {h || "(empty)"}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={2 + tableHeaders.length}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              No data yet
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
                              {tableHeaders.map((h, idx) => (
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
                      <h3 className="font-medium">Paid participants list</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={loadPaidParticipants}
                          className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Refresh
                        </button>
                        <button
                          onClick={handleBulkSendPasses}
                          disabled={true}
                          className="rounded border px-3 py-1 text-sm text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-100 disabled:opacity-50"
                        >
                          {isBulkSendingPasses
                            ? "Sending…"
                            : "Send all entry passes"}
                        </button>
                      </div>
                    </div>
                    <div className="table-scroll overflow-auto border rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                              #
                            </th>
                            {paidHeaders.map((h, idx) => (
                              <th
                                key={`paid-${idx}-${h || ""}`}
                                className="px-3 py-2 text-left text-gray-700 whitespace-nowrap"
                              >
                                {h || "(empty)"}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={2 + paidHeaders.length}
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
                                {paidHeaders.map((h, idx) => (
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
                                      Working…
                                    </button>
                                  ) : pendingUnmarkHash === r.row_hash ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() =>
                                          handleUnmarkPaid(r.row_hash)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() =>
                                          setPendingUnmarkHash(null)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-gray-700 border-gray-300 bg-white hover:bg-gray-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() =>
                                          handleSendConfirmation(r)
                                        }
                                        disabled={
                                          sendingConfirmHash === r.row_hash ||
                                          sentConfirmations.has(r.row_hash)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                                      >
                                        {sentConfirmations.has(r.row_hash)
                                          ? "Confirmation sent"
                                          : sendingConfirmHash === r.row_hash
                                          ? "Sending…"
                                          : "Send confirmation"}
                                      </button>
                                      <button
                                        onClick={() => handleSendEntryPass(r)}
                                        disabled={
                                          sendingPassHash === r.row_hash ||
                                          sentPasses.has(r.row_hash)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-100 disabled:opacity-50"
                                      >
                                        {sentPasses.has(r.row_hash)
                                          ? "Entry pass sent"
                                          : sendingPassHash === r.row_hash
                                          ? "Sending…"
                                          : "Send entry pass"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          setPendingUnmarkHash(r.row_hash)
                                        }
                                        className="rounded px-3 py-1 text-sm border text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                                      >
                                        Unmark paid
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => setActivePage("editMail")}
                        className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Edit auto mail
                      </button>
                    </div>
                    {/* Estimated Expected Calculation */}
                    <div className="mt-6 grid gap-4 rounded border p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">
                          Estimated Expected Calculation
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={calculateTotalsAcrossAllRows}
                            className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                            disabled={calcLoading}
                          >
                            {calcLoading
                              ? "Calculating…"
                              : "Recalculate (all rows)"}
                          </button>
                          <button
                            onClick={async () => {
                              await loadDetailsAcrossAllRows();
                              setIsDetailsOpen(true);
                            }}
                            className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            More details
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            Detected adult header
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {adultHeaderKey || "(not detected)"}
                          </div>
                        </div>
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            Detected child header
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {childHeaderKey || "(not detected)"}
                          </div>
                        </div>
                        <div className="block">
                          <span className="text-sm text-gray-700">
                            Detected category header (参加区分)
                          </span>
                          <div className="mt-1 text-sm text-gray-800">
                            {categoryHeaderKey || "(not detected)"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">
                            All registered adults (count)
                          </div>
                          <div className="text-lg font-semibold">
                            {adultCount}
                          </div>
                        </div>
                        <div className="rounded bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">
                            All registered children (count)
                          </div>
                          <div className="text-lg font-semibold">
                            {childCount}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t pt-3">
                        <div className="text-sm text-gray-600 mr-3">
                          Estimated total (formula)
                        </div>
                        <div className="text-xl font-bold">
                          {estimatedTotal}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                        <div className="rounded bg-green-50 p-3">
                          <div className="text-xs text-gray-500">
                            Paid adults (count)
                          </div>
                          <div className="text-lg font-semibold">
                            {paidAdultCount}
                          </div>
                        </div>
                        <div className="rounded bg-green-50 p-3">
                          <div className="text-xs text-gray-500">
                            Paid children (count)
                          </div>
                          <div className="text-lg font-semibold">
                            {paidChildCount}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t pt-3">
                        <div className="text-sm text-gray-600 mr-3">
                          Paid total (formula)
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
                        Notes: Numbers are parsed from fields like "2名" or
                        "２人" by extracting the first number. Pricing uses the
                        fixed rules: RaJA family base ¥4,000 (covers 2 adults +
                        2 children), extras ¥1,500/adult and ¥1,000/child;
                        Others base ¥4,000 (covers 2 adults + 1 child), extras
                        ¥2,000/adult and ¥1,000/child. Rows with zero attendees
                        are ignored.
                      </p>
                    </div>
                    {/* Details Modal */}
                    {isDetailsOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded bg-white shadow-lg">
                          <div className="flex items-center justify-between border-b px-4 py-3">
                            <h4 className="font-medium">Per-user totals</h4>
                            <button
                              onClick={() => setIsDetailsOpen(false)}
                              className="rounded border px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Close
                            </button>
                          </div>
                          <div className="px-4 py-3">
                            {detailsLoading ? (
                              <div className="text-sm text-gray-600">
                                Loading…
                              </div>
                            ) : details.length === 0 ? (
                              <div className="text-sm text-gray-600">
                                No rows with attendees.
                              </div>
                            ) : (
                              <div className="table-scroll overflow-auto border rounded">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        #
                                      </th>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        代表者氏名
                                      </th>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        おとな参加人数（中学生以上）
                                      </th>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        こども参加人数（年少～小学生）
                                      </th>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        参加区分
                                      </th>
                                      <th className="px-3 py-2 text-left text-gray-700 whitespace-nowrap">
                                        Total (¥)
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
                        <h3 className="font-medium">Entry pass (test send)</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={entryPassTestRecipient}
                          onChange={(e) =>
                            setEntryPassTestRecipient(e.target.value)
                          }
                          placeholder="test@example.com"
                          className="rounded border px-2 py-1 text-sm"
                        />
                        <button
                          onClick={handleSendTestEntryPass}
                          disabled={isSendingTestPass}
                          className="rounded border px-3 py-1 text-sm text-fuchsia-700 border-fuchsia-300 bg-fuchsia-50 hover:bg-fuchsia-100 disabled:opacity-50"
                        >
                          {isSendingTestPass
                            ? "Sending…"
                            : "Send test entry pass"}
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
            <h2 className="text-lg font-semibold mb-4">Admin sign in</h2>
            <form onSubmit={handleSignIn} className="grid gap-3 max-w-sm">
              <label className="block">
                <span className="text-sm text-gray-700">Email</span>
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
                <span className="text-sm text-gray-700">Password</span>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  type="password"
                  placeholder="Your password"
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  required
                />
              </label>
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              <div className="mt-2">
                <button className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                  Sign in
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Tip: Create an admin user in Supabase Auth (Dashboard → Auth →
                Users), then sign in here.
              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
