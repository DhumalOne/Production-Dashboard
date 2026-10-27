"use client";

import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/format";

// "Ask anything" (PRD §5): pinned above the bottom bar on phones, bottom of the screen on desktop.
// Recent questions are remembered on this device only (localStorage).

interface ExecutedQuery { sql: string; purpose: string; rows: number; ms: number; error?: string }
interface Answer {
  question: string;
  answer: string;
  table: { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean } | null;
  queries: ExecutedQuery[];
  ms: number;
}

const SUGGESTED = [
  "How much did we sell today, and how does it compare with the same day last year?",
  "Top 10 items by sale this quarter",
  "Which customers owe more than ₹5 lakh beyond 90 days?",
  "Which items are below minimum stock and also have pending orders?",
  "What is our total bank balance right now?",
  "Which item had the highest rejection this week?",
];
const RECENT_KEY = "dhumal.ask.recent";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveRecent(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...loadRecent().filter((x) => x !== q)].slice(0, 8)));
  } catch {
    // Private mode or storage blocked: recent questions are a convenience only.
  }
}

const MONEY = /(amount|value|balance|total|sale|purchase|price|cost|receipt|payment|over_90|not_due|advance|^d\d|_plus$|net|gross|margin)/i;
function cell(col: string, v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (MONEY.test(col)) return formatINR(v);
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
  }
  return String(v);
}

export function AskBox() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Answer[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const openBox = () => {
    setRecent(loadRecent());
    setOpen(true);
  };
  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [thread, busy]);

  async function submit(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    openBox();
    setBusy(true);
    setError(null);
    setQuestion("");
    saveRecent(text);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: thread.map((t) => ({ question: t.question, answer: t.answer })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setThread((t) => [...t, { question: text, ...data }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={(e) => { e.preventDefault(); submit(question); }} className="flex gap-2" role="search">
      <label htmlFor="ask" className="sr-only">Ask anything about the business</label>
      <input id="ask" ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} onFocus={() => !open && openBox()}
             placeholder={thread.length ? "Ask a follow-up…" : "Ask anything… e.g. Amol's sales this month"}
             autoComplete="off" enterKeyHint="send" maxLength={500}
             className="h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      <button type="submit" disabled={busy || !question.trim()} aria-label="Ask"
              className="h-12 shrink-0 rounded-full bg-accent px-5 font-medium text-white disabled:opacity-50 dark:text-bg">
        {busy ? "…" : "Ask"}
      </button>
    </form>
  );

  return (
    <>
      {/* Pinned bar: above the bottom navigation on phones, bottom of the content area on desktop. */}
      {!open && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-bg/95 px-3 py-2 backdrop-blur md:bottom-0 md:left-56">
          <div className="mx-auto max-w-3xl">{form}</div>
        </div>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Ask anything" className="fixed inset-0 z-40 flex flex-col bg-bg md:left-56">
          <header className="flex items-center justify-between border-b border-border px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <h2 className="font-semibold">Ask anything</h2>
            <div className="flex gap-1">
              {thread.length > 0 && (
                <button type="button" onClick={() => setThread([])} className="h-11 px-3 text-sm text-muted">New question</button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-accent">Close</button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl space-y-6">
              {thread.length === 0 && !busy && (
                <>
                  <Section title="Try asking">
                    {SUGGESTED.map((s) => <Chip key={s} text={s} onPick={submit} />)}
                  </Section>
                  {recent.length > 0 && (
                    <Section title="Recent on this device">
                      {recent.map((s) => <Chip key={s} text={s} onPick={submit} />)}
                    </Section>
                  )}
                  <p className="text-[13px] text-muted">
                    Answers come only from the synced SAP data, using the same definitions as the dashboard. Your question, the data
                    descriptions and the query results are sent to Claude (Anthropic) to work out the answer.
                  </p>
                </>
              )}

              {thread.map((t, i) => <AnswerCard key={i} item={t} />)}

              {busy && (
                <div className="rounded-xl border border-border bg-surface p-4" role="status">
                  <p className="text-sm text-muted">Looking that up in the SAP data…</p>
                  <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
                </div>
              )}
              {error && <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-border px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-3xl">{form}</div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Chip({ text, onPick }: { text: string; onPick: (q: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(text)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm hover:border-accent/50">
      {text}
    </button>
  );
}

function AnswerCard({ item }: { item: Answer }) {
  const [how, setHow] = useState(false);
  const [headline, ...rest] = item.answer.split("\n").filter((l) => l.trim());
  const ok = item.queries.filter((q) => !q.error);
  return (
    <article className="space-y-3">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-4 py-2 text-sm">{item.question}</p>
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-base font-medium">{headline}</p>
        {rest.length > 0 && <div className="mt-2 space-y-1 text-sm text-muted">{rest.map((l, i) => <p key={i}>{l}</p>)}</div>}

        {item.table && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-[12px] text-muted">
                <tr>{item.table.columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{c.replace(/_/g, " ")}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {item.table.rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {item.table!.columns.map((c) => (
                      <td key={c} className={`whitespace-nowrap px-3 py-1.5 ${typeof r[c] === "number" ? "num text-right" : ""}`}>{cell(c, r[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(item.table.rows.length > 50 || item.table.truncated) && (
              <p className="px-3 py-2 text-[12px] text-muted">Showing the first 50 rows.</p>
            )}
          </div>
        )}

        <button type="button" onClick={() => setHow(!how)} aria-expanded={how} className="mt-3 h-11 text-sm text-accent">
          {how ? "Hide how I got this" : "How I got this"}
        </button>
        {how && (
          <div className="space-y-3 text-[13px]">
            <p className="text-muted">
              {ok.length} quer{ok.length === 1 ? "y" : "ies"} on the reporting views, answered in {(item.ms / 1000).toFixed(1)} s.
            </p>
            {item.queries.map((q, i) => (
              <div key={i}>
                <p className="font-medium">{i + 1}. {q.purpose} {q.error ? <span className="text-bad">(failed, retried)</span> : <span className="text-muted">({q.rows} rows)</span>}</p>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[12px]">{q.sql}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
