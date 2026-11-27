import { useCallback, useEffect, useReducer } from "react";
import { HOST_SESSION_PATH } from "../venue/protocol.ts";
import type { Connection } from "../venue/socket.ts";

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

/** 応答が返らないまま止まると「再接続中」もログインの失敗も出せないので、ソケットの最初のフレームと同じ 5 秒で打ち切って network にする */
const REQUEST_TIMEOUT_MS = 5_000;
export const EXPIRY_CHECK_EVERY_MS = 5_000;
const RECHECK_BASE_MS = 1_000;
const RECHECK_MAX_MS = 5_000;

async function request(init: RequestInit): Promise<number | null> {
  try {
    const response = await fetch(HOST_SESSION_PATH, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return response.status;
  } catch {
    return null;
  }
}

export async function probeHostSession(): Promise<Probe> {
  const status = await request({ method: "GET" });
  return status === 204 ? "authorized" : status === 401 ? "unauthorized" : "network";
}

async function postLogin(password: string): Promise<"ok" | "wrong" | "network"> {
  const status = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  return status === 204 ? "ok" : status === 401 ? "wrong" : "network";
}

export function useHostGate(): { gate: Gate; login(password: string): Promise<void>; expire(): void } {
  const [gate, dispatch] = useReducer(reduceGate, { kind: "checking", failures: 0 });
  const failures = gate.kind === "checking" ? gate.failures : null;
  useEffect(() => {
    if (failures === null) return;
    let stopped = false;
    const timer = setTimeout(
      () =>
        void probeHostSession().then((result) => {
          if (!stopped) dispatch({ type: "probed", result });
        }),
      failures === 0 ? 0 : Math.min(RECHECK_BASE_MS * 2 ** (failures - 1), RECHECK_MAX_MS),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [failures]);
  const login = useCallback(async (password: string) => dispatch({ type: "login", result: await postLogin(password) }), []);
  const expire = useCallback(() => dispatch({ type: "expired" }), []);
  return { gate, login, expire };
}

/** すぐ確かめ、unauthorized でなければ 5 秒後にまた確かめる。返す関数で止める */
export function watchExpiry(probe: () => Promise<Probe>, onExpired: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () =>
    void probe().then((result) => {
      if (stopped) return;
      if (result === "unauthorized") onExpired();
      else timer = setTimeout(check, EXPIRY_CHECK_EVERY_MS);
    });
  check();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** connection が "lost" になった時点で GET HOST_SESSION_PATH し、その後も lost の間は 5 秒ごとに確かめる。
 *  unauthorized なら onExpired。network は無視する（会場が落ちているだけのときに入力欄へ戻さない） */
export function useExpiryWatch(connection: Connection, onExpired: () => void): void {
  const lost = connection === "lost";
  useEffect(() => (lost ? watchExpiry(probeHostSession, onExpired) : undefined), [lost, onExpired]);
}
