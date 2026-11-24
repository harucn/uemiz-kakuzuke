import { z } from "zod";

export const VENUE_PATH = "/api/venue";
export const VENUE_NAME = "venue";
/** DO の自動応答とクライアントで共有する */
export const PING = "ping";
export const PONG = "pong";

export type Role = "host" | "guest";

const IntentSchema = z.strictObject({ type: z.enum(["next", "prev", "reveal"]) });
export type Intent = z.infer<typeof IntentSchema>;

const RevealedOptionSchema = z
  .strictObject({
    label: z.enum(["A", "B", "C"]),
    correct: z.boolean(),
  })
  .readonly();
export type RevealedOption = z.infer<typeof RevealedOptionSchema>;

const RevealViewSchema = z
  .strictObject({
    headline: z.string(),
    explanation: z.string(),
    /** 表示順。公開形の options と添字で対応する */
    options: z.array(RevealedOptionSchema).readonly(),
  })
  .readonly();
export type RevealView = z.infer<typeof RevealViewSchema>;

const index = z.number().int().nonnegative();

/** 正解を置けるのは revealed の reveal だけ */
const VenueViewSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("title") }),
  z.strictObject({ phase: z.literal("rules") }),
  z.strictObject({ phase: z.literal("prizes") }),
  z.strictObject({ phase: z.literal("asking"), index }),
  z.strictObject({ phase: z.literal("revealed"), index, run: z.number().int().positive(), reveal: RevealViewSchema }),
]);
export type VenueView = z.infer<typeof VenueViewSchema>;

const ServerFrameSchema = z.strictObject({
  type: z.literal("snapshot"),
  cause: z.enum(["joined", "operated"]),
  /** 公開形の問題セットのハッシュ */
  publicVersion: z.string(),
  view: VenueViewSchema,
});
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

function parseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/** 意図はテキストのフレームでしか送らないので、バイナリは壊れた入力として捨てる */
export function parseIntent(raw: string | ArrayBuffer): Intent | null {
  return typeof raw === "string" ? parseJson(IntentSchema, raw) : null;
}

export function parseServerFrame(raw: string): ServerFrame | null {
  return parseJson(ServerFrameSchema, raw);
}

export function venueUrl(origin: string, role: Role): string {
  const url = new URL(VENUE_PATH, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", role);
  return url.toString();
}
