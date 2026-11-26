import { describe, expect, expectTypeOf, it } from "vitest";
import {
  answerOf,
  PUBLIC_OPTION_KEYS,
  PUBLIC_QUESTION_KEYS,
  PUBLIC_SET_KEYS,
  secretStrings,
  toPublic,
  type PublicOption,
  type PublicQuestion,
  type PublicQuestionSet,
  type Question,
  type QuestionSet,
} from "../../src/question-set/model";
import { imageUrl, questionSet } from "./fixtures";

const wine: Question = {
  mode: "price",
  title: "ワイン",
  description: "高いワインはどちら？",
  explanation: "B は 1本 5万円のボルドー。",
  options: [
    { label: "A", image: imageUrl("/images/aaa.jpg"), note: "チリ産の赤ワイン", rank: 2 },
    { label: "B", image: imageUrl("/images/bbb.jpg"), note: "フランス産の赤ワイン", rank: 1 },
  ],
};

const beef: Question = {
  mode: "price",
  title: "牛肉",
  description: "高い牛肉はどれ？",
  explanation: "A が A5 ランク。",
  options: [
    { label: "A", image: imageUrl("/images/ccc.jpg"), note: "霜降りの牛肉", rank: 1 },
    { label: "B", image: imageUrl("/images/ddd.jpg"), note: "赤身の牛肉", rank: 3 },
    { label: "C", image: imageUrl("/images/eee.jpg"), note: "脂の多い牛肉", rank: 2 },
  ],
};

// 表示順がラベル順と別でも公開形が表示順を保つことを確かめるため、B・A の順に書く
const water: Question = {
  mode: "price",
  title: "水",
  description: "高い水はどちら？",
  explanation: "A は水道水。",
  options: [
    { label: "B", image: imageUrl("/images/ggg.jpg"), note: "海外の水", rank: 1 },
    { label: "A", image: imageUrl("/images/fff.jpg"), note: "国内の水", rank: 2 },
  ],
};

describe("answerOf", () => {
  it("正解は rank 1 の選択肢になる", () => {
    expect(answerOf(wine)).toBe("B");
    expect(answerOf(beef)).toBe("A");
  });
});

describe("写真当ての問題の公開形", () => {
  const child: Question = {
    mode: "photo",
    title: "子どもの頃の写真",
    description: "新婦の子どもの頃の写真はどれ？",
    explanation: "B が新婦。",
    options: [
      { label: "C", image: imageUrl("/images/c.jpg"), note: null, rank: 3 },
      { label: "B", image: imageUrl("/images/b.jpg"), note: null, rank: 1 },
      { label: "A", image: imageUrl("/images/a.jpg"), note: null, rank: 2 },
    ],
  };

  it("写真当ての問題の公開形は表示順のラベルを持ち、rank と解説を含まない", () => {
    expect(toPublic(questionSet("t", child)).questions[0]).toStrictEqual({
      title: "子どもの頃の写真",
      description: "新婦の子どもの頃の写真はどれ？",
      options: [
        { image: "/images/c.jpg", note: null },
        { image: "/images/b.jpg", note: null },
        { image: "/images/a.jpg", note: null },
      ],
      labels: ["C", "B", "A"],
    });
  });
});

describe("toPublic", () => {
  const publicSet = toPublic(questionSet("2026 忘年会 格付けチェック", wine, beef, water));

  it("公開形は rank を含まない", () => {
    for (const q of publicSet.questions) {
      for (const o of q.options) {
        expect(o).not.toHaveProperty("rank");
      }
    }
  });

  it("公開形はラベルを含まない", () => {
    for (const q of publicSet.questions) {
      for (const o of q.options) {
        expect(o).not.toHaveProperty("label");
      }
    }
  });

  it("公開形は解説を含まない", () => {
    for (const q of publicSet.questions) {
      expect(q).not.toHaveProperty("explanation");
    }
  });

  it("公開形は出題順と表示項目を保つ", () => {
    expect(publicSet.title).toBe("2026 忘年会 格付けチェック");
    expect(publicSet.questions).toStrictEqual([
      {
        title: "ワイン",
        description: "高いワインはどちら？",
        options: [
          { image: "/images/aaa.jpg", note: "チリ産の赤ワイン" },
          { image: "/images/bbb.jpg", note: "フランス産の赤ワイン" },
        ],
        labels: null,
      },
      {
        title: "牛肉",
        description: "高い牛肉はどれ？",
        options: [
          { image: "/images/ccc.jpg", note: "霜降りの牛肉" },
          { image: "/images/ddd.jpg", note: "赤身の牛肉" },
          { image: "/images/eee.jpg", note: "脂の多い牛肉" },
        ],
        labels: null,
      },
      {
        title: "水",
        description: "高い水はどちら？",
        options: [
          { image: "/images/ggg.jpg", note: "海外の水" },
          { image: "/images/fff.jpg", note: "国内の水" },
        ],
        labels: null,
      },
    ]);
  });

  it("each public object has exactly the allowlisted keys, even when the source has extra fields", () => {
    const withExtra = {
      ...beef,
      internalNote: "秘密のメモ",
      options: beef.options.map((o) => ({ ...o, supplier: "秘密の仕入れ先" })),
    } as unknown as Question;
    const withExtraSet = { ...questionSet("会", wine, withExtra), organizerMemo: "秘密のメモ" } as QuestionSet;
    const projected = toPublic(withExtraSet);
    expect(Object.keys(projected).sort()).toStrictEqual([...PUBLIC_SET_KEYS].sort());
    for (const q of projected.questions) {
      expect(Object.keys(q).sort()).toStrictEqual([...PUBLIC_QUESTION_KEYS].sort());
      for (const o of q.options) {
        expect(Object.keys(o).sort()).toStrictEqual([...PUBLIC_OPTION_KEYS].sort());
      }
    }
  });

  it("allowlists name exactly the keys of the public types", () => {
    expectTypeOf<(typeof PUBLIC_SET_KEYS)[number]>().toEqualTypeOf<keyof PublicQuestionSet>();
    expectTypeOf<(typeof PUBLIC_QUESTION_KEYS)[number]>().toEqualTypeOf<keyof PublicQuestion>();
    expectTypeOf<(typeof PUBLIC_OPTION_KEYS)[number]>().toEqualTypeOf<keyof PublicOption>();
  });
});

describe("secretStrings", () => {
  it("returns every explanation, without duplicates", () => {
    expect(secretStrings(questionSet("会", wine, beef, water, wine))).toStrictEqual([
      "B は 1本 5万円のボルドー。",
      "A が A5 ランク。",
      "A は水道水。",
    ]);
  });
});
