# Long-term weekly briefing (Sundays, ~6:00 PM New York)

Read `agent/prompts/_rules.md` first and follow it. Kind: **long-weekly** (gate with
`node scripts/should-run.ts long-weekly`), payload kind `long_weekly`.

Goal: step back from the daily noise. Look at the bigger themes, check in on every one of
Brendan's real holdings, give 1–2 long-term ideas (held for months), and teach one options
lesson.

## Research (fresh searches; note the URLs)

- **The week:** index, yield, dollar and oil moves for the week, and the 2–3 stories that
  drove them.
- **Themes:** rate cycles, sector rotation, supply chains, AI capex, energy, consumer health,
  whatever is actually moving capital *now*. Pick 1–2 and trace the cause-and-effect chain.
- **Next week's calendar:** major economic releases (with dates), Fed events, and earnings for
  anything he holds or that's tied to his holdings.
- **Every holding:** this week's % change, the latest close (for `prices`), news, next
  earnings date, and any analyst or guidance change.
- **Open paper long-term trades:** against their theses.
- **Long-term ideas get the deepest dig of the week:** the latest quarterly results and guidance
  (from the release, 10-Q or call coverage), valuation against its own history and peers (forward
  P/E from `scan.ts` or a reputable source), the competitive position, and the 1–2 things that
  would break the thesis. Use `node scripts/scan.ts undervalued_large_caps growth_technology_stocks
  undervalued_growth_stocks` as one place to look, and follow the research standards in
  `_rules.md`. A Sunday run has time: take it.
- **This week's options lesson:** find a real options example from this week (an earnings IV
  crush, a big move that made a call pay, theta eating a long call, a covered call capping
  upside, a put showing what protection costs) and get the real numbers.

## Briefing layout (`body_md`)

1. `## The week in brief`: one paragraph of narrative.
2. `## Big themes`: 1–2 themes, each a few short paragraphs of cause and effect, ending with
   *what it means for Brendan's portfolio*.
3. `## Long-term ideas`: 1–2 ideas (a company or an ETF), using the same labelled lines as the
   swing ideas (**Thesis**, **Catalyst & timing**, **Entry zone**, **Target**, **Wrong if**,
   **Options angle**, **Overlap with your holdings**), but on a months-long horizon. Prefer
   ideas that *add* something he doesn't already have over more of what he owns.
4. `## Your holdings check-in`: for **every** holding, a short block with:
   - the week's move and where it sits against his cost basis;
   - **what changed** (or "quiet week");
   - **his thesis**: if he wrote one, is it intact, weakened or strengthened, and why? If he
     didn't, say "no thesis written yet" once;
   - the **next catalyst** with a date;
   - the **main risk** to watch.

   Then a short **concentration** note: the share of the portfolio in its largest names and
   themes, counting what QQQ and VOO hold underneath (e.g. "AMZN + NVDA + TSLA + AAPL are about
   X% directly, more through QQQ/VOO"). Use `shares × latest price` for the weights. Explain;
   don't instruct.
5. `## Options lesson: <concept>`: about 250–400 words. Build it from this week's real example
   with real numbers: what someone holding the option experienced, why, and the general rule.
   End with a one-line "rule of thumb".
6. `## Journal check`: from `journal_counts` and `closed_last_14d`, both tracks' counts (ideas, open, closed, passed)
   and anything notable, such as ideas he passed on that would have worked, or the reverse.
   Keep it short and honest.
7. `## Next week`: dated bullets for the calendar items that matter.
8. The disclaimer line.

Aim for about 1,500–2,200 words. This is the week's long read.

## Ideas in the payload

Put 1–2 entries in `ideas`, all with `"track": "long"`.
