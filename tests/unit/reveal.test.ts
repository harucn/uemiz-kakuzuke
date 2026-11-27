import { describe, expect, expectTypeOf, it } from "vitest";
import { step } from "../../src/venue/machine.ts";
import { revealView } from "../../src/venue/view.ts";
import type { Question } from "../../src/question-set/model.ts";
import { imageUrl } from "./fixtures.ts";

const wine: Question = {
  mode: "price",
  title: "ワイン",
  description: "高いワインはどちら？",
  explanation: "B は 1本 5万円のボルドー。",
  options: [
    { label: "A", image: imageUrl("/images/aaa.jpg"), note: "チリ産の赤ワイン", caption: null, rank: 2 },
    { label: "B", image: imageUrl("/images/bbb.jpg"), note: "フランス産の赤ワイン", caption: null, rank: 1 },
  ],
};

const beef: Question = {
  mode: "price",
  title: "牛肉",
  description: "高い牛肉はどれ？",
  explanation: "A が A5 ランク。",
  options: [
    { label: "A", image: imageUrl("/images/ccc.jpg"), note: "霜降りの牛肉", caption: null, rank: 1 },
    { label: "B", image: imageUrl("/images/ddd.jpg"), note: "赤身の牛肉", caption: null, rank: 3 },
    { label: "C", image: imageUrl("/images/eee.jpg"), note: "脂の多い牛肉", caption: null, rank: 2 },
  ],
};

describe("正解発表", () => {
  it("正解の選択肢だけを正解の見た目にする", () => {
    const options = revealView(wine).options;
    expect(options.map((o) => [o.label, o.correct])).toEqual([
      ["A", false],
      ["B", true],
    ]);
  });


  it("正解発表で正解ラベルと解説を表示する", () => {
    const view = revealView(wine);
    expect(view.headline).toBe("正解は B");
    expect(view.explanation).toBe("B は 1本 5万円のボルドー。");
  });

  it("3 択で正解の選択肢だけを正解の見た目にする", () => {
    expect(revealView(beef).options.map((o) => [o.label, o.correct])).toEqual([
      ["A", true],
      ["B", false],
      ["C", false],
    ]);
  });
});

describe("写真当ての正解発表", () => {
  it("写真当ての正解発表で各選択肢に誰の写真かを付ける", () => {
    const child: Question = {
      mode: "photo",
      title: "子どもの頃の写真",
      description: "新婦の子どもの頃の写真はどれ？",
      explanation: "B が新婦。",
      options: [
        { label: "C", image: imageUrl("/images/c.jpg"), note: null, caption: "新郎", rank: 3 },
        { label: "B", image: imageUrl("/images/b.jpg"), note: null, caption: "新婦", rank: 1 },
      ],
    };
    expect(revealView(child).options).toEqual([
      { label: "C", correct: false, caption: "新郎" },
      { label: "B", correct: true, caption: "新婦" },
    ]);
  });
});

describe("正解発表の再演出", () => {
  it("正解発表をもう一度押しても正解情報は変わらない", () => {
    expectTypeOf<Parameters<typeof revealView>>().toEqualTypeOf<[q: Question]>();
    const questions = [wine, beef] as const;
    const reveal = { type: "reveal" } as const;
    const deck = { total: questions.length, intro: [], outro: [] };
    const first = step({ phase: "asking", index: 1 }, reveal, deck);
    const second = step(first, reveal, deck);
    expect(second).toMatchObject({ phase: "revealed", index: 1, run: 2 });
    expect(revealView(questions[second.phase === "revealed" ? second.index : 0])).toEqual({
      headline: "正解は A",
      explanation: "A が A5 ランク。",
      options: [
        { label: "A", correct: true, caption: null },
        { label: "B", correct: false, caption: null },
        { label: "C", correct: false, caption: null },
      ],
    });
  });
});
