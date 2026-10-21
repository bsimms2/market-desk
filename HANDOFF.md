# Market Desk: session handoff

Read this first. It's written for a fresh session with no memory of earlier ones.

## What this is

A private website where a scheduled research agent posts market briefings and trade ideas.
Brendan places **paper** trades by hand and logs them in the journal. Nothing here places
orders or connects to a brokerage. The original spec is `PROJECT_SPEC.md` (copied from his Downloads).

The stack copies HomeThread (`C:\Dev\EmbroideryApp`) on purpose, so both are maintained the same way:
Expo SDK 57 web + React Navigation, a pnpm workspace with a hoisted linker, Supabase with
magic-link sign-in and `allowed_users` row-level security, and GitHub Pages via `tools/deploy_web.sh`.

| What | Where |
|---|---|
| Pure logic + tests | `packages/desk` (`@desk/core`): types, returns/stats, portfolio math, publish-payload validator |
| App | `apps/web` (`@desk/web`): Today, Journal, Portfolio, Settings |
| Database | Supabase project **MarketDesk**, ref `lomsjeahhiyforjnwbtu`; schema in `supabase/migrations` |
| Agent API | `supabase/functions/agent-api`: GET `?action=context`, POST `?action=publish` |
| Agent scripts | `scripts/agent-context.ts`, `scripts/publish-briefing.ts` (Node 24 runs .ts directly) |
| Agent prompts | `agent/prompts/*.md` (phase 2) |
| Site | https://bsimms2.github.io/market-desk/ |

## Running it

```
pnpm install
pnpm test          # @desk/core tests
pnpm typecheck
cd apps/web && npx expo start --web     # http://localhost:8081 (allowed as a magic-link redirect)
bash tools/deploy_web.sh                # build + push to gh-pages
bash tools/deploy_function.sh           # deploy agent-api + push secrets from .env
```

## Design decisions

- **The agent never holds the service key.** It calls `agent-api` with an `x-desk-token` header
  (secret `DESK_AGENT_TOKEN`, kept in the git-ignored `.env`). The function can only insert one
  briefing per kind per date (a repeat gets a 409), insert its ideas with status `idea`, and refresh
  `holdings.last_price`. It never updates or deletes a trade. If inserting the ideas fails, it
  deletes the briefing it just made.
- **Holdings are Brendan's real portfolio**, used only as context. The agent writes about them,
  but the app never trades them. The agent updates prices; Brendan edits everything else.
- `private.is_allowed()` sits outside the exposed API schema (the Supabase security advisor flagged
  it while it was in `public`).
- `payload.ts` exists twice: `packages/desk/src/payload.ts` is the source, and
  `tools/sync-payload.sh` copies it into the function folder. A test fails if the two copies differ.
- Returns: for stock, a short gains when the price falls. For options, entry and exit are premiums,
  so the return is computed on the premium. A Return % typed on the trade overrides the computed one.
- Dark mode follows the iPad setting (`useColorScheme`). Gains and losses always show a +/− sign
  as well as a color.
- **Sign-in on the iOS Home Screen app uses a password.** Mail opens magic links in Safari, which
  has a separate sign-in. The free plan rejects email template edits (so no typed code) unless we
  add custom SMTP. Set the password in Settings while signed in via the link.
- **iOS Home Screen layout** (worked out over several rounds of on-device readouts, 2026-10-14).
  The page template is `apps/web/public/index.html`:
  - `#root` and `body` are `position: fixed; inset: 0`, and `overscroll-behavior: none` is set.
    Otherwise the whole document rubber-bands and can stay shifted (iPad measured scrollY -64).
  - The status bar style is `black`, not `black-translucent`. With translucent, iOS draws only
    `innerHeight` = screen minus status bar and leaves a strip at the bottom that can't be painted.
  - `manifest.json` sets scope `/market-desk/` so in-app pages never open a Safari sheet.
  - `theme-color` has light and dark variants matching the header.
  - The tab bar is our own (`components/TabBar.tsx`): the library's fixed heights clipped labels.
  - iOS reads the status-bar style and the manifest only when the icon is added. Changing them
    means deleting and re-adding the Home Screen icon.
