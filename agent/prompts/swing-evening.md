# Swing evening recap (weekdays, ~5:00 PM New York)

Read `agent/prompts/_rules.md` first and follow it. Kind: **swing-evening** (gate with
`node scripts/should-run.ts swing-evening`), payload kind `swing_evening`.

Goal: close the loop on the day. How did this morning's ideas and the open paper positions do
against their theses, and what did the market teach? **No new ideas**: `ideas` must be `[]`.

## Research (fresh searches; note the URLs)

- **The close:** S&P 500, Nasdaq, Dow and Russell 2000 closes and % changes, the 10-year yield,
  the dollar and oil. Which sectors led and lagged, and the *reason*.
- **This morning's ideas:** find today's `swing_morning` briefing in `recent_briefings` and its
  ideas in `recent_ideas_21d` (same `source_briefing_id`). For each idea, get today's high, low
  and close, then check them against its entry zone, target and wrong-if.
- **Open paper trades** (`open_trades`): close vs. entry, target and invalidation.
- **Brendan's holdings:** today's close and % change for every ticker (all of them go in
  `prices`, dated today). Find the reason for any holding that moved 3% or more either way.
- **After-hours:** earnings released after the close, and any after-hours move in his holdings
  or today's idea tickers.

## Recap layout (`body_md`)

1. `## The day in one paragraph`: the story of the session as cause and effect: what drove it
   and how it spread across sectors.
2. `## This morning's ideas`: one short block per idea. Did it set up? Did price reach the entry
   zone? Was the wrong-if hit? Was the thesis right, wrong, or too early? Be honest. A missed
   call that's well explained is worth more than a vague one.
3. `## Open paper positions`: one line each: today's move and where it stands against target
   and invalidation. Flag clearly, in bold, any position that **hit its invalidation**.
4. `## Your holdings`: a compact table of ticker | close | day % (with a + or − sign). Then
   one or two sentences for each mover of 3% or more on *why*. If any reported after the
   close, add a line on what they said and the after-hours reaction.
5. `## What today taught us`: one short paragraph. Pick one concrete lesson (about
   catalysts, options, risk or behaviour) and tie it to something that happened today.
6. `## Watch tomorrow`: 3–5 bullets with times.
7. The disclaimer line.

Keep it around 500–900 words.
