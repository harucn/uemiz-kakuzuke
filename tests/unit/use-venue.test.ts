import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PING, PONG, type ServerFrame, type VenueView } from "../../src/venue/protocol.ts";
import {
  FIRST_FRAME_MS,
  PING_EVERY_MS,
  PONG_WITHIN_MS,
  openVenueSocket,
  type VenueSocketDeps,
} from "../../src/venue/socket.ts";

const VERSION = "v1";
const URL = "ws://localhost/api/venue?role=host";

const ASKING: VenueView = { phase: "asking", index: 2 };
const REVEALED: VenueView = {
  phase: "revealed",
  index: 2,
  run: 1,
  reveal: { headline: "正解は A", explanation: "", options: [] },
};

function frame(view: VenueView, cause: ServerFrame["cause"] = "joined", publicVersion = VERSION): string {
  return JSON.stringify({ type: "snapshot", cause, publicVersion, view } satisfies ServerFrame);
}

class FakeStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function setup(options: { random?: number; storage?: FakeStorage } = {}) {
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    readonly sent: string[] = [];
    closed = false;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      sockets.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
    receive(data: unknown) {
      this.onmessage?.({ data });
    }
    drop() {
      this.onclose?.();
    }
  }
  const visibility = new Set<() => void>();
  const document = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: "visibilitychange", fn: () => void) => void visibility.add(fn),
    removeEventListener: (_: "visibilitychange", fn: () => void) => void visibility.delete(fn),
  };
  const reload = vi.fn();
  const storage = options.storage ?? new FakeStorage();
  const deps: VenueSocketDeps = {
    WebSocket: FakeSocket,
    document,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (timer) => clearTimeout(timer),
    random: () => options.random ?? 0,
    reload,
    storage,
    publicVersion: VERSION,
  };
  const venue = openVenueSocket(URL, deps);
  return {
    venue,
    sockets,
    reload,
    storage,
    last: () => sockets[sockets.length - 1],
    setVisibility(state: DocumentVisibilityState) {
      document.visibilityState = state;
      for (const fn of visibility) fn();
    },
    open() {
      const unsubscribe = venue.subscribe(() => {});
      return unsubscribe;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openVenueSocket", () => {
  it("subscribe するまでソケットを開かない", () => {
    const t = setup();
    expect(t.sockets).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(0);
    t.open();
    expect(t.sockets).toHaveLength(1);
    expect(t.last().url).toBe(URL);
  });

  it("最初のフレームまでは connecting で operate は null、フレームを受け取ると open になる", () => {
    const t = setup();
    t.open();
    expect(t.venue.snapshot()).toMatchObject({ view: null, connection: "connecting", operate: null });
    t.last().receive("{壊れた");
    t.last().receive(JSON.stringify({ type: "snapshot" }));
    expect(t.venue.snapshot().connection).toBe("connecting");
    t.last().receive(frame(ASKING));
    const snap = t.venue.snapshot();
    expect(snap).toMatchObject({ view: ASKING, connection: "open" });
    expect(snap.operate).toBeTypeOf("function");
    expect(t.venue.snapshot()).toBe(snap);
  });

  it("operate は意図を JSON で送る", () => {
    const t = setup();
    t.open();
    t.last().receive(frame(ASKING));
    t.venue.snapshot().operate!({ type: "next" });
    expect(t.last().sent).toEqual([JSON.stringify({ type: "next" })]);
  });

  it("5 秒たってもフレームが届かなければ lost になり、再接続しても connecting へ戻らない", () => {
    const t = setup();
    t.open();
    vi.advanceTimersByTime(FIRST_FRAME_MS - 1);
    expect(t.venue.snapshot().connection).toBe("connecting");
    vi.advanceTimersByTime(1);
    expect(t.venue.snapshot().connection).toBe("lost");
    expect(t.sockets[0].closed).toBe(true);
    vi.advanceTimersToNextTimer();
    expect(t.sockets).toHaveLength(2);
    expect(t.venue.snapshot().connection).toBe("lost");
    t.last().receive(frame(ASKING));
    expect(t.venue.snapshot().connection).toBe("open");
  });

  it("切断すると lost になり view は最後の値を保つ。lost の間の操作は再接続後にも送られない", () => {
    const t = setup();
    t.open();
    t.last().receive(frame(ASKING));
    const stale = t.venue.snapshot().operate!;
    t.last().drop();
    expect(t.venue.snapshot()).toMatchObject({ view: ASKING, connection: "lost", operate: null });
    stale({ type: "next" });
    expect(t.sockets[0].sent).toEqual([]);
    vi.advanceTimersToNextTimer();
    expect(t.sockets).toHaveLength(2);
    t.last().receive(frame(ASKING));
    expect(t.last().sent).toEqual([]);
  });

  it("揺らぎ付きの指数バックオフで再接続し、上限は 5 秒に揺らぎを足した値である", () => {
    const t = setup({ random: 0.5 });
    t.open();
    const delays = [1000, 1500, 2500, 4500, 5500, 5500];
    for (const [i, delay] of delays.entries()) {
      t.last().drop();
      vi.advanceTimersByTime(delay - 1);
      expect(t.sockets, `${i + 1} 回目の再接続は ${delay}ms より前に始まらない`).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(t.sockets, `${i + 1} 回目の再接続は ${delay}ms で始まる`).toHaveLength(i + 2);
    }
  });

  it("15 秒ごとに ping を送り、3 秒以内に pong がなければ閉じて再接続する", () => {
    const t = setup();
    t.open();
    const ws = t.last();
    ws.receive(frame(ASKING));
    vi.advanceTimersByTime(PING_EVERY_MS - 1);
    expect(ws.sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ws.sent).toEqual([PING]);
    ws.receive(PONG);
    vi.advanceTimersByTime(PING_EVERY_MS);
    expect(ws.sent).toEqual([PING, PING]);
    vi.advanceTimersByTime(PONG_WITHIN_MS - 1);
    expect(ws.closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(ws.closed).toBe(true);
    expect(t.venue.snapshot().connection).toBe("lost");
    vi.advanceTimersToNextTimer();
    expect(t.sockets).toHaveLength(2);
  });

  it("pong はフレームとして数えない", () => {
    const t = setup();
    t.open();
    t.last().receive(PONG);
    expect(t.venue.snapshot().connection).toBe("connecting");
    vi.advanceTimersByTime(FIRST_FRAME_MS);
    expect(t.venue.snapshot().connection).toBe("lost");
    vi.advanceTimersToNextTimer();
    t.last().receive(PONG);
    expect(t.venue.snapshot().connection).toBe("lost");
  });

  it("隠れている間は ping せず、表示に戻ると開いていればすぐ ping で確かめる", () => {
    const t = setup();
    t.open();
    const ws = t.last();
    ws.receive(frame(ASKING));
    t.setVisibility("hidden");
    vi.advanceTimersByTime(PING_EVERY_MS * 2);
    expect(ws.sent).toEqual([]);
    t.setVisibility("visible");
    expect(ws.sent).toEqual([PING]);
    vi.advanceTimersByTime(PONG_WITHIN_MS);
    expect(ws.closed).toBe(true);
  });

  it("表示に戻ったときに閉じていれば、バックオフを待たずにすぐ再接続する", () => {
    const t = setup({ random: 0.9 });
    t.open();
    t.last().drop();
    t.setVisibility("hidden");
    t.setVisibility("visible");
    expect(t.sockets).toHaveLength(2);
  });

  it("celebration は operated の結果発表の画面で finale になり、途中から開いたときは null", () => {
    const t = setup();
    t.open();
    t.last().receive(frame({ phase: "finale" }, "joined"));
    expect(t.venue.snapshot().celebration).toBeNull();
    t.last().receive(frame({ phase: "finale" }, "operated"));
    expect(t.venue.snapshot().celebration).toBe("finale");
    t.last().receive(frame({ phase: "awards" }, "operated"));
    expect(t.venue.snapshot().celebration).toBeNull();
  });

  it("celebration は operated かつ revealed のときだけ `${index}:${run}` になる", () => {
    const t = setup();
    t.open();
    t.last().receive(frame(REVEALED, "joined"));
    expect(t.venue.snapshot().celebration).toBeNull();
    t.last().receive(frame(REVEALED, "operated"));
    expect(t.venue.snapshot().celebration).toBe("2:1");
    t.last().receive(frame({ ...REVEALED, run: 2 }, "operated"));
    expect(t.venue.snapshot().celebration).toBe("2:2");
    t.last().receive(frame(ASKING, "operated"));
    expect(t.venue.snapshot().celebration).toBeNull();
  });

  it("publicVersion が違えば 1 回だけ再読み込みし、2 回目は再読み込みせず view は null のままである", () => {
    const first = setup();
    first.open();
    first.last().receive(frame(ASKING, "joined", "v2"));
    expect(first.reload).toHaveBeenCalledTimes(1);
    expect(first.venue.snapshot().view).toBeNull();

    const second = setup({ storage: first.storage });
    second.open();
    second.last().receive(frame(ASKING, "joined", "v2"));
    expect(second.reload).not.toHaveBeenCalled();
    expect(second.venue.snapshot()).toMatchObject({ view: null, operate: null });

    second.last().receive(frame(ASKING, "joined", "v3"));
    expect(second.reload).toHaveBeenCalledTimes(1);
  });

  it("最後の購読をやめるとソケットを閉じ、タイマーも止める", () => {
    const t = setup();
    const unsubscribe = t.open();
    unsubscribe();
    expect(t.sockets[0].closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
  });
});
