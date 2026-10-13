const DEFAULT_URL = "https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api";

export function apiUrl(action: "context" | "publish"): string {
  return (process.env.DESK_API_URL ?? DEFAULT_URL) + "?action=" + action;
}

export function token(): string {
  const t = process.env.DESK_AGENT_TOKEN;
  if (!t) {
    console.error("DESK_AGENT_TOKEN is not set.");
    process.exit(2);
  }
  return t;
}
