export type Step = -1 | 1;

/** タイトル画面と第 1 問の間の画面。"rules" はルール画面、"prizes" はランクと景品の画面 */
export type Intro = "rules" | "prizes";

/** 最終問の後の画面。"finale" は結果発表の画面、"awards" は表彰で読み上げるランクと景品の画面 */
export type Outro = "finale" | "awards";

/** 画面の位置。"title" はタイトル画面、数値は問題の添字 */
export type Position = "title" | Intro | number | Outro;

/** 画面の並び: タイトル画面 → intro の画面（書いた項目だけ） → 第 1 問 → … → 最終問 → outro の画面 */
export interface Deck {
  readonly total: number;
  readonly intro: readonly Intro[];
  readonly outro: readonly Outro[];
}

export function deckOf(set: {
  readonly rules: readonly unknown[];
  readonly prizes: readonly unknown[];
  readonly questions: readonly unknown[];
}): Deck {
  const intro: Intro[] = [];
  if (set.rules.length > 0) intro.push("rules");
  if (set.prizes.length > 0) intro.push("prizes");
  return { total: set.questions.length, intro, outro: set.prizes.length > 0 ? ["finale", "awards"] : ["finale"] };
}

export function clampIndex(index: number, total: number): number {
  return Math.min(Math.max(index, 0), total - 1);
}

function sequence(deck: Deck): readonly Position[] {
  return ["title", ...deck.intro, ...Array.from({ length: deck.total }, (_, i) => i), ...deck.outro];
}

/** 並びの中の位置。範囲外の問題番号は端の問題に寄せる。並びにない intro・outro の画面はタイトル画面とみなす */
function indexIn(seq: readonly Position[], position: Position, deck: Deck): number {
  const target = typeof position === "number" ? clampIndex(position, deck.total) : position;
  return Math.max(seq.indexOf(target), 0);
}

/** 並びの両端では動かない */
export function move(position: Position, step: Step, deck: Deck): Position {
  const seq = sequence(deck);
  const i = indexIn(seq, position, deck) + step;
  return seq[Math.min(Math.max(i, 0), seq.length - 1)];
}

export function boundsOf(position: Position, deck: Deck): { readonly canPrev: boolean; readonly canNext: boolean } {
  const seq = sequence(deck);
  const i = indexIn(seq, position, deck);
  return { canPrev: i > 0, canNext: i < seq.length - 1 };
}
