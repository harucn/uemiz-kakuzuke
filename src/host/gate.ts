export type Gate =
  | { readonly kind: "checking"; readonly failures: number } // SSR・確認中。failures > 0 なら「再接続中」を出して確認し直す
  | { readonly kind: "locked"; readonly error: null | "wrong" | "network" }
  | { readonly kind: "open" };

export type GateEvent =
  | { readonly type: "probed"; readonly result: Probe }
  | { readonly type: "login"; readonly result: "ok" | "wrong" | "network" }
  | { readonly type: "expired" };

/** GET HOST_SESSION_PATH の結果。204 だけが authorized、401 だけが unauthorized、それ以外の状態と fetch の失敗は network */
export type Probe = "authorized" | "unauthorized" | "network";

/** 純粋。遷移表にない組は現状維持 */
export function reduceGate(gate: Gate, event: GateEvent): Gate {
  switch (gate.kind) {
    case "checking":
      if (event.type !== "probed") return gate;
      if (event.result === "authorized") return { kind: "open" };
      if (event.result === "unauthorized") return { kind: "locked", error: null };
      return { kind: "checking", failures: gate.failures + 1 };
    case "locked":
      if (event.type !== "login") return gate;
      return event.result === "ok" ? { kind: "open" } : { kind: "locked", error: event.result };
    case "open":
      return event.type === "expired" ? { kind: "locked", error: null } : gate;
  }
}
