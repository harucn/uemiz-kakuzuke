# Design

## Context

画面の並びは `deckOf` が問題セットから作る `Deck` で決まり、状態機械・保存形・配信形・両画面がその位置（`Position`）を共有する（sharpen.md の Current System）。最後の 2 画面はこの全部にまたがるので design を書く。

pstackspec では design の選択肢を `architect` の Phase A–C（`arena` で 2 案以上を並べる）で作る。今回は実装が先にあり、そこから spec を起こしたので arena は走らせていない。下の Decisions の代替案は、実装時に比べた案を後から書いたもの。

## Goals / Non-Goals

**Goals:**

- 最後の 2 画面を、第 1 問の前の画面（`Intro`）と同じ仕組みで並びに足す。並びの端・正解発表の無視・配信の許可リストは既存の規則のまま効くようにする。

**Non-Goals:**

- 正解数の集計とテーブルごとの成績。
- 結果発表の画面の文言や演出を問題ファイルで変えられるようにすること。

## Decisions

### 1. 最終問の後の画面を `Outro` として `Deck` に持たせる

```ts
export type Outro = "finale" | "awards";
export type Position = "title" | Intro | number | Outro;
export interface Deck {
  readonly total: number;
  readonly intro: readonly Intro[];
  readonly outro: readonly Outro[]; // prizes があれば ["finale", "awards"]、なければ ["finale"]
}
// 並び: ["title", ...intro, 0..total-1, ...outro]
```

呼び出し側は今まで通り `move(position, step, deckOf(set))` と `boundsOf(position, deck)` だけを使う。最後の画面で ▶ が無効になるのは `boundsOf` の既存の規則による。

代替案:

- **`prizes` を並びの最後にもう一度置く**: 同じ値が並びに 2 回出るので、`seq.indexOf` で位置が決まらない。採らない。
- **最終問の正解発表の後に別の状態（例えば `revealed` に `finished` を足す）で表す**: 画面の位置ではなく状態の属性になり、◀ で戻る並びと `boundsOf` の規則から外れる。採らない。

### 2. 表彰の画面は `IntroScreen` を `"awards"` で使い回す

`IntroScreen` の見出し表に `awards: { kicker: "RESULT", title: "ランクと景品" }` を足し、本文は `prizes` と同じ表にする。参加者画面は `awards` のときこの 1 つだけを出す（第 1 問の前はルールとランクと景品を並べる）。

代替案: 表を出す部品を別に作る。表の見た目が 2 か所に分かれ、片方だけ直す事故が起きる。採らない。

### 3. 結果発表の紙吹雪は `celebrationOf` で合図する

`celebrationOf` が、司会の操作で届いた（`operated`）`finale` のフレームに `"finale"` を返す。両画面はこの値があるときだけ `Celebration` を出す。つないだ直後（`joined`）は出さない、という正解発表の既存の規則と同じになる。

代替案: `FinaleScreen` の表示と同時に必ず紙吹雪を出す。再読み込みや途中参加のたびに紙吹雪が出て、正解発表と振る舞いが食い違う。採らない。

### 4. 文字のアニメーションは CSS だけで付ける

`FinaleScreen` は文字ごとに `--i` を style で渡し、`finale-drop`（落ちる）と `finale-bounce`（そろった後に 2 回跳ねる）を `prefers-reduced-motion: no-preference` の中でだけ当てる。見出しの読み上げは `aria-label="結果発表"` で 1 語にする。

## Risks / Trade-offs

- [古い版のコードが `finale`・`awards` を保存した会場を読む] → 保存した状態が読めないときはタイトル画面に戻る既存の動き（venue-sync「保存した状態が読めないときはタイトル画面」）で止まる。ロールバック直後に司会がタイトル画面から進め直す必要がある。
- [表彰のランクと景品の画面から ◀ で結果発表に戻ると、紙吹雪をもう一度打つ] → 「司会の操作でこの画面にしたとき」に当たるので spec どおり。フレームは移動の向きを持たないので、▶ のときだけに絞るにはプロトコルを広げる必要があり、今回はしない。
- [ランクと景品の画面（`awards`）は実データの content E2E でしか通らない] → シナリオ用のフィクスチャに `prizes` を足すと、第 1 問の前にも画面が増え、タイトル画面から第 1 問へ進む既存のテストの前提が崩れる。実データに `prizes` があり、CI は実データでも E2E を流す。`deckOf` の単体テストが `prizes` の有無で並びが変わることを確かめる。
- [最終問の正解発表の前に ▶ を押すと結果発表へ進む] → 問題の間の ▶ と同じ扱い。◀ で最終問の正解発表前に戻れる。
