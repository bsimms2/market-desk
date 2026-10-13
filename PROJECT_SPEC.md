# Market Research Desk: Project Spec

A personal website where an AI research agent posts market briefings and trade ideas. Brendan reviews them, places trades himself in a **paper (simulated) account**, and logs results in a trade journal. The purpose is to **learn**: build a strategy, learn options, and find out what actually works before any real money is involved.

Brendan will mostly use the site from an **iPad mini**, so it must be comfortable at roughly 744px wide and in portrait.

---

## 1. Ground rules (do not break these)

- **No trade execution.** Nothing in this project places orders, moves money, or connects to a brokerage with trading permissions. Brendan places paper trades by hand.
- **Educational framing.** Briefings are research and learning material, not financial advice. Each briefing ends with a one-line reminder of this.
- **Private by default.** The site holds personal trades and notes. Every page and API route requires a sign-in, for a single user (Brendan).
- **Secrets stay out of the repo.** Keep all keys in environment variables. Never commit a service key.

---

## 2. Stack

**Match the stack of Brendan's existing HomeThread website.** Before writing code, ask Brendan for the HomeThread repo, or inspect it if it's attached. Mirror its framework, styling approach, hosting, and deploy setup so both sites are maintained the same way.

If HomeThread can't be inspected, use this default:

| Layer | Default |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database + auth | Supabase (Postgres + Supabase Auth, email magic link) |
| Hosting | Vercel |
| Charts | Recharts, or a lightweight equivalent |

---

## 3. Two tracks, plus options learning

The two tracks run on different clocks, so they stay separate throughout the site and the data.

| | **Swing track** | **Long-term track** |
|---|---|---|
| Holding period | Days to a few weeks | Months |
| Cadence | Weekday morning briefing + weekday evening recap | Sunday evening briefing |
| Focus | Event-driven ideas: economic releases, earnings, news-driven moves, cross-sector knock-on effects | Themes: rate cycles, sector rotation, supply chains; 1–2 companies or ETFs per week |
| Ideas per briefing | 2–3 | 1–2 |

**Options are part of both tracks:**
- Every idea includes an **"Options angle"**: one way to express the idea with options (e.g. a call/put debit spread, a covered call, a longer-dated call), plus a sentence on whether options or shares fit better and why (implied volatility, earnings crush, time decay, defined risk).
- The Sunday briefing includes one **options lesson** tied to a real example from that week.
- The journal tracks stock vs. option results separately, so Brendan can see whether his options trades beat the plain-stock version of the same idea.

**Research style:** Brendan learns best from narrative, cause-and-effect explanations rather than textbook definitions. When a briefing explains a move, it should tell the chain of events: X happened, so Y repriced, which hit Z.

---

## 4. Data model

### `trades`

Stores every idea, whether or not Brendan takes it. Logging passed ideas is what makes the journal honest.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| created_at | timestamptz | |
| track | enum `swing` / `long` | |
| ticker | text | uppercase |
| direction | enum `long` / `short` | |
| instrument | enum `stock` / `option` | |
| structure | text | e.g. "Shares", "Nov 21 150/160 call spread" |
| status | enum `idea` / `open` / `closed` / `passed` | the agent creates `idea`; Brendan changes it |
| thesis | text | |
| catalyst | text | |
| invalidation | text | the "wrong if" condition |
| options_angle | text | |
| entry_plan | text | the agent's suggested entry zone |
| target | text | |
| entry_price | numeric | Brendan's actual fill (nullable) |
| exit_price | numeric | nullable |
| opened_on / closed_on | date | nullable |
| return_pct | numeric | nullable; entered or computed on close |
| lesson | text | Brendan's post-trade notes |
| source_briefing_id | uuid → briefings | nullable (hand-added ideas have none) |

### `briefings`

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| created_at | timestamptz | |
| kind | enum `swing_morning` / `swing_evening` / `long_weekly` | |
| date | date | market date it covers |
| title | text | |
| body_md | text | full briefing in Markdown |
| sources | jsonb | list of `{title, url}` |

### `lessons` (optional, phase 3)

Options lessons pulled out of the weekly briefings so they can be browsed as a library: `id, created_at, title, concept, body_md, briefing_id`.

Enable row-level security on every table so only the authenticated owner can read and write.

---

## 5. Pages

1. **Dashboard** (home)
   - Today's latest briefing summary, with a link to the full text
   - Open positions for both tracks, with days held and the invalidation reminder
   - Summary stats per track: ideas logged, open, closed, win rate, average return for stock vs. option, and the rate at which ideas are taken vs. passed
   - Cumulative return over time for closed paper trades (simple line chart)
