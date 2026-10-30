import "server-only";
import { dbWeb } from "../db";

/** The Settings switch for the Claude API. If it cannot be read, the AI stays off rather than spending unasked. */
export async function aiEnabled(): Promise<boolean> {
  const sql = await dbWeb();
  try {
    const [row] = await sql<{ enabled: boolean }[]>`select app.ai_enabled() as enabled`;
    return row.enabled === true;
  } catch (e) {
    console.error("AI switch could not be read", e);
    return false;
  }
}
