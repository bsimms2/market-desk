// Should this scheduled run go ahead? Prints one line:
//   RUN <kind> <date>             go ahead; <date> is the New York market date to cover
//   HOLIDAY <kind> <date> <name>  weekday task on an NYSE holiday: post the one-line note, nothing else
//   SKIP <reason>                 stop now, post nothing
//
//   node scripts/should-run.ts swing-morning|swing-evening|long-weekly|trader-morning|trader-afternoon|aggro-open|aggro-midday|aggro-late [--force]
//
// Why: cloud routines are scheduled in UTC, so each one fires at both UTC times
// that can land on its New York time (EDT and EST). This keeps the one that's
// inside the New York window, so daylight-saving changes need no edits.
// --force skips the time-window check (manual test runs), not the holiday check.

type Kind = "swing-morning" | "swing-evening" | "long-weekly" | "trader-morning" | "trader-afternoon" | "aggro-open" | "aggro-midday" | "aggro-late";

// Window in New York local time, minutes after midnight. Targets: 7:55, 17:00, Sun 18:00; trader 10:00 and 14:30; aggressive 9:45, 12:30, 15:15.
// The two UTC fires land exactly one hour apart, so a window under an hour wide
// (here: 25 min before to 35 min after the target) admits exactly one of them,
// with room for the scheduler starting a few minutes late.
const WINDOWS: Record<Kind, { from: number; to: number; days: number[] }> = {
  "swing-morning": { from: 7 * 60 + 30, to: 8 * 60 + 30, days: [1, 2, 3, 4, 5] },
  "swing-evening": { from: 16 * 60 + 35, to: 17 * 60 + 35, days: [1, 2, 3, 4, 5] },
  "long-weekly": { from: 17 * 60 + 35, to: 18 * 60 + 35, days: [0] },
  // The paper trader: 10:00 (after the open settles) and 14:30.
  "trader-morning": { from: 9 * 60 + 35, to: 10 * 60 + 35, days: [1, 2, 3, 4, 5] },
  "trader-afternoon": { from: 14 * 60 + 5, to: 15 * 60 + 5, days: [1, 2, 3, 4, 5] },
  // The aggressive paper bot: 9:45, 12:30 and 15:15.
  "aggro-open": { from: 9 * 60 + 20, to: 10 * 60 + 20, days: [1, 2, 3, 4, 5] },
  "aggro-midday": { from: 12 * 60 + 5, to: 13 * 60 + 5, days: [1, 2, 3, 4, 5] },
  "aggro-late": { from: 14 * 60 + 50, to: 15 * 60 + 50, days: [1, 2, 3, 4, 5] },
};

// NYSE full-day closures. Extend before 2028 (the script warns when the list runs out).
const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-12-24": "Christmas Day (observed)",
};
const LAST_LISTED_YEAR = 2027;

export function nyNow(d: Date = new Date()): { date: string; minutes: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

export function decide(kind: Kind, now: Date = new Date(), force = false): string {
  const w = WINDOWS[kind];
  const ny = nyNow(now);
  if (!force) {
    if (!w.days.includes(ny.weekday)) return `SKIP wrong day for ${kind} (New York ${ny.date})`;
    if (ny.minutes < w.from || ny.minutes > w.to) {
      const hhmm = `${String(Math.floor(ny.minutes / 60)).padStart(2, "0")}:${String(ny.minutes % 60).padStart(2, "0")}`;
      return `SKIP outside ${kind} window (New York ${hhmm}); the other UTC fire covers it`;
    }
  }
  if (kind !== "long-weekly" && HOLIDAYS[ny.date]) return `HOLIDAY ${kind} ${ny.date} ${HOLIDAYS[ny.date]}`;
  return `RUN ${kind} ${ny.date}`;
}

const isMain = process.argv[1] && /should-run\.ts$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const kind = process.argv[2] as Kind;
  if (!(kind in WINDOWS)) {
    console.log("SKIP usage: node scripts/should-run.ts swing-morning|swing-evening|long-weekly|trader-morning|trader-afternoon|aggro-open|aggro-midday|aggro-late [--force]");
    process.exitCode = 2;
  } else {
    if (Number(nyNow().date.slice(0, 4)) > LAST_LISTED_YEAR) console.error("WARNING: NYSE holiday list in scripts/should-run.ts has run out; verify holidays by search and extend it.");
    console.log(decide(kind, new Date(), process.argv.includes("--force")));
  }
}
