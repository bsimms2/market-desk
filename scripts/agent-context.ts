// Print what the agent needs before writing: open trades, recent ideas, holdings, recent briefings.
//   node scripts/agent-context.ts
import { apiUrl, token } from "./desk-env.ts";

const res = await fetch(apiUrl("context"), { headers: { "x-desk-token": token() } });
console.log(await res.text());
if (!res.ok) process.exitCode = 1;