2. **Journal**
   - Swing / Long-term tabs, a status filter, newest first
   - Edit from mobile: change status, enter fills, exit, return, and lesson
   - "Add entry" for ideas Brendan finds himself
3. **Briefings**
   - Archive by date and kind; Markdown rendered with clickable sources
   - Each briefing links to the trade ideas it created
4. **Lessons** (phase 3): options lessons library
5. **Weekly review** (phase 3): closed trades this week, what worked and what didn't, grouped by catalyst type

**Design:** clean and readable on a tablet, light and dark mode, tabular numbers for prices and returns. Color indicates gains and losses, plus a text sign (+/−) so it isn't the only signal.

---

## 6. The research agent (scheduled briefings)

Briefings are produced by **scheduled Claude Code tasks** that run against this repo. Each run:

1. Reads open positions and recent ideas from the database, so it doesn't repeat itself and can check open trades.
2. Researches with fresh web searches: prices, futures, the economic calendar, earnings, news. **Never rely on remembered prices or events.**
3. Writes the briefing and saves it to `briefings`.
4. Inserts each new idea into `trades` with `status = 'idea'` and `source_briefing_id` set. **It never edits or deletes existing trades.**
5. Sends a short notification that the briefing is ready.

Put the write step in a small script in the repo (e.g. `scripts/publish-briefing.ts`) that takes a JSON payload `{briefing, ideas[]}` and writes it with the Supabase service key from the environment. That keeps each scheduled task's prompt short and stable.

**Check network access early.** Scheduled cloud sessions may only reach an allowlist of hosts. In phase 1, confirm that the scheduled environment can reach the Supabase project URL. If it can't, either add the host to the environment's network allowlist, or fall back to committing each briefing as `content/briefings/YYYY-MM-DD-kind.json` and importing it into Supabase through a protected API route or on deploy.

### Schedules (America/New_York)

| Task | When | Content |
|---|---|---|
| Swing morning | Weekdays ~7:55 AM | Overnight setup (3–5 bullets); today's calendar with times; 2–3 swing ideas, each with ticker, direction, thesis, catalyst and timing, entry zone, target, invalidation, options angle; one line on each open swing position |
| Swing evening recap | Weekdays ~5:00 PM | How today's ideas and open positions moved against their theses; any invalidation hit; one short "what today taught us" paragraph; things to watch tomorrow. No new ideas. |
| Long-term weekly | Sundays ~6:00 PM | 1–2 bigger themes; 1–2 long-term ideas in the same format; check-in on open long positions; the options lesson of the week; a short review of both tracks' journal stats |

On US market holidays, the weekday tasks post a one-line note and stop.

Store the task prompts in the repo under `agent/prompts/*.md`, so they're versioned and the scheduled tasks can just say "follow `agent/prompts/swing-morning.md`".

---

## 7. Build phases

**Phase 1: Foundation**
- Repo, stack, and deploy matching HomeThread
- Supabase project, schema, row-level security, single-user sign-in
- Journal page with full create/edit on mobile
- `publish-briefing` script, tested with a sample payload
- Network-access check from a scheduled cloud session

**Phase 2: Agent + dashboard**
- The three prompts in `agent/prompts/`
- Briefings archive page
- Dashboard with open positions and stats
- Create the three scheduled tasks. Confirm the times with Brendan first, then run each once manually and check the output.

**Phase 3: Learning tools**
- Lessons library
- Weekly review page
- Return-over-time chart; stock vs. option comparison

**Later (optional, only if Brendan asks)**
- Read-only sync from an Alpaca **paper** account to pull fills into the journal automatically. Read-only keys, paper environment only, no order endpoints.

---

## 8. Done means

- Brendan can sign in on his iPad mini and see the latest briefing within a minute of it posting.
- Every agent idea shows up in the journal as "Idea", linked to its briefing.
- He can mark an idea Open, Closed, or Passed and record fills and lessons from the iPad in a few taps.
- The dashboard shows win rate and average return per track, split by stock vs. option.
- No secrets in the repo, no trading endpoints anywhere, and every route requires sign-in.

---

## 9. Ask Brendan before starting

1. Which repo is HomeThread, and where is it hosted?
2. A new repo name for this project, and a domain if he wants one.
3. Is a magic-link email sign-in fine?
4. Should the briefing times above be confirmed or changed?
