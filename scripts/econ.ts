// Latest official US economic data.
//   node scripts/econ.ts
// Primary: FRED (St. Louis Fed) API when FRED_API_KEY is set. It republishes the BLS/BEA
// releases the same day and adds rates, claims, retail sales, GDP and sentiment.
// Fallback: the BLS public API (no key; needs DESK_CONTACT_EMAIL for the User-Agent),
// which has a small daily limit shared across the cloud machines.
// Keys and the contact address come from the routine prompt, not this public repo.
// Prints JSON: { source, series: [{ id, name, date, value, changes... }], errors }.
import { execFileSync } from "node:child_process";

type Kind = "index" | "level" | "rate" | "pct";
type Freq = "d" | "w" | "m" | "q";
interface Spec {
  id: string;
  name: string;
  kind: Kind; // index: % changes; level: unit changes; rate/pct: point changes
  freq: Freq;
}

const FRED: Spec[] = [
  { id: "CPIAUCSL", name: "CPI, all items (SA index)", kind: "index", freq: "m" },
  { id: "CPILFESL", name: "Core CPI ex food & energy (SA index)", kind: "index", freq: "m" },
  { id: "PCEPILFE", name: "Core PCE price index (the Fed's gauge)", kind: "index", freq: "m" },
  { id: "PPIFIS", name: "PPI, final demand (SA index)", kind: "index", freq: "m" },
  { id: "UNRATE", name: "Unemployment rate (%)", kind: "rate", freq: "m" },
  { id: "PAYEMS", name: "Nonfarm payrolls (thousands)", kind: "level", freq: "m" },
  { id: "CES0500000003", name: "Average hourly earnings ($)", kind: "index", freq: "m" },
  { id: "ICSA", name: "Initial jobless claims (weekly)", kind: "level", freq: "w" },
  { id: "RSAFS", name: "Retail sales ($ millions, SA)", kind: "index", freq: "m" },
  { id: "A191RL1Q225SBEA", name: "Real GDP growth (% annualized q/q)", kind: "pct", freq: "q" },
  { id: "UMCSENT", name: "UMich consumer sentiment", kind: "level", freq: "m" },
  { id: "DFF", name: "Fed funds effective rate (%)", kind: "rate", freq: "d" },
  { id: "DGS2", name: "2-year Treasury yield (%)", kind: "rate", freq: "d" },
  { id: "DGS10", name: "10-year Treasury yield (%)", kind: "rate", freq: "d" },
  { id: "T10Y2Y", name: "10y minus 2y spread (pts)", kind: "rate", freq: "d" },
  { id: "MORTGAGE30US", name: "30-year mortgage rate (%)", kind: "rate", freq: "w" },
  { id: "VIXCLS", name: "VIX", kind: "level", freq: "d" },
];

// How many observations back = "previous", "~1 month", "~1 year" for each frequency.
const BACK: Record<Freq, { prev: number; month?: number; year: number }> = {
  d: { prev: 1, month: 21, year: 252 },
  w: { prev: 1, month: 4, year: 52 },
  m: { prev: 1, year: 12 },
  q: { prev: 1, year: 4 },
};

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function change(kind: Kind, now: number, then: number, label: string): Record<string, number> {
  if (kind === "index") return { [`${label}_pct`]: r(((now - then) / then) * 100, 2) };
  if (kind === "level") return { [`${label}_change`]: r(now - then, 2) };
  return { [`${label}_change_pts`]: r(now - then, 2) };
}

