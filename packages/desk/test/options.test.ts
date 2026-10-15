import { describe, expect, it } from "vitest";
import { parseOptionStructure } from "../src";

const T = "2026-10-15";
describe("parseOptionStructure", () => {
  it("call debit spread, no year → this year", () =>
    expect(parseOptionStructure("Oct 30 220/230 call spread", "nvda", T)).toEqual({ kind: "spread", spec: "NVDA:2026-10-30:220/230C", label: "NVDA 2026-10-30 220/230 call spread" }));
  it("date already passed this year → next year", () => expect(parseOptionStructure("Jan 15 250 call", "TSLA", T)?.spec).toBe("TSLA:2027-01-15:250C"));
  it("explicit 4-digit year and single leg", () => expect(parseOptionStructure("Jan 15 2027 250 call", "TSLA", T)).toMatchObject({ kind: "option", spec: "TSLA:2027-01-15:250C" }));
  it("2-digit year with apostrophe, $ signs, plural", () => expect(parseOptionStructure("Dec 18 '26 $150/$160 calls", "AAPL", T)?.spec).toBe("AAPL:2026-12-18:150/160C"));
  it("put spread written low/high → long the higher strike", () => expect(parseOptionStructure("Nov 20 200/210 put spread", "SMH", T)?.spec).toBe("SMH:2026-11-20:210/200P"));
  it("call spread written high/low → long the lower strike", () => expect(parseOptionStructure("Oct 30 230/220 call spread", "NVDA", T)?.spec).toBe("NVDA:2026-10-30:220/230C"));
  it("full month name and decimals", () => expect(parseOptionStructure("November 21 142.5/150 calls", "MU", T)?.spec).toBe("MU:2026-11-21:142.5/150C"));
  it("shares → null", () => expect(parseOptionStructure("Shares", "AAPL", T)).toBeNull());
});