- `supabase/config.toml` was pushed with `config push` to set `site_url` and the redirect URLs.
  Careful: a push sends every declared auth setting, not only the ones you changed.

## Status (2026-10-13)

Phase 1 is done. Cloud network check PASSED (2026-10-13): environment "Default" allows
`lomsjeahhiyforjnwbtu.supabase.co`, and a network secret injects `x-desk-token` for
`/functions/v1/agent-api`. Cloud sessions call the API with NO token and get 200. Cloud Node is v22.22. The portfolio was loaded on
2026-10-13 from his screenshots: 13 holdings, Roth IRA + Brokerage; cash is not stored. One TEST briefing and one TEST SPY idea
(from `scripts/sample-payload.json`) are in the database. Delete them once he has seen the flow.

**Phase 2 (2026-10-14), in progress.** Built: the Briefings tab (archive and Markdown detail), a
fuller Today, `agent/prompts/` (`_rules.md` plus three tasks), `scripts/should-run.ts` (New York
time window plus NYSE holidays), and `scripts/quotes.ts` (Yahoo chart feed, verified prices).

Agent scripts reach agent-api through **curl**. Node's fetch bypasses the cloud egress proxy, so
the network-secret header never arrived and requests got 401.

Routines all use environment "Default", the repo source, and claude-sonnet-5-5:

| Routine | ID | Cron (UTC) | State |
|---|---|---|---|
| Swing morning | trig_01XWzEZhiHDXN43gpaBRqyJq | `55 11,12 * * 1-5` | **enabled 2026-10-15** |
| Swing evening | trig_01YTJu3ie5JhaRq8cFyM6K7J | `0 21,22 * * 1-5` | **enabled 2026-10-15** |
| Long-term weekly | trig_01M4eaTQozo6tVqgGxVoquGE | `0 22,23 * * 0` | **enabled 2026-10-15** |
| Manual test | trig_01RHdKcx45Uou4bJjDnpKCjv | one-off | prompt swapped per test |

Each routine fires at both UTC hours; `should-run.ts` keeps the one inside the New York window, so
DST needs no edits.

The first long-weekly test published fine. Search worked, but WebFetch hit DNS blocks, so the
environment needs finance and news hosts allowed (`query1`/`query2.finance.yahoo.com` are required
for `quotes.ts`). Email notification is skipped (no Resend); runs use PushNotification instead.

**Agent data sources** (all run through curl):

| Script | What it pulls |
|---|---|
| `quotes.ts` | Yahoo chart feed: prices |
| `news.ts` | RSS: Google News for Reuters, CNBC, Nasdaq, Yahoo, MarketWatch, Fed |
| `econ.ts` | FRED API (key), with BLS v1 as fallback |
| `filings.ts` | SEC EDGAR |
| `finnhub.ts` | Finnhub: earnings, analyst ratings, news |

