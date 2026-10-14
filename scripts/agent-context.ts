// Print what the agent needs before writing: open trades, recent ideas, holdings, recent briefings,
// journal counts. JSON goes to stdout; on failure the error goes to stderr and the exit code is 1.
//   node scripts/agent-context.ts > /tmp/context.json
import { deskRequest } from "./desk-env.ts";

const res = deskRequest("context");
if (res.status === 200) {
  process.stdout.write(res.text + "\n");
} else {
  process.stderr.write(`agent-api context failed (HTTP ${res.status}): ${res.text}\n`);
  process.exitCode = 1;
}
