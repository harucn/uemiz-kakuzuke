/** price: 一番高いものを当てる。ラベルは正解発表まで伏せる。photo: 写真を当てる。ラベルを発表前から出し、選択肢の説明を持たない */
export type Mode = "price" | "photo";
export type Label = "A" | "B" | "C";
export type Rank = 1 | 2 | 3;
/** 公開 URL（例 "/images/3f9a2c41.jpg"）。中身のハッシュから作り、元のファイル名を含まない。問題コンパイラ（vite-plugin.ts）だけが作れる */
export type ImageUrl = string & { readonly __brand: "ImageUrl" };

export interface Option {
  /** 作者が書く。表示順とは無関係 */
  readonly label: Label;
  readonly image: ImageUrl;
  /** 選択肢の説明。銘柄を書いてもよい。photo の問題では null、price の問題では必ず文字列 */
  readonly note: string | null;
  /** 1 = 最も高価。正解の唯一の情報源 */
  readonly rank: Rank;
}
/** 表示順 */
export type Options = readonly [Option, Option] | readonly [Option, Option, Option];

export interface Question {
  readonly mode: Mode;
  readonly title: string;
  readonly description: string;
  readonly explanation: string;
  readonly options: Options;
}
/** 検証済み。問題は 1 問以上・出題順。parseQuestionSet だけが作れる */
export type QuestionSet = {
  /** 会のタイトル。参加者にも見える */
  readonly title: string;
  /** ゲームのルール。空ならルール画面を出さない。参加者にも見える */
  readonly rules: readonly string[];
  /** 正解数で決まるランクと景品。上のランクから並べる。空ならランクと景品の画面を出さない。参加者にも見える */
  readonly prizes: readonly Prize[];
  readonly questions: readonly [Question, ...Question[]];
} & { readonly __brand: "QuestionSet" };

export interface Prize {
  /** 例 "1流" */
  readonly rank: string;
  /** 例 "4問正解" */
  readonly condition: string;
  /** 例 "景品を3つ" */
  readonly prize: string;
}

export type PublicOption = Pick<Option, "image" | "note">;
export type PublicQuestion = Pick<Question, "title" | "description"> & {
  readonly options: readonly [PublicOption, PublicOption] | readonly [PublicOption, PublicOption, PublicOption];
  /** photo の問題だけ、表示順のラベル。price の問題のラベルは正解発表まで秘密なので null */
  readonly labels: readonly Label[] | null;
};
export type PublicQuestionSet = {
  readonly title: string;
  readonly rules: readonly string[];
  readonly prizes: readonly Prize[];
  readonly questions: readonly [PublicQuestion, ...PublicQuestion[]];
};

export const PUBLIC_SET_KEYS = ["title", "rules", "prizes", "questions"] as const;
export const PUBLIC_QUESTION_KEYS = ["title", "description", "options", "labels"] as const;
export const PUBLIC_OPTION_KEYS = ["image", "note"] as const;

function toPublicOption(o: Option): PublicOption {
  return { image: o.image, note: o.note };
}

function toPublicQuestion(q: Question): PublicQuestion {
  const o = q.options;
  return {
    title: q.title,
    description: q.description,
    options:
      o.length === 2
        ? [toPublicOption(o[0]), toPublicOption(o[1])]
        : [toPublicOption(o[0]), toPublicOption(o[1]), toPublicOption(o[2])],
    labels: q.mode === "photo" ? o.map((option) => option.label) : null,
  };
}

/** 許可リスト方式の射影。spread も omit も使わず項目ごとに新しいオブジェクトを作るので、後から足した項目は既定で非公開になる */
export function toPublic(set: QuestionSet): PublicQuestionSet {
  const [first, ...rest] = set.questions;
  return {
    title: set.title,
    rules: [...set.rules],
    prizes: set.prizes.map((p) => ({ rank: p.rank, condition: p.condition, prize: p.prize })),
    questions: [toPublicQuestion(first), ...rest.map(toPublicQuestion)],
  };
}

/** 正解は rank 1 の選択肢。rank が 1〜n を 1 回ずつ使うことは parseQuestionSet が保証する */
export function answerOf(q: Question): Label {
  return q.options.find((o) => o.rank === 1)!.label;
}

export type SecretKind = "explanation";

/** 秘密の項目の唯一の定義。T は検証前の値（unknown）でも検証済みの string でもよい */
export function secretFields<T>(q: { readonly explanation: T }): readonly { readonly kind: SecretKind; readonly value: T }[] {
  return [{ kind: "explanation", value: q.explanation }];
}

/** 漏洩とみなす文字列: 全問題の explanation（重複は除く）。rank は数値なので構造で検査する */
export function secretStrings(set: QuestionSet): readonly string[] {
  return [...new Set(set.questions.flatMap((q) => secretFields(q).map((f) => f.value)))];
}