- **Finnhub key:** a network secret (header `X-Finnhub-Token`) in environment "Default".
- **FRED key and SEC/BLS contact email:** both go in the URL or the User-Agent, so they can't be
  network secrets. They're passed as `export` lines in the private routine prompts. Never put them
  in the repo (it's public). Local copies are in `.env`.
- **Allowed domains** must include `query1`/`query2.finance.yahoo.com`, `feeds.finance.yahoo.com`,
  `news.google.com`, `feeds.content.dowjones.io`, `*.cnbc.com`, `*.nasdaq.com`, `*.sec.gov`,
  `*.bls.gov`, `*.federalreserve.gov` and `api.stlouisfed.org`.
- **Blocked:** Reuters (WebFetch refuses it), plus CNBC and Nasdaq article pages. AP and BLS
  release pages return 403.

## Paper trading agent ("paper bot", 2026-10-16)

A **separate trader agent** runs a simulated **$5,000** account on its own (no approvals),
taking, skipping or waiting on the research desk's swing ideas. Goal: find out whether the
ideas make money before Brendan funds a **$2,500 Robinhood "Agentic" account** (live mode is
NOT built; see "Going live" below). Still paper only: nothing here touches a brokerage.

| What | Where |
|---|---|
| Rules, order validation, P/L, scorecard (tested) | `packages/desk/src/bot.ts`, copied to `supabase/functions/agent-api/bot-rules.ts` by `tools/sync-payload.sh` (a test checks they match) |
| Server actions | `supabase/functions/agent-api/bot.ts`: `?action=bot_context`, `bot_open` (`"preview": true` = price + rule check only), `bot_decide`, `bot_close`, `bot_adjust`, `bot_check` |
| Market data helpers | `supabase/functions/_shared/market.ts` (Yahoo stock quotes, CBOE chains), shared with `quote` |
| Tables | `bot_account` (one row; status/kill switch, `started_on` + `spy_start` set by the first trade), `bot_positions`, `bot_decisions`, `bot_marks` (daily equity + SPY) |
| Checker | pg_cron job `bot-check`, `*/10 13-21 * * 1-5` UTC, calls `bot_check` with the token from Vault secret `desk_agent_token` |
| Trader CLI | `scripts/bot.ts context|preview|open|decide|close|adjust|check` |
| Trader prompt | `agent/prompts/trader.md` (does NOT use `_rules.md`) |
| Dashboard | "Paper bot" tab, `apps/web/src/screens/LiveScreen.tsx` + `src/db/bot.ts` |

Rules (all enforced server-side, as % of current equity): stock ≤ 20%, options cost (= max
loss, debit only) ≤ 6%, ≤ 6 open, one per ticker, options ≥ 7 days to expiry, `exit_by` before
expiry, stop/target are **underlying** prices, stops only tighten, kill switch at −25% pauses
new trades (Brendan resumes from the tab). Fills: stock last price ± 0.05%; options at the
CBOE ask/bid (spreads: long ask − short bid to open). Regular session only. Bearish = puts/put
spreads (no short stock). Each position is tagged `fits_live` ($500 stock / $150 options at the
$2,500 pot) and `live_eligible` (spreads are not, until we know the Agentic account allows them).

Checker behaviour: in the regular session it marks every open position, closes on stop, target,
`exit_by` (from 3:30 PM ET that day) or expiry day, then fills **resting orders** whose trigger
the underlying has reached; after 4 PM on a trading day it upserts the day's `bot_marks` row.
It also flips the kill switch.

**Resting orders** (`bot_orders`, added 2026-10-16 so a "wait for $148" doesn't miss the dip
between the trader's two runs): an order plus `trigger_type` (at_or_below / at_or_above),
`trigger_price` (underlying, between stop and target), optional `max_price` per share, and
`good_until` (before `exit_by`). One pending per ticker. On trigger the checker runs the same
`fill()` as `bot_open` (price at that look, full rule check); a refusal marks it `rejected`, a
fill over `max_price` keeps it waiting. Pending orders expire after `good_until`, and are
cancelled if the research desk later marks the idea invalidated / entry_missed / stale.
Agent: `bot.ts order resting.json`, `bot.ts cancel <id> "why"`. Dashboard: "Waiting to buy".

`pg_net` lives in the `extensions` schema (Brendan moved it 2026-10-16 via the SQL editor;
the cron job calls `net.http_post`, which doesn't depend on the extension's schema).

Trader routines (environment "Default", repo source, claude-sonnet-5-5, tools Bash/Read/Write/
Glob/Grep, **WebSearch/WebFetch disallowed**; only the Claude_Code_Remote connector):

| Routine | ID | Cron (UTC) | Gate |
|---|---|---|---|
| Paper trader (morning) | trig_01Q3ZWceEmd7dLFi3NTQvbdU | `0 14,15 * * 1-5` (10:00 ET) | `trader-morning` |
| Paper trader (afternoon) | trig_01DDZKAP6vM9UGmoUNL4j98k | `30 18,19 * * 1-5` (2:30 PM ET) | `trader-afternoon` |

Isolation: the trader never reads the web (news, WebFetch); the research agent's idea text is
treated as data. Both agents share the `x-desk-token` (the network secret only covers
`/functions/v1/agent-api`), so the separation is by prompt and tool list, not by credential.

**Going live (not built).** Robinhood's official Trading MCP (`https://agent.robinhood.com/mcp/trading`,
beta since 2026-05-27) trades only in a dedicated non-IRA "Agentic" account but can READ all of
Brendan's Robinhood accounts (fine: his other money is at E*Trade). Options are "rolling out";
spreads need Level 3 = margin. Setup/OAuth is desktop-only, and whether a cloud routine can use it
is unknown: test that first. Brendan's plan: per-trade approval at first in live mode.

## Two paper bots: steady and aggressive (2026-10-21)

`bot_account` now has two rows: **steady** (id 1, the original) and **aggressive** (id 2). Every
bot table has `account_id`; the API takes `&account=steady|aggressive` (default steady) and the
checker runs every account. Rules live in `BOT_PROFILES` (`packages/desk/src/bot.ts`):

| | Steady | Aggressive |
|---|---|---|
| Ideas | research desk only (`idea_id` required) | its own (web, `scripts/scan.ts`); desk ideas optional |
| Size | 20% stock / 6% options of equity | none (cash only, no margin) |
| Max open | 6 | none (one per ticker) |
| Kill switch | −25% | none |
| Kinds | stock, call, put | stock, call, put |

**No spreads for either** from 2026-10-21 (Brendan's Robinhood options account can't trade them).
The steady bot's earlier HAL call spread runs out normally.

Aggressive bot: `agent/prompts/aggressive.md`, gates `aggro-open` (9:45), `aggro-midday` (12:30),
`aggro-late` (15:15); web tools allowed (it reads news), so its setup does not carry over to a
live account as is. `scripts/scan.ts`: Yahoo predefined screeners (no key) + sector ETFs.
Dashboard: comparison card and an account switcher on the "Paper bots" tab.

Aggressive routines (environment "Default", repo source, claude-sonnet-5-5, tools Bash/Read/Write/
Glob/Grep/WebSearch/WebFetch, only the Claude_Code_Remote connector):

| Routine | ID | Cron (UTC) | Gate |
|---|---|---|---|
| Aggressive bot (9:45) | trig_01RmX7Q6wYZe6g6kUENN7ffa | `45 13,14 * * 1-5` | `aggro-open` |
| Aggressive bot (12:30) | trig_012TEvV3HMJyg9EKogS1juEB | `30 16,17 * * 1-5` | `aggro-midday` |
| Aggressive bot (3:15) | trig_01EM95Ppgg6oFWvrWLQaQA2B | `15 19,20 * * 1-5` | `aggro-late` |

The `bot_accounts` migration was run by Brendan in the SQL editor (the MCP refuses statements
that drop constraints or indexes): ask him to do the same for any future migration with a `drop`.

## Briefing depth upgrade (2026-10-21)

Diagnosis from the 2026-10-21 morning run (4.5 min, 2 web searches): the 33k-token digest was too
big to read, Finnhub (two scripts at once) and Forex Factory (cloud IPs) returned 429, and nothing
required verifying causes. Fixes:
- `gather.ts` digest ~4k tokens (no URLs; they stay in the JSON files).
- `news.ts --no-finnhub` inside gather; `finnhub.ts` paced 1.1 s with 429 retries, run after calendar.
- Economic calendar: `market_cache` table + agent-api `?action=econ_calendar` (cache.ts), warmed by
  pg_cron jobs `econ-calendar-refresh` (weekdays 10/13/17/21 UTC) and `-sunday` (20 UTC);
  `calendar.ts` reads the cache first, the feed directly only as a fallback.
- `_rules.md` "Research standards" + a self-review step; deeper asks in the three task prompts.
- Morning briefing starts 7:30 (`30 11,12 * * 1-5`, window 7:05–8:05).
- Models: evening + weekly on claude-opus-5-5. The morning routine's model change was blocked by
  the credential classifier (its prompt carries the FRED key), so Brendan switches it in the UI.
