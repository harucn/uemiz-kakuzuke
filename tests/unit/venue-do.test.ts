import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { secretStrings, type QuestionSet } from "../../src/question-set/model.ts";
import { parseServerFrame, type Intent, type Role, type ServerFrame } from "../../src/venue/protocol.ts";
import { VenueRoom, type RoomContext, type RoomDeps } from "../../src/venue/room.ts";
import { findSecrets } from "../leak.ts";
import { questionSet, venueSet } from "./fixtures.ts";

class FakeSocket {
  readonly sent: string[] = [];
  send(message: string) {
    this.sent.push(message);
  }
  frames(): ServerFrame[] {
    return this.sent.map((raw) => parseServerFrame(raw)!);
  }
}

/** Workers の Response は 101 と webSocket を受け付けるが、Node の Response は受け付けない */
class FakeResponse {
  readonly status: number;
  readonly webSocket: FakeSocket | null;
  constructor(_body: null, init: { status: number; webSocket?: FakeSocket }) {
    this.status = init.status;
    this.webSocket = init.webSocket ?? null;
  }
}

class FakeStorage {
  readonly values = new Map<string, unknown>();
  puts = 0;
  get(key: string) {
    return this.values.get(key);
  }
  put(key: string, value: unknown) {
    this.puts++;
    // 本物の storage と同じく、保存した後に元のオブジェクトを変えても保存値は変わらない
    this.values.set(key, structuredClone(value));
  }
}

class FakeContext {
  readonly sockets: { socket: FakeSocket; tags: string[] }[] = [];
  constructor(readonly kv: FakeStorage) {}
  get storage() {
    return { kv: this.kv };
  }
  acceptWebSocket(socket: FakeSocket, tags: string[]) {
    this.sockets.push({ socket, tags });
  }
  getTags(socket: FakeSocket) {
    return this.sockets.find((s) => s.socket === socket)?.tags ?? [];
  }
  getWebSockets() {
    return this.sockets.map((s) => s.socket);
  }
}