function curl(args: string[], input?: string): string {
  return execFileSync("curl", ["-sS", "--max-time", "30", ...args], { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
}

function fromFred(key: string) {
  const errors: string[] = [];
  const series = FRED.map((s) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${key}&file_type=json&sort_order=desc&limit=${BACK[s.freq].year + 5}`;
      const j = JSON.parse(curl(["-A", "MarketDesk personal research", url]));
      if (j.error_message) throw new Error(j.error_message);
      const obs = (j.observations as { date: string; value: string }[]).filter((o) => o.value !== ".");
      const [cur] = obs;
      if (!cur) throw new Error("no observations");
      const v = Number(cur.value);
      const b = BACK[s.freq];
      const out: Record<string, unknown> = { id: s.id, name: s.name, date: cur.date, value: v };
      const at = (n: number) => (obs[n] ? Number(obs[n]!.value) : undefined);
      const p = at(b.prev);
      if (p !== undefined) Object.assign(out, { previous: { date: obs[b.prev]!.date, value: p } }, change(s.kind, v, p, s.freq === "q" ? "qoq" : s.freq === "m" ? "mom" : s.freq === "w" ? "wow" : "dod"));
      if (b.month && at(b.month) !== undefined) Object.assign(out, change(s.kind, v, at(b.month)!, "1mo"));
      if (at(b.year) !== undefined) Object.assign(out, change(s.kind, v, at(b.year)!, "yoy"));
      return out;
    } catch (e) {
      errors.push(`${s.id}: ${(e as Error).message.slice(0, 120)}`);
      return null;
    }
  }).filter(Boolean);
  return { source: "FRED (St. Louis Fed)", series, errors };
}

function fromBls(email: string) {
  const specs = [
    { id: "CUSR0000SA0", name: "CPI, all items (SA)", yoy: "CUUR0000SA0", kind: "index" as Kind },
    { id: "CUSR0000SA0L1E", name: "Core CPI ex food & energy (SA)", yoy: "CUUR0000SA0L1E", kind: "index" as Kind },
    { id: "WPSFD4", name: "PPI, final demand (SA)", yoy: "WPUFD4", kind: "index" as Kind },
    { id: "LNS14000000", name: "Unemployment rate (%)", kind: "rate" as Kind },
    { id: "CES0000000001", name: "Nonfarm payrolls (thousands)", kind: "level" as Kind },
    { id: "CES0500000003", name: "Average hourly earnings ($)", kind: "index" as Kind },
  ];
  const ids = [...new Set(specs.flatMap((s) => [s.id, ...(s.yoy ? [s.yoy] : [])]))];
  const j = JSON.parse(
    curl(["--fail", "-A", `MarketDesk personal research ${email}`, "-H", "content-type: application/json", "-X", "POST", "--data-binary", "@-", "https://api.bls.gov/publicAPI/v1/timeseries/data/"], JSON.stringify({ seriesid: ids })),
  );
  if (j.status !== "REQUEST_SUCCEEDED") return { source: "BLS public API", series: [], errors: [`BLS: ${j.status} ${(j.message ?? []).join("; ")}`] };
  type Pt = { year: string; period: string; periodName: string; value: string };
  const by: Record<string, Pt[]> = {};
  for (const s of j.Results.series) by[s.seriesID] = (s.data as Pt[]).filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period));
  const series = specs.map((s) => {
    const [cur, prev] = by[s.id] ?? [];
    if (!cur) return { id: s.id, name: s.name, error: "no data" };
    const v = Number(cur.value);
    const out: Record<string, unknown> = { id: s.id, name: s.name, date: `${cur.periodName} ${cur.year}`, value: v };
    if (prev) Object.assign(out, change(s.kind, v, Number(prev.value), "mom"));
    const src = by[s.yoy ?? s.id] ?? [];
    const now = src.find((x) => x.year === cur.year && x.period === cur.period);
    const ago = src.find((x) => Number(x.year) === Number(cur.year) - 1 && x.period === cur.period);
    if (now && ago) Object.assign(out, change(s.kind, Number(now.value), Number(ago.value), "yoy"));
    return out;
  });
  return { source: "BLS public API", series, errors: [] as string[] };
}

const key = process.env.FRED_API_KEY;
const email = process.env.DESK_CONTACT_EMAIL;
let result: { source: string; series: unknown[]; errors: string[] };
if (key) {
  result = fromFred(key);
  if (!result.series.length && email) result = { ...fromBls(email), errors: [...result.errors, "FRED failed; fell back to BLS"] };
} else if (email) {
  result = fromBls(email);
} else {
  console.error("Set FRED_API_KEY (preferred) or DESK_CONTACT_EMAIL (BLS fallback).");
  process.exit(2);
}
console.log(JSON.stringify(result, null, 1));
if (!result.series.length) process.exitCode = 1;
