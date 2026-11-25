# Proposal

## Why

高い順に並べる出題形式 `order` は使わないことにした。本番の問題は 4 問とも一番高いものを当てる形で、`order` のための分岐とテストが残っている（sharpen.md の Sharpened）。

## What Changes

- **BREAKING** 問題から出題形式 `mode` をなくす。問題ファイルに `mode:` を書かない。書いてあっても検証は無視する。
- 正解は `rank: 1` の選択肢だけになる。正解発表の見出しは常に「正解は B」の形。
- 正解発表では、3 択でも正解以外の選択肢を薄くする（今までは pick だけ薄くしていた）。
- 範囲外: ラベル・選択肢の説明・めくりと紙吹雪の演出。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `question-set`: 問題が `mode` を持たない。正解は rank 1 の選択肢。
- `host-screen`: pick と order の正解発表を 1 つの「正解発表」にまとめる。
- `guest-screen`: 正解発表の表示から order のシナリオを消す。

## Impact

- コード: `src/question-set/model.ts`・`parse.ts`、`src/venue/view.ts`、`src/ui/OptionCard.tsx`、`src/host/HostScreen.tsx`、`src/guest/GuestScreen.tsx`、`src/styles/theme.css` のコメント。
- データ: `content/questions.yaml` と `tests/fixtures/*/questions.yaml` から `mode:` を消す。テスト用の order の問題は 3 択の問題にする。README の書き方の例を直す。
- 完了の判定は sharpen.md の Done Means。
