// The paper trading agents' commands. Every call goes through agent-api (curl; see desk-env.ts).
// Add --account aggressive for the aggressive bot (default: steady).
//
//   node scripts/bot.ts context                 account, rules, open positions, ideas to review (JSON)
//   node scripts/bot.ts preview order.json      price an order and check it against the rules; trades nothing
//   node scripts/bot.ts open order.json         place the paper order (fills at the live ask)
//   node scripts/bot.ts order resting.json      resting order: fills when the checker sees the trigger price
//   node scripts/bot.ts cancel <order_id> "why" cancel a resting order
//   node scripts/bot.ts decide decisions.json   record skip/wait verdicts: { "decisions": [...] }
//   node scripts/bot.ts close <position_id> "why"
//   node scripts/bot.ts adjust adjust.json      { position_id, stop?, target?, exit_by?, note }
//   node scripts/bot.ts check                   run the stop/target checker once (it also runs on a schedule)
//
// order.json: { idea_id, ticker, kind: stock|call|put|call_spread|put_spread, spec? (options:
// "NVDA:2026-11-20:220C" or "NVDA:2026-11-20:220/230C"), qty, stop, target (underlying prices),
// exit_by (YYYY-MM-DD), reasoning }. resting.json is an order plus trigger_type (at_or_below |
// at_or_above), trigger_price (underlying), good_until (YYYY-MM-DD, before exit_by) and an
// optional max_price per share. Prints the API's JSON; exit code 1 if it refused.
import { readFileSync } from "node:fs";
import { deskRequest, type DeskAction } from "./desk-env.ts";

const argv = process.argv.slice(2);
const flag = argv.indexOf("--account");
const account = flag >= 0 ? argv.splice(flag, 2)[1] : "steady";
if (account !== "steady" && account !== "aggressive") {
  console.error("--account steady|aggressive");
  process.exit(2);
}
const [cmd, a, b] = argv;
const file = (p: string | undefined) => {
  if (!p) throw new Error(`${cmd} needs a JSON file`);
  return JSON.parse(readFileSync(p, "utf8"));
};

let action: DeskAction;
let body: unknown;
switch (cmd) {
  case "context":
    action = "bot_context";
    break;
  case "preview":
    action = "bot_open";
    body = { ...file(a), preview: true };
    break;
  case "open":
    action = "bot_open";
    body = { ...file(a), preview: false };
    break;
  case "order":
    action = "bot_order";
    body = file(a);
    break;
  case "cancel":
    action = "bot_cancel";
    body = { order_id: a, note: b };
    break;
  case "decide":
    action = "bot_decide";
    body = file(a);
    break;
  case "close":
    action = "bot_close";
    body = { position_id: a, note: b };
    break;
  case "adjust":
    action = "bot_adjust";
    body = file(a);
    break;
  case "check":
    action = "bot_check";
    body = {};
    break;
  default:
    console.error("usage: node scripts/bot.ts context|preview|open|order|cancel|decide|close|adjust|check ...");
    process.exit(2);
}

const res = deskRequest(action, body === undefined ? undefined : JSON.stringify(body), action === "bot_check" ? "" : `&account=${account}`);
console.log(res.text);
if (res.status !== 200) {
  console.error(`${cmd} refused (HTTP ${res.status})`);
  process.exitCode = 1;
}
