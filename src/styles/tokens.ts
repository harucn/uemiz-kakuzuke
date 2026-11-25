/** 配色の唯一の定義。キーは CSS のカスタムプロパティ名（--cream など）になる。theme.css は色を直接書かず var() でこれを参照する */
export const palette = {
  cream: "#FFF8E7",
  paper: "#FFFDF6",
  green: "#0B5A1E",
  "green-deep": "#063A12",
  "green-soft": "#DCEBD6",
  red: "#D62828",
  /** メッセージ欄の話し手（「Q.」「正解は B！」）の文字色 */
  rose: "#FFD7D7",
  ink: "#1C2A1E",
  /** モックの #6B7A6C はクリーム地で 4.29:1 だったので、4.5:1 を超えるまで暗くした */
  mute: "#677668",
  /** 正解発表の紙吹雪だけに使う（文字は載せない） */
  pink: "#F28B8B",
  /** 正解発表の紙吹雪だけに使う（文字は載せない） */
  gold: "#E8A317",
} as const;

export type ColorToken = keyof typeof palette;

export const cssVariables = `:root{${Object.entries(palette)
  .map(([name, value]) => `--${name}:${value}`)
  .join(";")}}`;

export interface TextPair {
  readonly text: ColorToken;
  readonly bg: ColorToken;
  readonly use: string;
}

/** UI が文字を載せる配色の組のすべて。theme.test.ts がそれぞれのコントラスト比 4.5:1 以上を確かめる */
export const TEXT_PAIRS: readonly TextPair[] = [
  { text: "ink", bg: "cream", use: "本文（参加者画面）" },
  { text: "ink", bg: "paper", use: "本文（司会画面）" },
  { text: "green-deep", bg: "cream", use: "問題名・タイトル（参加者画面）" },
  { text: "green-deep", bg: "paper", use: "問題名・タイトル（司会画面）・枠付きボタン" },
  { text: "red", bg: "cream", use: "STAGE 見出し（参加者画面）" },
  { text: "red", bg: "paper", use: "STAGE 見出し（司会画面）" },
  { text: "ink", bg: "paper", use: "選択肢の説明（両画面のカード）" },
  { text: "paper", bg: "green", use: "A/B/C のラベル" },
  { text: "paper", bg: "red", use: "正解のラベル・正解発表ボタン" },
  { text: "paper", bg: "green-deep", use: "メッセージ欄と参加者画面の解説の本文" },
  { text: "rose", bg: "green-deep", use: "メッセージ欄の話し手・参加者画面の正解の並び" },
  { text: "mute", bg: "cream", use: "補足の文" },
  { text: "mute", bg: "paper", use: "補足の文（枠の中）" },
];

/** フォントの配信元。自前配信に切り替えるときはここ、__root.tsx の preconnect、theme.css の --dot / --label を変える */
export const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=DotGothic16&family=Silkscreen:wght@400;700&display=swap";
