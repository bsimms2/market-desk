// Print what the agent needs before writing: open trades, recent ideas, holdings, recent briefings.
//   node scripts/agent-context.ts
import { apiUrl, authHeaders } from "./desk-env.ts";

const res = await fetch(apiUrl("context"), { headers: { ...authHeaders() } });
console.log(await res.text());
if (!res.ok) process.exitCode = 1;
