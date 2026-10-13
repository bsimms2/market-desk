import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePayload } from "../src";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sample = JSON.parse(readFileSync(root + "scripts/sample-payload.json", "utf8"));

describe("validatePayload", () => {
  it("accepts the sample payload", () => expect(validatePayload(sample)).toMatchObject({ ok: true }));
  it("rejects lowercase tickers and missing fields", () => {
    const bad = structuredClone(sample);
    bad.ideas[0].ticker = "spy";
    delete bad.ideas[0].invalidation;
    const r = validatePayload(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/ticker[\s\S]*invalidation/);
  });
  it("evening recap may not add ideas", () => {
    const bad = structuredClone(sample);
    bad.briefing.kind = "swing_evening";
    expect(validatePayload(bad).ok).toBe(false);
  });
  it("prices must be positive", () => {
    const bad = { ...structuredClone(sample), prices: [{ ticker: "AAPL", price: 0, on: "2026-10-14" }] };
    expect(validatePayload(bad).ok).toBe(false);
  });
  it("edge function copy matches", () => {
    const a = readFileSync(root + "packages/desk/src/payload.ts", "utf8");
    const b = readFileSync(root + "supabase/functions/agent-api/payload.ts", "utf8");
    expect(b).toBe(a);
  });
});
