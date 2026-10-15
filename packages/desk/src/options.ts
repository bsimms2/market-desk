/**
 * Read an idea's option structure ("Oct 30 220/230 call spread", "Jan 15 2027 250 call",
 * "Nov 21 $150/$160 calls", "Dec 18 '26 210/200 put spread") into a quote request for the
 * `quote` edge function. Debit spreads only: for calls the long leg is the lower strike,
 * for puts the higher one, whatever order they were written in.
 */
export type OptionSpec =
  | { kind: "option"; spec: string; label: string } // TICKER:YYYY-MM-DD:STRIKE{C|P}
  | { kind: "spread"; spec: string; label: string }; // TICKER:YYYY-MM-DD:LONG/SHORT{C|P}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseOptionStructure(structure: string, ticker: string, today: string): OptionSpec | null {
  const m = structure.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+'?(\d{2}|\d{4}))?\s+\$?(\d+(?:\.\d+)?)(?:\s*\/\s*\$?(\d+(?:\.\d+)?))?\s*(calls?|puts?|c|p)\b/i,
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return null;
  let year: number;
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  else {
    // No year written: the next time that date comes around, today included.
    year = Number(today.slice(0, 4));
    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate < today) year++;
  }
  const expiry = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const type = m[6]!.toLowerCase().startsWith("c") ? "C" : "P";
  const a = Number(m[4]);
  const b = m[5] != null ? Number(m[5]) : undefined;
  const tk = ticker.toUpperCase();
  const fmt = (n: number) => String(n);
  if (b === undefined) {
    return { kind: "option", spec: `${tk}:${expiry}:${fmt(a)}${type}`, label: `${tk} ${expiry} ${fmt(a)} ${type === "C" ? "call" : "put"}` };
  }
  const [long, short] = type === "C" ? [Math.min(a, b), Math.max(a, b)] : [Math.max(a, b), Math.min(a, b)];
  return {
    kind: "spread",
    spec: `${tk}:${expiry}:${fmt(long)}/${fmt(short)}${type}`,
    label: `${tk} ${expiry} ${fmt(long)}/${fmt(short)} ${type === "C" ? "call" : "put"} spread`,
  };
}
