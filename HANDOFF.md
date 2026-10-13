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
- `supabase/config.toml` was pushed with `config push` to set `site_url` and the redirect URLs.
  Careful: a push sends every declared auth setting, not only the ones you changed.

## Status (2026-10-13)

Phase 1 is done. The cloud network check FAILED: the routine environment "Default" gets a proxy 403
for `lomsjeahhiyforjnwbtu.supabase.co`. Add that host to the environment's allowed hosts, and add
`DESK_AGENT_TOKEN` as a network secret (header x-desk-token) there. The portfolio was loaded on
2026-10-13 from his screenshots: 13 holdings, Roth IRA + Brokerage; cash is not stored. One TEST briefing and one TEST SPY idea
(from `scripts/sample-payload.json`) are in the database. Delete them once he has seen the flow.

Next is phase 2: the three prompts, the Briefings archive with Markdown, the full dashboard, the
Resend email (needs `RESEND_API_KEY` and `NOTIFY_EMAIL` in `.env`), and the scheduled routines.
Times are 7:55 AM and 5:00 PM ET on weekdays and 6:00 PM ET on Sundays. Daylight saving ends
Nov 1, so schedule them in America/New_York.