beforeEach(() => {
  vi.stubGlobal("Response", FakeResponse);
  vi.stubGlobal(
    "WebSocketPair",
    class {
      0 = new FakeSocket();
      1 = new FakeSocket();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const deps = (set: QuestionSet, version: string): RoomDeps => ({ set, version, publicVersion: `public-${version}` });

/** 同じ storage の上に会場を作る。デプロイや再起動で DO が作り直されるのと同じ */
function openVenue(kv: FakeStorage, set: QuestionSet = venueSet, version = "v1") {
  const ctx = new FakeContext(kv);
  const room = new VenueRoom(ctx as unknown as RoomContext, deps(set, version));
  const connect = (role: Role | string = "host") => {
    const request = new Request(`https://kakuzuke.test/api/venue?role=${role}`, { headers: { Upgrade: "websocket" } });
    const response = room.fetch(request) as unknown as FakeResponse;
    expect(response.status).toBe(101);
    const server = ctx.sockets.at(-1)!.socket;
    const send = (intent: Intent) => room.webSocketMessage(server as unknown as WebSocket, JSON.stringify(intent));
    return { server, send };
  };
  return { ctx, room, connect };
}

const next = { type: "next" } as const;
const prev = { type: "prev" } as const;
const reveal = { type: "reveal" } as const;

function joinedView(kv: FakeStorage, set?: QuestionSet, version?: string) {
  const { server } = openVenue(kv, set, version).connect("guest");
  const [frame] = server.frames();
  expect(frame.cause).toBe("joined");
  return frame.view;
}

describe("進行状態の保存", () => {
  it("会場を作り直しても状態が残る", () => {
    const kv = new FakeStorage();
    const host = openVenue(kv).connect();
    host.send(next);
    host.send(next);
    host.send(reveal);

    expect(joinedView(kv)).toMatchObject({ phase: "revealed", index: 1, run: 1 });
  });

  it("ルールとランクと景品がある会場は次へで順に進み、作り直しても同じ画面のまま", () => {
    const kv = new FakeStorage();
    const withIntro = { ...venueSet, rules: ["写真を見て当てる"], prizes: [{ rank: "1流", condition: "全問正解", prize: "景品" }] };
    const host = openVenue(kv, withIntro).connect();
    host.send(next);
    expect(joinedView(kv, withIntro)).toEqual({ phase: "rules" });
    host.send(next);
    expect(joinedView(kv, withIntro)).toEqual({ phase: "prizes" });
  });

  it("一度も操作していない会場はタイトル画面", () => {
    expect(joinedView(new FakeStorage())).toEqual({ phase: "title" });
  });

  it("保存した状態が読めないときはタイトル画面", () => {
    for (const broken of ["壊れた値", { version: "v1" }, { version: "v1", state: { phase: "asking", index: -1 } }]) {
      const kv = new FakeStorage();
      kv.values.set("venue", broken);

      expect(joinedView(kv), JSON.stringify(broken)).toEqual({ phase: "title" });
      expect(kv.values.get("venue"), "読めない値はすぐ上書きする").toEqual({ version: "v1", state: { phase: "title" } });
    }
  });
});

describe("問題セットが変わったらタイトル画面に戻す", () => {
  it("問題セットを変えてデプロイするとタイトル画面に戻る", () => {
    const kv = new FakeStorage();
    const host = openVenue(kv).connect();
    for (const intent of [next, next, next, reveal]) host.send(intent);
    const [q1, q2, q3] = venueSet.questions.map((q) => ({ ...q, explanation: `${q.explanation}（改）` }));
    const rewritten = questionSet("書き換えた会", q1, q2, q3);

    const { server } = openVenue(kv, rewritten, "v2").connect("guest");

    expect(server.frames()[0].view).toEqual({ phase: "title" });
    const secrets = [...secretStrings(venueSet), ...secretStrings(rewritten)];
    expect(findSecrets(server.sent.join("\n"), secrets)).toEqual([]);
    expect(kv.values.get("venue"), "すぐ保存する").toEqual({ version: "v2", state: { phase: "title" } });
  });

  it("問題数が減ったセットをデプロイするとタイトル画面に戻る", () => {
    const [q1, q2, q3] = venueSet.questions;
    const five = questionSet("5 問の会", q1, q2, q3, q1, q2);
    const three = questionSet("3 問の会", q1, q2, q3);
    const kv = new FakeStorage();
    const host = openVenue(kv, five, "five").connect();
    for (let i = 0; i < 5; i++) host.send(next);
    expect(host.server.frames().at(-1)!.view).toEqual({ phase: "asking", index: 4 });

    expect(joinedView(kv, three, "three")).toEqual({ phase: "title" });
  });
});

describe("司会の操作だけが進行状態を変える", () => {
  it("参加者としての接続から操作を送っても進行状態は変わらない", () => {
    const kv = new FakeStorage();
    const venue = openVenue(kv);
    for (const role of ["guest", "unknown", ""]) {
      const guest = venue.connect(role);
      guest.send(next);
      guest.send(reveal);
    }

    expect(joinedView(kv)).toEqual({ phase: "title" });
    expect(venue.ctx.sockets.every((s) => s.socket.frames().every((f) => f.cause === "joined"))).toBe(true);
  });

  it("司会の操作で変わった状態を、つながっているすべての画面へ同じフレームで届ける", () => {
    const venue = openVenue(new FakeStorage());
    const guests = [venue.connect("guest"), venue.connect("guest")];
    const host = venue.connect("host");

    host.send(next);

    for (const { server } of [...guests, host]) {
      expect(server.frames().at(-1)).toEqual({ type: "snapshot", cause: "operated", publicVersion: "public-v1", view: { phase: "asking", index: 0 } });
    }
  });

  it("状態が変わらない操作では保存も送信もしない", () => {
    const kv = new FakeStorage();
    const venue = openVenue(kv);
    const guest = venue.connect("guest");
    const host = venue.connect("host");
    const puts = kv.puts;

    host.send(prev);
    host.send(reveal);
    venue.room.webSocketMessage(host.server as unknown as WebSocket, "壊れた入力");

    expect(kv.puts).toBe(puts);
    expect([guest.server.sent.length, host.server.sent.length]).toEqual([1, 1]);
  });
});

describe("接続", () => {
  it("upgrade でない要求には 426 を返す", () => {
    const venue = openVenue(new FakeStorage());
    const response = venue.room.fetch(new Request("https://kakuzuke.test/api/venue?role=host")) as unknown as FakeResponse;

    expect(response.status).toBe(426);
    expect(venue.ctx.sockets).toEqual([]);
  });

  it("つないだ直後に今の状態を joined で送る", () => {
    const kv = new FakeStorage();
    openVenue(kv).connect().send(next);

    const { server } = openVenue(kv).connect("guest");

    expect(server.frames()).toEqual([{ type: "snapshot", cause: "joined", publicVersion: "public-v1", view: { phase: "asking", index: 0 } }]);
  });
});
