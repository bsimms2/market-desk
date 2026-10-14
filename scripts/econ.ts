// Latest official US economic data from the BLS public API (no key).
//   node scripts/econ.ts
// Needs DESK_CONTACT_EMAIL (sent as the User-Agent contact; kept out of this public repo).
// Prints JSON: for each series, the latest month, its value, and month-over-month and
// year-over-year changes computed the way the headlines report them (seasonally
// adjusted series for m/m, unadjusted for y/y on CPI/PPI).
import { execFileSync } from "node:child_process";

const SERIES: { id: string; name: string; kind: "index" | "rate" | "level" | "dollars"; yoyId?: string }[] = [
  { id: "CUSR0000SA0", name: "CPI, all items (SA)", kind: "index", yoyId: "CUUR0000SA0" },
  { id: "CUSR0000SA0L1E", name: "Core CPI, ex food & energy (SA)", kind: "index", yoyId: "CUUR0000SA0L1E" },
  { id: "WPSFD4", name: "PPI, final demand (SA)", kind: "index", yoyId: "WPUFD4" },
  { id: "LNS14000000", name: "Unemployment rate", kind: "rate" },
  { id: "CES0000000001", name: "Nonfarm payrolls (thousands, SA)", kind: "level" },
  { id: "CES0500000003", name: "Average hourly earnings, private (SA)", kind: "dollars" },
];

type Pt = { year: string; period: string; periodName: string; value: string };

const email = process.env.DESK_CONTACT_EMAIL;
if (!email) {
  console.error("DESK_CONTACT_EMAIL is not set (BLS asks automated tools for a contact address).");
  process.exit(2);
}

const ids = [...new Set(SERIES.flatMap((s) => [s.id, ...(s.yoyId ? [s.yoyId] : [])]))];
const raw = execFileSync(
  "curl",
  ["-sS", "--fail", "--max-time", "30", "-A", `MarketDesk personal research ${email}`, "-H", "content-type: application/json", "-X", "POST", "--data-binary", "@-", "https://api.bls.gov/publicAPI/v1/timeseries/data/"],
  { input: JSON.stringify({ seriesid: ids }), encoding: "utf8" },
);
const j = JSON.parse(raw);
if (j.status !== "REQUEST_SUCCEEDED") {
  console.error("BLS:", j.status, (j.message ?? []).join("; "));
  process.exit(1);
}
const byId: Record<string, Pt[]> = {};
for (const s of j.Results.series) byId[s.seriesID] = (s.data as Pt[]).filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period));

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const out = SERIES.map((s) => {
  const d = byId[s.id] ?? [];
  const [cur, prev] = d;
  if (!cur) return { series: s.id, name: s.name, error: "no data" };
  const v = Number(cur.value);
  const pv = prev ? Number(prev.value) : undefined;
  const res: Record<string, unknown> = { series: s.id, name: s.name, month: `${cur.periodName} ${cur.year}`, value: v };
  if (pv !== undefined) {
    if (s.kind === "index" || s.kind === "dollars") res.mom_pct = r(((v - pv) / pv) * 100, 1);
    else if (s.kind === "level") res.mom_change = r(v - pv, 0);
    else res.mom_change_pts = r(v - pv, 1);
    res.prior = `${prev!.periodName} ${prev!.year}: ${pv}`;
  }
  const yoySrc = byId[s.yoyId ?? s.id] ?? [];
  const now = yoySrc.find((x) => x.year === cur.year && x.period === cur.period);
  const ago = yoySrc.find((x) => Number(x.year) === Number(cur.year) - 1 && x.period === cur.period);
  if (now && ago && (s.kind === "index" || s.kind === "dollars")) res.yoy_pct = r(((Number(now.value) - Number(ago.value)) / Number(ago.value)) * 100, 1);
  return res;
});
console.log(JSON.stringify({ source: "BLS public API", series: out }, null, 1));
