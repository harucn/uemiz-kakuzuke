import { describe, expect, it } from "vitest";
import { reduceGate, type Gate, type GateEvent } from "../../src/host/gate.ts";

const STATES: readonly Gate[] = [
  { kind: "checking", failures: 0 },
  { kind: "checking", failures: 2 },
  { kind: "locked", error: null },
  { kind: "locked", error: "wrong" },
  { kind: "locked", error: "network" },
  { kind: "open" },
];

const EVENTS: readonly GateEvent[] = [
  { type: "probed", result: "authorized" },
  { type: "probed", result: "unauthorized" },
  { type: "probed", result: "network" },
  { type: "login", result: "ok" },
  { type: "login", result: "wrong" },
  { type: "login", result: "network" },
  { type: "expired" },
];

/** 遷移表の行。表にない組は現状維持 */
function inTable(gate: Gate, event: GateEvent): boolean {
  return (
    (gate.kind === "checking" && event.type === "probed") ||
    (gate.kind === "locked" && event.type === "login") ||
    (gate.kind === "open" && event.type === "expired")
  );
}

describe("reduceGate", () => {
  it.each([0, 2])("checking(%i) で probed authorized なら open になる", (failures) => {
    expect(reduceGate({ kind: "checking", failures }, { type: "probed", result: "authorized" })).toEqual({ kind: "open" });
  });

  it.each([0, 2])("checking(%i) で probed unauthorized なら locked(null) になる", (failures) => {
    expect(reduceGate({ kind: "checking", failures }, { type: "probed", result: "unauthorized" })).toEqual({ kind: "locked", error: null });
  });

  it.each([0, 2])("checking(%i) で probed network なら failures を 1 増やした checking になる", (failures) => {
    expect(reduceGate({ kind: "checking", failures }, { type: "probed", result: "network" })).toEqual({ kind: "checking", failures: failures + 1 });
  });

  it.each([null, "wrong", "network"] as const)("locked(%s) で login ok なら open になる", (error) => {
    expect(reduceGate({ kind: "locked", error }, { type: "login", result: "ok" })).toEqual({ kind: "open" });
  });

  it.each([null, "wrong", "network"] as const)("locked(%s) で login wrong なら locked(wrong) になる", (error) => {
    expect(reduceGate({ kind: "locked", error }, { type: "login", result: "wrong" })).toEqual({ kind: "locked", error: "wrong" });
  });

  it.each([null, "wrong", "network"] as const)("locked(%s) で login network なら locked(network) になる", (error) => {
    expect(reduceGate({ kind: "locked", error }, { type: "login", result: "network" })).toEqual({ kind: "locked", error: "network" });
  });

  it("open で expired なら locked(null) になる", () => {
    expect(reduceGate({ kind: "open" }, { type: "expired" })).toEqual({ kind: "locked", error: null });
  });

  const outside = STATES.flatMap((gate) => EVENTS.filter((event) => !inTable(gate, event)).map((event) => [JSON.stringify(gate), JSON.stringify(event), gate, event] as const));

  it("表にない組を 6 × 7 から表の 16 組を除いた 26 通り確かめる", () => {
    expect(outside).toHaveLength(26);
  });

  it.each(outside)("表にない組 %s × %s では状態が変わらない", (_, __, gate, event) => {
    expect(reduceGate(gate, event)).toBe(gate);
  });
});
