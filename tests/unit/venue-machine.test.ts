import { describe, expect, it } from "vitest";
import type { Deck } from "../../src/deck/cursor.ts";
import { step, TITLE, type VenueState } from "../../src/venue/machine.ts";
import type { Intent } from "../../src/venue/protocol.ts";

const TOTAL = 3;
const DECK: Deck = { total: TOTAL, intro: [], outro: ["finale"] };
const WITH_INTRO: Deck = { total: TOTAL, intro: ["rules", "prizes"], outro: ["finale", "awards"] };
const RULES: VenueState = { phase: "rules" };
const PRIZES: VenueState = { phase: "prizes" };
const FINALE: VenueState = { phase: "finale" };
const AWARDS: VenueState = { phase: "awards" };

function run(intents: readonly Intent[], from: VenueState = TITLE, deck: Deck = DECK): VenueState {
  return intents.reduce((s, i) => step(s, i, deck), from);
}

const next = { type: "next" } as const;
const prev = { type: "prev" } as const;
const reveal = { type: "reveal" } as const;
const asking = (index: number): VenueState => ({ phase: "asking", index });

describe("前後の画面への移動", () => {
  it("タイトル画面で次へを押すと第 1 問を発表前の状態で表示する", () => {
    expect(run([next])).toEqual({ phase: "asking", index: 0 });
  });

  it("第 1 問で前へを押すとタイトル画面に戻る", () => {
    expect(run([prev], asking(0))).toEqual({ phase: "title" });
    expect(run([reveal, prev], asking(0))).toEqual({ phase: "title" });
  });

  it("タイトル画面で前へを押してもタイトル画面のままで、同じオブジェクトを返す", () => {
    expect(step(TITLE, prev, DECK)).toBe(TITLE);
  });

  it("次へで次の問題を発表前の状態で表示する", () => {
    expect(run([next], asking(0))).toEqual({ phase: "asking", index: 1 });
  });

  it("前へで前の問題を発表前の状態で表示する", () => {
    expect(run([prev], asking(1))).toEqual({ phase: "asking", index: 0 });
  });

  it("最終問の正解発表の次は結果発表の画面、前へで最終問の発表前に戻る", () => {
    expect(run([reveal, next], asking(TOTAL - 1))).toEqual(FINALE);
    expect(run([prev], FINALE)).toEqual(asking(TOTAL - 1));
  });

  it("ランクと景品があると結果発表の次にもう一度ランクと景品の画面を出す", () => {
    expect(run([next], FINALE, WITH_INTRO)).toEqual(AWARDS);
    expect(run([prev], AWARDS, WITH_INTRO)).toEqual(FINALE);
  });

  it("並びの最後の画面で次へを押しても動かず、同じオブジェクトを返す", () => {
    expect(step(FINALE, next, DECK)).toBe(FINALE);
    expect(step(AWARDS, next, WITH_INTRO)).toBe(AWARDS);
  });

  it("正解発表後に移動して戻ると発表前に戻る", () => {
    expect(run([reveal, next, prev], asking(0))).toEqual({ phase: "asking", index: 0 });
  });

  it("ルールとランクと景品があるとタイトル画面と第 1 問の間にその順で挟む", () => {
    expect(run([next], TITLE, WITH_INTRO)).toEqual(RULES);
    expect(run([next, next], TITLE, WITH_INTRO)).toEqual(PRIZES);
    expect(run([next, next, next], TITLE, WITH_INTRO)).toEqual({ phase: "asking", index: 0 });
    expect(run([prev], asking(0), WITH_INTRO)).toEqual(PRIZES);
    expect(run([reveal, prev], asking(0), WITH_INTRO)).toEqual(PRIZES);
    expect(run([prev, prev], PRIZES, WITH_INTRO)).toEqual(TITLE);
  });

  it("正解発表後の移動先は発表前の状態", () => {
    expect(run([reveal, next], asking(1))).toEqual({ phase: "asking", index: 2 });
    expect(run([reveal, prev], asking(1))).toEqual({ phase: "asking", index: 0 });
  });
});

describe("正解発表", () => {
  it("タイトル画面での正解発表は無視し、同じオブジェクトを返す", () => {
    expect(step(TITLE, reveal, DECK)).toBe(TITLE);
  });

  it("ルール画面とランクと景品の画面での正解発表は無視し、同じオブジェクトを返す", () => {
    expect(step(RULES, reveal, WITH_INTRO)).toBe(RULES);
    expect(step(PRIZES, reveal, WITH_INTRO)).toBe(PRIZES);
    expect(step(FINALE, reveal, WITH_INTRO)).toBe(FINALE);
    expect(step(AWARDS, reveal, WITH_INTRO)).toBe(AWARDS);
  });

  it("発表前に正解発表を押すと run 1 で発表する", () => {
    expect(run([reveal], asking(1))).toEqual({ phase: "revealed", index: 1, run: 1 });
  });

  it("正解発表をもう一度押すと run が 1 ずつ増え、問題は変わらない", () => {
    expect(run([reveal, reveal], asking(1))).toEqual({ phase: "revealed", index: 1, run: 2 });
    expect(run([reveal, reveal, reveal], asking(1))).toEqual({ phase: "revealed", index: 1, run: 3 });
  });
});
