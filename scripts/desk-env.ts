import { execFileSync } from "node:child_process";

const DEFAULT_URL = "https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api";

export type DeskAction = "context" | "publish" | "bot_context" | "bot_open" | "bot_order" | "bot_cancel" | "bot_decide" | "bot_close" | "bot_adjust" | "bot_check";

export function apiUrl(action: DeskAction): string {
  return (process.env.DESK_API_URL ?? DEFAULT_URL) + "?action=" + action;
}

/**
 * Call agent-api through curl, not Node's fetch.
 *
 * In the cloud routine environment the token is a "network secret": the egress
 * proxy adds x-desk-token on the way out and the session never sees it. curl
 * goes through that proxy (HTTPS_PROXY); Node's fetch doesn't, so its requests
 * arrived without the header and got 401. Locally, DESK_AGENT_TOKEN from .env
 * is sent instead.
 */
export function deskRequest(action: DeskAction, body?: string): { status: number; text: string } {
  const args = ["-sS", "--max-time", "60", "-w", "\n%{http_code}", "-H", "content-type: application/json"];
  const t = process.env.DESK_AGENT_TOKEN;
  if (t) args.push("-H", `x-desk-token: ${t}`);
  if (body !== undefined) args.push("-X", "POST", "--data-binary", "@-");
  args.push(apiUrl(action));
  let out: string;
  try {
    out = execFileSync("curl", args, { input: body ?? "", encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return { status: 0, text: `curl failed: ${(err.stderr || err.message).trim()}` };
  }
  const cut = out.lastIndexOf("\n");
  return { status: Number(out.slice(cut + 1)) || 0, text: out.slice(0, cut) };
}
