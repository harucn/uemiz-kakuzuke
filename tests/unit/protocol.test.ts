import { describe, expect, it } from "vitest";
import { parseIntent, parseServerFrame, venueUrl } from "../../src/venue/protocol.ts";

const reveal = { headline: "正解は A", explanation: "解説", options: [{ label: "A", correct: true }] };
const frame = (view: unknown, rest: object = {}) =>
  JSON.stringify({ type: "snapshot", cause: "joined", publicVersion: "v", view, ...rest });

describe("parseIntent", () => {
  it("次へ・前へ・正解発表を読む", () => {
    for (const type of ["next", "prev", "reveal"] as const) {
      expect(parseIntent(JSON.stringify({ type }))).toEqual({ type });
    }
  });

  it.each([
    ["JSON でない", "next"],
    ["未知の種類", JSON.stringify({ type: "jump" })],
    ["余計な項目", JSON.stringify({ type: "next", index: 3 })],
    ["オブジェクトでない", JSON.stringify("next")],
    ["null", "null"],
  ])("壊れた入力は null にする（%s）", (_, raw) => {
    expect(parseIntent(raw)).toBeNull();
  });

  it("バイナリのフレームは null にする", () => {
    expect(parseIntent(new TextEncoder().encode(JSON.stringify({ type: "next" })).buffer)).toBeNull();
  });
});

describe("parseServerFrame", () => {
  it("5 種類の画面の状態を読む", () => {
    for (const view of [{ phase: "title" }, { phase: "rules" }, { phase: "prizes" }, { phase: "asking", index: 2 }, { phase: "revealed", index: 1, run: 2, reveal }]) {
      expect(parseServerFrame(frame(view))?.view).toEqual(view);
    }
  });

  it.each([
    ["JSON でない", "{"],
    ["タイトル画面に問題番号", frame({ phase: "title", index: 0 })],
    ["ルール画面に問題番号", frame({ phase: "rules", index: 0 })],
    ["ランクと景品の画面に問題番号", frame({ phase: "prizes", index: 0 })],
    ["出題中に正解情報", frame({ phase: "asking", index: 0, reveal })],
    ["正解発表に正解情報がない", frame({ phase: "revealed", index: 0, run: 1 })],
    ["正解情報に余計な項目", frame({ phase: "revealed", index: 0, run: 1, reveal: { ...reveal, extra: 1 } })],
    ["負の問題番号", frame({ phase: "asking", index: -1 })],
    ["未知の画面", frame({ phase: "ended" })],
    ["未知の cause", frame({ phase: "title" }, { cause: "reset" })],
    ["版がない", JSON.stringify({ type: "snapshot", cause: "joined", view: { phase: "title" } })],
  ])("壊れた入力は null にする（%s）", (_, raw) => {
    expect(parseServerFrame(raw)).toBeNull();
  });
});

describe("venueUrl", () => {
  it("http は ws、https は wss で会場の入口につなぐ", () => {
    expect(venueUrl("http://localhost:4173", "host")).toBe("ws://localhost:4173/api/venue?role=host");
    expect(venueUrl("https://example.com", "guest")).toBe("wss://example.com/api/venue?role=guest");
  });
});
