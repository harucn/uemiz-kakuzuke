import { describe, expect, expectTypeOf, it } from "vitest";
import { step } from "../../src/venue/machine.ts";
import { revealView } from "../../src/venue/view.ts";
import type { Question } from "../../src/question-set/model.ts";
import { imageUrl } from "./fixtures.ts";

const pick: Question = {
  mode: "pick",
  title: "ワイン",
  description: "高いワインはどちら？",
  explanation: "B は 1本 5万円のボルドー。",
  options: [
    { label: "A", image: imageUrl("/images/aaa.jpg"), note: "チリ産の赤ワイン", rank: 2 },
    { label: "B", image: imageUrl("/images/bbb.jpg"), note: "フランス産の赤ワイン", rank: 1 },
  ],
};

const order: Question = {
  mode: "order",
  title: "牛肉",
  description: "高い順に並べよ",
  explanation: "A が A5 ランク。",
  options: [
    { label: "A", image: imageUrl("/images/ccc.jpg"), note: "霜降りの牛肉", rank: 1 },
    { label: "B", image: imageUrl("/images/ddd.jpg"), note: "赤身の牛肉", rank: 3 },
    { label: "C", image: imageUrl("/images/eee.jpg"), note: "脂の多い牛肉", rank: 2 },
  ],
};

describe("pick の正解発表", () => {
  it("pick で正解の選択肢だけを正解の見た目にする", () => {
    const options = revealView(pick).options;
    expect(options.map((o) => [o.label, o.correct])).toEqual([
      ["A", false],
      ["B", true],
    ]);
  });


  it("pick の正解発表で正解ラベルと解説を表示する", () => {
    const view = revealView(pick);
    expect(view.headline).toBe("正解は B");
    expect(view.explanation).toBe("B は 1本 5万円のボルドー。");
  });
});

describe("order の正解発表", () => {
  it("order の正解発表で 1 位の選択肢だけを正解の見た目にする", () => {
    expect(revealView(order).options.map((o) => [o.label, o.correct])).toEqual([
      ["A", true],
      ["B", false],
      ["C", false],
    ]);
  });


  it("order の正解発表で正解の並びと解説を表示する", () => {
    const view = revealView(order);
    expect(view.headline).toBe("正解は A → C → B");
    expect(view.explanation).toBe("A が A5 ランク。");
  });
});

describe("正解発表の再演出", () => {
  it("正解発表をもう一度押しても正解情報は変わらない", () => {
    expectTypeOf<Parameters<typeof revealView>>().toEqualTypeOf<[q: Question]>();
    const questions = [pick, order] as const;
    const reveal = { type: "reveal" } as const;
    const deck = { total: questions.length, intro: [] };
    const first = step({ phase: "asking", index: 1 }, reveal, deck);
    const second = step(first, reveal, deck);
    expect(second).toMatchObject({ phase: "revealed", index: 1, run: 2 });
    expect(revealView(questions[second.phase === "revealed" ? second.index : 0])).toEqual({
      headline: "正解は A → C → B",
      explanation: "A が A5 ランク。",
      options: [
        { label: "A", correct: true },
        { label: "B", correct: false },
        { label: "C", correct: false },
      ],
    });
  });
});
