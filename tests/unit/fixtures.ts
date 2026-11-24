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
    mode: "pick",
    title: "ワイン",
    description: "高いワインはどちら？",
    explanation: "解説その一",
    options: [
      { label: "A", image: imageUrl("/images/a1.jpg"), note: "赤ワイン甲", rank: 2 },
      { label: "B", image: imageUrl("/images/b1.jpg"), note: "赤ワイン乙", rank: 1 },
    ],
  },
  {
    mode: "order",
    title: "牛肉",
    description: "高い順に並べよ",
    explanation: "解説その二",
    options: [
      { label: "A", image: imageUrl("/images/a2.jpg"), note: "牛肉甲", rank: 1 },
      { label: "B", image: imageUrl("/images/b2.jpg"), note: "牛肉乙", rank: 3 },
      { label: "C", image: imageUrl("/images/c2.jpg"), note: "牛肉丙", rank: 2 },
    ],
  },
  {
    mode: "pick",
    title: "チョコ",
    description: "高いチョコはどれ？",
    explanation: "解説その三",
    options: [
      { label: "A", image: imageUrl("/images/a3.jpg"), note: "板チョコ甲", rank: 3 },
      { label: "B", image: imageUrl("/images/b3.jpg"), note: "板チョコ乙", rank: 1 },
      { label: "C", image: imageUrl("/images/c3.jpg"), note: "板チョコ丙", rank: 2 },
    ],
  },
);
