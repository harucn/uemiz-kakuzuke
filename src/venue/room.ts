import { z } from "zod";
import { deckOf } from "../deck/cursor.ts";
import type { QuestionSet } from "../question-set/model.ts";
import { step, TITLE, type VenueState } from "./machine.ts";
import { parseIntent, type Role, type ServerFrame } from "./protocol.ts";
import { viewOf } from "./view.ts";

const STATE_KEY = "venue";

const index = z.number().int().nonnegative();
const StoredSchema = z.strictObject({
  /** 正解込みの問題セットの版 */
  version: z.string(),
  state: z.discriminatedUnion("phase", [
    z.strictObject({ phase: z.literal("title") }),
    z.strictObject({ phase: z.literal("rules") }),
    z.strictObject({ phase: z.literal("prizes") }),
    z.strictObject({ phase: z.literal("asking"), index }),
    z.strictObject({ phase: z.literal("revealed"), index, run: z.number().int().positive() }),
  ]),
});
type Stored = { readonly version: string; readonly state: VenueState };

export type RoomContext = Pick<DurableObjectState, "acceptWebSocket" | "getTags" | "getWebSockets"> & {
  readonly storage: { readonly kv: Pick<SyncKvStorage, "get" | "put"> };
};

export type RoomDeps = {
  readonly set: QuestionSet;
  /** 正解込みの版。保存した状態との照合にだけ使い、フレームには載せない */
  readonly version: string;
  readonly publicVersion: string;
};

/** Venue（Durable Object）の中身。virtual module と cloudflare:workers を読まないので、偽の ctx で単体テストできる */
export class VenueRoom {
  readonly #ctx: RoomContext;
  readonly #deps: RoomDeps;
  #state: VenueState;

  constructor(ctx: RoomContext, deps: RoomDeps) {
    this.#ctx = ctx;
    this.#deps = deps;
    const stored = StoredSchema.safeParse(ctx.storage.kv.get(STATE_KEY));
    // 読めない値と、別の問題セットで作った状態はタイトル画面に戻す（venue-sync spec）
    if (stored.success && stored.data.version === deps.version) {
      this.#state = stored.data.state;
    } else {
      this.#state = TITLE;
      this.#save();
    }
  }

  fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") return new Response(null, { status: 426 });
    const role: Role = new URL(request.url).searchParams.get("role") === "host" ? "host" : "guest";
    const [client, server] = Object.values(new WebSocketPair());
    this.#ctx.acceptWebSocket(server, [role]);
    server.send(this.#frame("joined"));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    if (!this.#ctx.getTags(ws).includes("host")) return;
    const intent = parseIntent(data);
    if (intent === null) return;
    const next = step(this.#state, intent, deckOf(this.#deps.set));
    if (next === this.#state) return;
    this.#state = next;
    this.#save();
    const frame = this.#frame("operated");
    for (const socket of this.#ctx.getWebSockets()) socket.send(frame);
  }

  #save(): void {
    this.#ctx.storage.kv.put(STATE_KEY, { version: this.#deps.version, state: this.#state } satisfies Stored);
  }

  #frame(cause: ServerFrame["cause"]): string {
    const frame: ServerFrame = {
      type: "snapshot",
      cause,
      publicVersion: this.#deps.publicVersion,
      view: viewOf(this.#state, this.#deps.set),
    };
    return JSON.stringify(frame);
  }
}
