import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPIRY_CHECK_EVERY_MS, probeHostSession, reduceGate, watchExpiry, type Gate, type GateEvent, type Probe } from "../../src/host/gate.ts";
import { HOST_SESSION_PATH } from "../../src/venue/protocol.ts";

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

describe("probeHostSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [204, "authorized"],
    [401, "unauthorized"],
    [200, "network"],
    [403, "network"],
    [500, "network"],
    [502, "network"],
  ] as const)("GET の応答が %i なら %s", async (status, probe) => {
    const fetch = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    expect(await probeHostSession()).toBe(probe);
    expect(fetch).toHaveBeenCalledWith(HOST_SESSION_PATH, expect.objectContaining({ method: "GET", cache: "no-store" }));
  });

  it("fetch が失敗したら network", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await probeHostSession()).toBe("network");
  });
});

describe("watchExpiry（useExpiryWatch が lost の間だけ動かす）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 呼ばれるたびに results を順に返す。尽きたら authorized */
  function probeOf(...results: Probe[]) {
    return vi.fn(async (): Promise<Probe> => results.shift() ?? "authorized");
  }

  it("lost になった時点で確かめ、その後も 5 秒ごとに確かめる", async () => {
    const probe = probeOf();
    const onExpired = vi.fn();
    const stop = watchExpiry(probe, onExpired);
    expect(probe, "lost になった時点").toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS - 1);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(probe, "5 秒後").toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS);
    expect(probe, "10 秒後").toHaveBeenCalledTimes(3);
    expect(onExpired).not.toHaveBeenCalled();
    stop();
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS * 4);
    expect(probe, "止めた後は確かめない").toHaveBeenCalledTimes(3);
  });

  it("lost になった時点の確認が 401 なら、すぐ onExpired を呼び、それ以上確かめない", async () => {
    const probe = probeOf("unauthorized");
    const onExpired = vi.fn();
    watchExpiry(probe, onExpired);
    await vi.advanceTimersByTimeAsync(0);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS * 4);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("network では onExpired を呼ばずに確かめ続け、その後の 401 で呼ぶ", async () => {
    const probe = probeOf("network", "network", "unauthorized");
    const onExpired = vi.fn();
    watchExpiry(probe, onExpired);
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("止めた後に返った 401 では onExpired を呼ばない", async () => {
    let answer: (probe: Probe) => void = () => {};
    const probe = vi.fn(() => new Promise<Probe>((resolve) => (answer = resolve)));
    const onExpired = vi.fn();
    const stop = watchExpiry(probe, onExpired);
    stop();
    answer("unauthorized");
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_EVERY_MS * 2);
    expect(onExpired).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
