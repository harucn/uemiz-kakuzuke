import type { ImageUrl, Question, QuestionSet } from "../../src/question-set/model";

/** テスト専用。本番では ImageUrl は問題コンパイラ、QuestionSet は parseQuestionSet だけが作る */
export function imageUrl(url: string): ImageUrl {
  return url as ImageUrl;
}

export function questionSet(title: string, ...questions: readonly [Question, ...Question[]]): QuestionSet {
  return { title, rules: [], prizes: [], questions } as unknown as QuestionSet;
}

/** 秘密の文字列はどれも一意で、ほかの項目の部分文字列にならない */
export const venueSet = questionSet(
  "テストの会",
  {
    mode: "price",
    title: "ワイン",
    description: "高いワインはどちら？",
    explanation: "解説その一",
    options: [
      { label: "A", image: imageUrl("/images/a1.jpg"), note: "赤ワイン甲", caption: null, rank: 2 },
      { label: "B", image: imageUrl("/images/b1.jpg"), note: "赤ワイン乙", caption: null, rank: 1 },
    ],
  },
  {
    mode: "price",
    title: "牛肉",
    description: "高い牛肉はどれ？",
    explanation: "解説その二",
    options: [
      { label: "A", image: imageUrl("/images/a2.jpg"), note: "牛肉甲", caption: null, rank: 1 },
      { label: "B", image: imageUrl("/images/b2.jpg"), note: "牛肉乙", caption: null, rank: 3 },
      { label: "C", image: imageUrl("/images/c2.jpg"), note: "牛肉丙", caption: null, rank: 2 },
    ],
  },
  {
    mode: "price",
    title: "チョコ",
    description: "高いチョコはどれ？",
    explanation: "解説その三",
    options: [
      { label: "A", image: imageUrl("/images/a3.jpg"), note: "板チョコ甲", caption: null, rank: 3 },
      { label: "B", image: imageUrl("/images/b3.jpg"), note: "板チョコ乙", caption: null, rank: 1 },
      { label: "C", image: imageUrl("/images/c3.jpg"), note: "板チョコ丙", caption: null, rank: 2 },
    ],
  },
);
