// Recent SEC filings per ticker, from EDGAR (no key).
//   node scripts/filings.ts --holdings /tmp/context.json [TICKERS] [--days 14]
// Needs DESK_CONTACT_EMAIL: the SEC's fair-access policy asks automated tools to
// identify themselves with a contact address in the User-Agent. The address is kept
// out of this public repo; the routine prompt supplies it.
// Prints JSON per ticker: 8-K current reports (with what each item means), 10-Q/10-K,
// ownership forms, and a count of insider (Form 4) filings, each with a link.
// ETFs and funds have no company filings and are reported as such.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ITEM_8K: Record<string, string> = {
  "1.01": "material agreement",
  "1.02": "agreement terminated",
  "1.03": "bankruptcy",
  "2.01": "acquisition/disposition completed",
  "2.02": "earnings results",
  "2.03": "new debt obligation",
  "2.05": "restructuring/exit costs",
  "2.06": "impairment",
  "3.01": "delisting notice",
  "3.02": "unregistered equity sale",
  "4.01": "auditor change",
  "4.02": "prior financials unreliable",
  "5.01": "change in control",
  "5.02": "executive/director change",
  "5.03": "charter/bylaw change",
  "5.07": "shareholder vote results",
  "7.01": "Reg FD disclosure",
  "8.01": "other events",
  "9.01": "exhibits",
};
const INTERESTING = /^(8-K|10-Q|10-K|S-1|S-3|424B\d|SC 13D|SC 13G|SCHEDULE 13D|SCHEDULE 13G|DEF 14A|6-K|20-F)/;

function ua(): string {
  const email = process.env.DESK_CONTACT_EMAIL;
  if (!email) {
    console.error("DESK_CONTACT_EMAIL is not set (the SEC requires a contact address).");
    process.exit(2);
  }
  return `MarketDesk personal research ${email}`;
}

function getJson(url: string): any {
  return JSON.parse(execFileSync("curl", ["-sS", "--fail", "--max-time", "30", "-A", ua(), url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

const isMain = process.argv[1] && /filings\.ts$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const args = process.argv.slice(2);
  let days = 14;
  const tickers: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") days = Number(args[++i]);
    else if (args[i] === "--holdings") tickers.push(...(JSON.parse(readFileSync(args[++i]!, "utf8")).holdings ?? []).map((h: { ticker: string }) => h.ticker));
    else tickers.push(args[i]!.toUpperCase());
  }
  if (!tickers.length) {
    console.error("usage: node scripts/filings.ts [--holdings /tmp/context.json] [TICKER ...] [--days 14]");
    process.exit(2);
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const map: Record<string, { cik_str: number; title: string }> = {};
  for (const v of Object.values(getJson("https://www.sec.gov/files/company_tickers.json")) as { cik_str: number; ticker: string; title: string }[]) {
    map[v.ticker.replace(/-/g, ".")] = v;
  }
  const out: Record<string, unknown> = {};
  for (const t of [...new Set(tickers)]) {
    const hit = map[t];
    if (!hit) {
      out[t] = { note: "no SEC company filings (ETF/fund, or not an SEC registrant)" };
      continue;
    }
    try {
      const cik = String(hit.cik_str).padStart(10, "0");
      const sub = getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
      const r = sub.filings.recent;
      const filings: unknown[] = [];
      let insider = 0;
      let lastInsider: string | undefined;
      for (let i = 0; i < r.form.length && r.filingDate[i] >= since; i++) {
        const form: string = r.form[i];
        const url = `https://www.sec.gov/Archives/edgar/data/${hit.cik_str}/${String(r.accessionNumber[i]).replace(/-/g, "")}/${r.primaryDocument[i]}`;
        if (form === "4" || form === "4/A") {
          insider++;
          lastInsider ??= r.filingDate[i];
          continue;
        }
        if (!INTERESTING.test(form)) continue;
        const items = form.startsWith("8-K")
          ? String(r.items[i] || "")
              .split(",")
              .filter(Boolean)
              .map((x: string) => `${x} ${ITEM_8K[x] ?? ""}`.trim())
          : undefined;
        filings.push({ date: r.filingDate[i], form, ...(items?.length ? { items } : {}), description: r.primaryDocDescription[i] || undefined, url });
      }
      out[t] = {
        company: sub.name,
        filings,
        insider_form4_count: insider,
        ...(lastInsider ? { latest_form4: lastInsider, form4_list: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40` } : {}),
      };
    } catch (e) {
      out[t] = { error: (e as Error).message.slice(0, 160) };
    }
  }
  console.log(JSON.stringify({ since, tickers: out }, null, 1));
}
