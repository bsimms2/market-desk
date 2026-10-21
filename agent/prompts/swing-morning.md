# Swing morning briefing (weekdays, starts ~7:30 AM New York, published by ~8:00–8:15)

Read `agent/prompts/_rules.md` first and follow it. Kind: **swing-morning** (gate with
`node scripts/should-run.ts swing-morning`), payload kind `swing_morning`.

Goal: before the open, give Brendan the setup for today and 2–3 swing ideas (days to a few
weeks) he could paper-trade. The run starts at 7:30 so there's time to dig: follow the research
standards in `_rules.md`, and aim to publish by about 8:15.

## Research (fresh searches; note the URLs)

- **Overnight:** S&P 500, Nasdaq 100 and Dow futures; the 10-year yield; the dollar; oil; gold;
  bitcoin if it's moving. Asia and Europe sessions. Any big overnight headline.
- **Today's calendar** with times (ET): economic releases (CPI, jobs, PPI, retail sales, PMIs,
  jobless claims…), Fed speakers, Treasury auctions, and notable earnings before the open and
  after the close. Include the consensus for the big releases.
- **Movers:** premarket gainers and losers on news (`quotes.ts` gives premarket prices; search
  "premarket movers" for the list), analyst actions that matter, and sector knock-on effects (a
  supplier's guidance moving its customers, and so on). Confirm *why* each big one is moving.
- **Last night's and this morning's earnings:** for every company that matters (holdings, idea
  tickers, sector bellwethers), the actual numbers and guidance vs. expectations, from the release
  or 8-K, and the stock's reaction. Say what drove the reaction.
- **Where the ideas come from:** start wide. `node scripts/scan.ts` (yesterday's movers, unusual
  volume, sectors leading over the week) plus the overnight story's knock-ons. Shortlist 4–6
  candidates, dig into each (news, earnings date, options pricing, chart levels from `quotes.ts`),
  then pick the best 2–3. Don't just take the first names in the headlines.
- **Brendan's holdings:** for each ticker in `holdings`, check for news, an earnings date this
  week, or a premarket move of 2% or more, and confirm the reason for any move (research
  standards). Get the previous close for each one for `prices`.
- **Open paper swing trades:** where each one is now against its invalidation and target.

## Briefing layout (`body_md`)

1. `## Overnight setup`: 3–5 bullets. Each says what happened and why it matters today.
2. `## Today's calendar`: the times (ET) with one line each on why it matters, plus what a hot or
   cold number would do, in cause-and-effect terms.
3. `## Swing ideas`: 2–3 ideas. For each one: a `### TICKER: long/short, one-line hook` heading,
   then short labelled lines for **Thesis**, **Catalyst & timing**, **Entry zone**, **Target**,
   **Wrong if**, **Options angle**, and **Overlap with your holdings** (only when relevant).
   Event-driven ideas are preferred: economic releases, earnings, news moves, cross-sector
   knock-ons. Mix it up; not every idea should be a long on a mega-cap.
4. `## Your holdings`: only the holdings with something going on today (news, earnings this
   week, a big premarket move, or a release that hits their sector), one or two sentences each,
   saying why it matters *for that position*. If nothing is going on, write one line saying so.
5. `## Open paper positions`: one line each: where it is against entry, target and wrong-if,
   and whether today's events threaten it. If there are none, write one line.
6. The disclaimer line.

Keep it around 700–1,200 words. It's read before the open, so lead with what matters.

## Ideas in the payload

Put 2–3 entries in `ideas`, all with `"track": "swing"`, matching the ideas in the text. The
notification names the tickers.
