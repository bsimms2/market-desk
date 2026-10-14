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
| Swing morning | trig_01XWzEZhiHDXN43gpaBRqyJq | `55 11,12 * * 1-5` | created disabled |
| Swing evening | trig_01YTJu3ie5JhaRq8cFyM6K7J | `0 21,22 * * 1-5` | created disabled |
| Long-term weekly | trig_01M4eaTQozo6tVqgGxVoquGE | `0 22,23 * * 0` | created disabled |
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
