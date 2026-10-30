import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { todayIST } from "../period";
import { catalog } from "./catalog";
import { dbAi, runReadOnly, SqlRejected, type QueryResult } from "./sql";

const MODEL = "claude-haiku-5-5";
const COMPANY = "DHUMAL_LIVE";

// Stable instructions: identical on every request so the prompt cache can reuse them.
const RULES = `You answer questions from Dhumal Industries' management about their business, using only the company's SAP data
through the run_sql tool. The person asking is the managing director: be brief and exact.

How to work:
- Get every number from run_sql. Never estimate, guess or use outside knowledge for figures.
- Query only the rpt.* views and tables listed in the data catalogue. Always filter company = '${COMPANY}'.
- Aggregate in SQL (sum, group by, order by, limit) instead of fetching many rows. Results are capped at 500 rows.
- If a query fails, read the error, fix the query and try again.
- For totals per day/month (sale, quotation, order, purchase, receipt, payment, production) prefer rpt.kpi_daily;
  it holds exactly the numbers the dashboard shows. Use the detail views for breakdowns.

Business rules (the dashboard uses the same definitions):
- Amounts are in Indian rupees, before GST. Sale = A/R invoices minus A/R credit memos, cancelled documents excluded,
  and inter-company customers excluded (is_intercompany = false).
- Financial year runs 1 April to 31 March (FY 2026-27 = 1 Apr 2026 - 31 Mar 2027). Quarters start Apr, Jul, Oct, Jan.
- "Today" is the date given below (India time). If a question gives no period, use month to date (MTD) and say so.
- "Same period last year" means the same dates one year earlier.
- Receivable/payable aging buckets are estimates (each balance matched to the most recent invoices); balances are exact.
- Bank = GL accounts with codes starting 1210, cash = 1211 (rpt.v_bank_cash). Overdraft accounts are negative.
- Salesperson and customer names may be stored in capitals; match names case-insensitively (ilike) and allow partial matches.

How to answer:
- First line: one plain sentence that answers the question with the key number(s), written the Indian way
  (₹ with lakh / crore, e.g. ₹2.76 Cr, ₹45.2 L, ₹8,450).
- Then, only if useful, up to three short lines: the period used, any assumption you made, a caveat.
- No markdown headings, no tables in the text, no SQL in the text (the app shows the query and a table separately).
- When the user would benefit from seeing rows (a ranking, a list, a breakdown), set show_as_table on that query.
- If the data cannot answer the question, say so plainly and suggest what can be answered. Do not guess.`;

export interface AskTurn { question: string; answer: string }
export interface ExecutedQuery { sql: string; purpose: string; rows: number; ms: number; error?: string }
export interface AskResult {
  answer: string;
  table: { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean } | null;
  queries: ExecutedQuery[];
  ms: number;
  logId: number | null;
}

let client: Anthropic | null = null;

export async function ask(question: string, history: AskTurn[], email: string): Promise<AskResult> {
  const started = Date.now();
  const queries: ExecutedQuery[] = [];
  let table: AskResult["table"] = null;
  let inputTokens = 0, outputTokens = 0;
  let answer = "";
  let error: string | null = null;

  const runSql = betaZodTool({
    name: "run_sql",
    description:
      "Run one read-only PostgreSQL SELECT query against the reporting views (rpt.*) and get the rows back as JSON. " +
      "Use it for every figure in your answer. Results are capped at 500 rows; aggregate in SQL.",
    inputSchema: z.object({
      sql: z.string().describe("A single SELECT (or WITH ... SELECT) statement over rpt.* views, filtered to company = 'DHUMAL_LIVE'."),
      purpose: z.string().describe("What this query finds, in a few words, e.g. 'MTD sale by salesperson'. Shown to the user."),
      show_as_table: z.boolean().describe("True if the user should see this query's rows as a table under the answer."),
    }),
    run: async ({ sql, purpose, show_as_table }) => {
      try {
        const r: QueryResult = await runReadOnly(sql);
        queries.push({ sql, purpose, rows: r.rows.length, ms: r.ms });
        if (show_as_table && r.rows.length > 0) table = { columns: r.columns, rows: r.rows, truncated: r.truncated };
        return JSON.stringify({ columns: r.columns, rows: r.rows, truncated: r.truncated });
      } catch (e) {
        const message = e instanceof SqlRejected ? e.message : e instanceof Error ? e.message : String(e);
        queries.push({ sql, purpose, rows: 0, ms: 0, error: message });
        return JSON.stringify({ error: message });
      }
    },
  });

  try {
    client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const turn of history.slice(-6)) {
      messages.push({ role: "user", content: turn.question }, { role: "assistant", content: turn.answer });
    }
    messages.push({ role: "user", content: question });

    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 8,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: RULES },
        { type: "text", text: `Data catalogue (the only tables you may query):\n\n${await catalog()}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Today is ${todayIST()} (India time).` },
      ],
      tools: [runSql],
      messages,
    });

    let last: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      last = message;
      inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
      outputTokens += message.usage.output_tokens;
    }
    if (!last) throw new Error("No response from the model");
    if (last.stop_reason === "refusal") {
      answer = "I can't answer that question. Try asking about sales, money, stock, purchase or production figures.";
    } else {
      answer = last.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (last.stop_reason === "max_tokens") answer += "\n(The answer was cut short.)";
      if (!answer) answer = "I could not finish working that out. Please rephrase the question.";
    }
  } catch (e) {
    error = e instanceof Anthropic.APIError ? `Claude API error ${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e);
    answer = e instanceof Anthropic.RateLimitError
      ? "The AI service is busy. Please try again in a minute."
      : "Sorry, something went wrong while answering. Please try again.";
  }

  const ms = Date.now() - started;
  let logId: number | null = null;
  try {
    const [row] = await dbAi()<{ id: number }[]>`
      select audit.log_ai_question(${email}, ${question}, ${answer}, ${dbAi().json(JSON.parse(JSON.stringify(queries)))},
                                   ${ms}, ${inputTokens}, ${outputTokens}, ${MODEL}, ${error}) as id`;
    logId = row.id;
  } catch (e) {
    console.error("AI audit log failed", e);
  }
  if (error) console.error("AI box error:", error);
  return { answer, table, queries, ms, logId };
}
