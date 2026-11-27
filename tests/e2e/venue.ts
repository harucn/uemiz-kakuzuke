import { test, type Page, type Response, type WebSocketRoute } from "@playwright/test";
import { PONG, parseServerFrame, venueUrl, type Intent, type Role, type ServerFrame } from "../../src/venue/protocol.ts";

/** BASE_URL はデプロイ先。そこへ流すときは本番の会場を動かさない */
const remote = process.env.BASE_URL !== undefined;

export function skipIfRemote() {
  test.skip(remote, "BASE_URL の会場は動かさない");
}

export interface VenueClient {
  /** 受け取ったフレームすべて */
  readonly frames: readonly ServerFrame[];
  /** まだ読んでいない次のフレーム */
  next(timeoutMs?: number): Promise<ServerFrame>;
  send(intent: Intent): void;
  close(): void;
}

/** Node の WebSocket で会場につなぐ。届いたフレームは取りこぼさないよう、つないだ時点から溜める */
export function connectVenue(baseURL: string, role: Role): VenueClient {
  const socket = new WebSocket(venueUrl(baseURL, role));
  const frames: ServerFrame[] = [];
  let read = 0;
  let wake: (() => void) | null = null;
  let failure: Error | null = null;
  const fail = (error: Error) => {
    failure ??= error;
    wake?.();
  };
  socket.addEventListener("message", (event) => {
    const frame = typeof event.data === "string" ? parseServerFrame(event.data) : null;
    if (frame === null) return fail(new Error(`読めないフレーム: ${String(event.data)}`));
    frames.push(frame);
    wake?.();
  });
  socket.addEventListener("error", () => fail(new Error(`${role} の接続に失敗した`)));
  socket.addEventListener("close", () => fail(new Error(`${role} の接続が閉じた`)));

  return {
    frames,
    async next(timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (read >= frames.length) {
        if (failure !== null) throw failure;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`${role} に ${timeoutMs}ms 以内にフレームが届かない`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake = null;
      }
      return frames[read++];
    },
    send(intent) {
      socket.send(JSON.stringify(intent));
    },
    close() {
      socket.close();
    },
  };
}

/** 司会としてつなぎ、タイトル画面になるまで前へを送る。テスト専用の口は使わない */
export async function resetVenue(baseURL: string) {
  const host = connectVenue(baseURL, "host");
  const deadline = Date.now() + 5000;
  const left = () => Math.max(1, deadline - Date.now());
  try {
    let frame = await host.next(left());
    while (frame.view.phase !== "title") {
      host.send({ type: "prev" });
      frame = await host.next(left());
    }
  } finally {
    host.close();
  }
}

/** 既存の spec の beforeEach。BASE_URL へ流すときは会場を戻さない */
export async function freshVenue({ baseURL }: { baseURL?: string }) {
  if (!remote) await resetVenue(baseURL!);
}

/** 司会としてつなぎ、つないだ直後のフレームを読み終えたところ */
export async function connectHost(baseURL: string): Promise<VenueClient> {
  const host = connectVenue(baseURL, "host");
  await host.next();
  return host;
}

/** 意図を順に送り、それぞれの結果のフレームを待つ。状態を変えない意図はフレームが届かないので送らない */
export async function operate(host: VenueClient, ...intents: Intent["type"][]): Promise<ServerFrame> {
  let frame: ServerFrame | undefined;
  for (const type of intents) {
    host.send({ type });
    frame = await host.next();
  }
  return frame!;
}

/**
 * ページから会場への接続を中継する。
 * cut はサーバー側から切り、resume まではつなぎ直しを受けたまま会場へ通さない。drop はサーバー側から切るだけでつなぎ直しは通す。
 * reject はつなぎ直しをすぐ閉じる。mute は閉じないまま会場からのフレームを止め、つなぎ直しも会場へ通さない。
 * rewrite は以降に会場から届くテキストのフレームを書き換える
 */
