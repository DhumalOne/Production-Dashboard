import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/ai/ask";
import { isAllowed } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// "Ask anything" (PRD §5). Same sign-in check as the pages: a valid session AND still on the allow list.
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(2).max(500),
  history: z.array(z.object({ question: z.string().max(500), answer: z.string().max(4000) })).max(10).default([]),
});

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email || !isAllowed(email)) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please type a question." }, { status: 400 });

  const result = await ask(parsed.data.question, parsed.data.history, email);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
