const DEFAULT_URL = "https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api";

export function apiUrl(action: "context" | "publish"): string {
  return (process.env.DESK_API_URL ?? DEFAULT_URL) + "?action=" + action;
}

/**
 * Auth header for agent-api. Locally, DESK_AGENT_TOKEN comes from .env.
 * In the cloud routine environment the token is a "network secret": the egress
 * proxy adds x-desk-token on the way out and the session never sees it, so we
 * send no header and let the proxy supply it.
 */
export function authHeaders(): Record<string, string> {
  const t = process.env.DESK_AGENT_TOKEN;
  return t ? { "x-desk-token": t } : {};
}