export async function relayVenue(page: Page) {
  let mode: "pass" | "hold" | "reject" = "pass";
  let rewrite: ((frame: string) => string) | null = null;
  let attempts = 0;
  let lastFrame: string | null = null;
  const servers: WebSocketRoute[] = [];
  const muted = new Set<WebSocketRoute>();
  const held: WebSocketRoute[] = [];
  const pass = (ws: WebSocketRoute) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (muted.has(server)) return;
      const sent = rewrite !== null && typeof message === "string" ? rewrite(message) : message;
      if (typeof sent === "string") lastFrame = sent;
      ws.send(sent);
    });
    servers.push(server);
  };
  const closeServers = () => Promise.all(servers.splice(0).map((server) => server.close()));
  await page.routeWebSocket(/\/api\/venue/, (ws) => {
    attempts++;
    if (mode === "reject") void ws.close();
    else if (mode === "hold") held.push(ws);
    else pass(ws);
  });
  return {
    /** 中継が受けた接続の数（つなぎ直しを含む） */
    get attempts() {
      return attempts;
    },
    /** 最後にページへ渡したテキストのフレーム */
    get lastFrame() {
      return lastFrame;
    },
    async cut() {
      mode = "hold";
      await closeServers();
    },
    async drop() {
      await closeServers();
    },
    async reject() {
      mode = "reject";
      await closeServers();
    },
    mute() {
      mode = "hold";
      for (const server of servers) muted.add(server);
    },
    resume() {
      mode = "pass";
      for (const ws of held.splice(0)) pass(ws);
    },
    rewrite(fn: (frame: string) => string) {
      rewrite = fn;
    },
  };
}

export const TEXT_TYPE = /^(text\/|application\/(javascript|json|xml)|application\/[\w.+-]+\+(json|xml)|image\/svg\+xml)/;

/** ページが受け取った HTTP 応答と WebSocket のフレームをすべて記録する。goto より前に呼ぶ */
export function recordTraffic(page: Page) {
  const requests: string[] = [];
  const responses: Response[] = [];
  const bodies: Promise<{ readonly url: string; readonly text: string }>[] = [];
  const frames: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => {
    responses.push(r);
    if (r.status() >= 300 && r.status() < 400) return;
    if (TEXT_TYPE.test(r.headers()["content-type"] ?? "")) bodies.push(r.text().then((text) => ({ url: r.url(), text })));
  });
  page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => frames.push(typeof payload === "string" ? payload : payload.toString("utf8"))));
  return {
    requests,
    responses,
    frames,
    /** 本文がテキストの HTTP 応答 */
    http: () => Promise.all(bodies),
    /** HTTP の本文と WebSocket のフレームを、検査できる文字列の一覧にする */
    async texts(): Promise<{ readonly url: string; readonly text: string }[]> {
      return [...(await Promise.all(bodies)), ...frames.map((text, i) => ({ url: `WebSocket のフレーム ${i + 1}`, text }))];
    },
  };
}

/** revealed 以外の状態が、問題の前後の画面なら {phase}、出題中なら {phase, index} だけを持たないフレームの一覧 */
export function viewShapeProblems(frames: readonly string[]): string[] {
  const allowed: Record<string, string> = { title: "phase", rules: "phase", prizes: "phase", finale: "phase", awards: "phase", asking: "index,phase" };
  return frames.flatMap((raw) => {
    if (raw === PONG) return [];
    let view: Record<string, unknown>;
    try {
      view = (JSON.parse(raw) as { view: Record<string, unknown> }).view;
    } catch {
      return [`読めないフレーム: ${raw}`];
    }
    if (view.phase === "revealed") return [];
    const keys = Object.keys(view).sort().join(",");
    return keys === allowed[String(view.phase)] ? [] : [`${String(view.phase)} の項目が ${keys}: ${raw}`];
  });
}
