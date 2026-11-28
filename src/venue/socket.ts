import { PING, PONG, parseServerFrame, type Intent, type ServerFrame, type VenueView } from "./protocol.ts";

export type Connection = "connecting" | "open" | "lost";

export interface VenueConnection {
  /** 最初のフレームが届くまで null。切断中は最後の値を保つ */
  view: VenueView | null;
  connection: Connection;
  /** 紙吹雪の key */
  celebration: string | null;
}

export interface HostVenueConnection extends VenueConnection {
  operate: ((intent: Intent) => void) | null;
}

type Socket = Pick<WebSocket, "send" | "close" | "onmessage" | "onclose" | "onerror">;
type Timer = ReturnType<typeof setTimeout>;

export type VenueSocketDeps = {
  WebSocket: new (url: string) => Socket;
  document: {
    readonly visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
  setTimeout(fn: () => void, ms: number): Timer;
  clearTimeout(timer: Timer): void;
  random(): number;
  reload(): void;
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  publicVersion: string;
};

export type VenueSocket = {
  snapshot(): HostVenueConnection;
  subscribe(listener: () => void): () => void;
  close(): void;
};

export const FIRST_FRAME_MS = 5_000;
export const PING_EVERY_MS = 15_000;
export const PONG_WITHIN_MS = 3_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 5_000;
const JITTER_MS = 1_000;
export const RELOAD_KEY = "kakuzuke:venue-reload";

type Beat = { kind: "next-ping"; timer: Timer } | { kind: "awaiting-pong"; timer: Timer } | { kind: "paused" };

/** ソケットの段階。idle は購読者がいないとき */
type Link =
  | { phase: "idle" }
  | { phase: "waiting"; timer: Timer }
  | { phase: "attempt"; ws: Socket; timer: Timer }
  | { phase: "live"; ws: Socket; beat: Beat };

/** 購読が 0 になったら初期状態に戻る。それ以外に connecting へ戻る遷移はない。再接続の試行ごとに「再接続中」が点滅しないようにするため */
function nextConnection(event: "frame" | "lost"): Connection {
  return event === "frame" ? "open" : "lost";
}

/** 紙吹雪は司会が操作して正解発表か結果発表の画面にしたときだけ打つ。途中から開いた画面や再接続では打たない */
export function celebrationOf(frame: ServerFrame | null): string | null {
  if (frame?.cause !== "operated") return null;
  const { view } = frame;
  return view.phase === "revealed" ? `${view.index}:${view.run}` : view.phase === "finale" ? "finale" : null;
}

/** 同じ版に対しては 1 回だけ true。記録できない環境では再読み込みの連鎖を避けて false */
function claimReload(storage: VenueSocketDeps["storage"], version: string): boolean {
  try {
    if (storage.getItem(RELOAD_KEY) === version) return false;
    storage.setItem(RELOAD_KEY, version);
    return true;
  } catch {
    return false;
  }
}

export function openVenueSocket(url: string, deps: VenueSocketDeps): VenueSocket {
  const listeners = new Set<() => void>();
  let link: Link = { phase: "idle" };
  let connection: Connection = "connecting";
  let frame: ServerFrame | null = null;
  let failures = 0;

  const operate = (intent: Intent) => {
    if (link.phase === "live") link.ws.send(JSON.stringify(intent));
  };

  const snapshotOf = (): HostVenueConnection => ({
    view: frame?.view ?? null,
    connection,
    celebration: celebrationOf(frame),
    operate: connection === "open" && frame !== null ? operate : null,
  });
  let current = snapshotOf();

  function publish() {
    current = snapshotOf();
    for (const listener of listeners) listener();
  }

  function stopBeat() {
    if (link.phase === "live" && link.beat.kind !== "paused") deps.clearTimeout(link.beat.timer);
  }

  function stopLink() {
    switch (link.phase) {
      case "waiting":
        deps.clearTimeout(link.timer);
        break;
      case "attempt":
      case "live":
        if (link.phase === "attempt") deps.clearTimeout(link.timer);
        stopBeat();
        link.ws.onmessage = link.ws.onclose = link.ws.onerror = null;
        link.ws.close();
        break;
    }
    link = { phase: "idle" };
  }

  function connect() {
    stopLink();
    const ws = new deps.WebSocket(url);
    ws.onmessage = (e) => receive(e.data);
    ws.onclose = ws.onerror = lose;
    link = { phase: "attempt", ws, timer: deps.setTimeout(lose, FIRST_FRAME_MS) };
  }

  function lose() {
    stopLink();
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** failures, BACKOFF_MAX_MS) + deps.random() * JITTER_MS;
    failures++;
    link = { phase: "waiting", timer: deps.setTimeout(connect, delay) };
    const next = nextConnection("lost");
    if (next !== connection) {
      connection = next;
      publish();
    }
  }

  function schedulePing() {
    if (link.phase !== "live") return;
    stopBeat();
    link.beat =
      deps.document.visibilityState === "visible"
        ? { kind: "next-ping", timer: deps.setTimeout(ping, PING_EVERY_MS) }
        : { kind: "paused" };
  }

  function ping() {
    if (link.phase !== "live") return;
    stopBeat();
    link.ws.send(PING);
    link.beat = { kind: "awaiting-pong", timer: deps.setTimeout(lose, PONG_WITHIN_MS) };
  }

  function receive(data: unknown) {
    if (data === PONG) {
      if (link.phase === "live" && link.beat.kind === "awaiting-pong") schedulePing();
      return;
    }
    if (typeof data !== "string") return;
    const parsed = parseServerFrame(data);
    if (parsed === null) return;
    if (link.phase === "attempt") {
      deps.clearTimeout(link.timer);
      link = { phase: "live", ws: link.ws, beat: { kind: "paused" } };
      failures = 0;
      schedulePing();
    }
    if (parsed.publicVersion === deps.publicVersion) {
      frame = parsed;
    } else {
      frame = null;
      if (claimReload(deps.storage, parsed.publicVersion)) deps.reload();
    }
    connection = nextConnection("frame");
    publish();
  }

  function onVisibility() {
    if (deps.document.visibilityState !== "visible") {
      if (link.phase === "live") {
        stopBeat();
        link.beat = { kind: "paused" };
      }
      return;
    }
    if (link.phase === "waiting") connect();
    else if (link.phase === "live") ping();
  }

  /** 購読し直したとき（ログインし直したときなど）に、前の問題・「再接続中」・上限まで伸びたバックオフを持ち越さない */
  function close() {
    deps.document.removeEventListener("visibilitychange", onVisibility);
    stopLink();
    connection = "connecting";
    frame = null;
    failures = 0;
    current = snapshotOf();
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      if (link.phase === "idle") {
        deps.document.addEventListener("visibilitychange", onVisibility);
        connect();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) close();
      };
    },
    close,
  };
}
