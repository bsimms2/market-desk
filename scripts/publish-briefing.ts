// Publish a briefing and its ideas through the agent-api edge function.
//   node scripts/publish-briefing.ts path/to/payload.json [--dry-run]
// Env: DESK_AGENT_TOKEN (locally; in the cloud a network secret adds the header), DESK_API_URL (defaults to the MarketDesk project).
// Validates locally first so a bad payload fails fast with readable errors.
import { readFileSync } from "node:fs";
import { validatePayload } from "../packages/desk/src/payload.ts";
import { deskRequest } from "./desk-env.ts";

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file) {
  console.error("usage: node scripts/publish-briefing.ts payload.json [--dry-run]");
  process.exit(2);
}

const payload = JSON.parse(readFileSync(file, "utf8"));
const v = validatePayload(payload);
if (!v.ok) {
  console.error("Payload is invalid:\n- " + v.errors.join("\n- "));
  process.exit(1);
}
if (dryRun) {
  console.log(`OK: ${v.value.briefing.kind} ${v.value.briefing.date}, ${v.value.ideas.length} idea(s). Not sent (--dry-run).`);
  process.exit(0);
}

const res = deskRequest("publish", JSON.stringify(v.value));
console.log(res.text);
if (res.status !== 200) {
  console.error(`publish failed (HTTP ${res.status})`);
  process.exitCode = 1;
}
