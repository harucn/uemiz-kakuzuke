# Sharpen

## Request

> 問題タイプの順番にするやつはいらない。消しちゃって

## Sharpened

出題形式 `order`（高い順に並べる）をなくし、問題は rank 1 の選択肢を当てる形だけにする。形式が 1 つになるので、出題形式の項目 `mode` もなくす。

- **問題データ**: 問題は `mode` を持たない。正解は `rank: 1` の選択肢。`rank` は 1〜n を 1 回ずつ使う規則のまま残す。
- **正解発表**: 2 択でも 3 択でも、正解の選択肢に正解の赤枠を付け、ほかの選択肢を薄くし、「正解は B」と解説を出す。
- **範囲外**: ラベル・選択肢の説明・めくりと紙吹雪の演出は変えない。

## Current System

- 出題形式は `Mode = "pick" | "order"` で、`Question` と公開形 `PublicQuestion` が持つ（`src/question-set/model.ts:1`・`:20`・`:47`・`:58`）。
- 検証は `mode` を `pick` か `order` に限る（`src/question-set/parse.ts:49`）。
- 正解は `answerOf` が `mode` で分岐して、pick は rank 1 のラベル、order は rank 昇順のラベル列を返す（`src/question-set/model.ts:89-101`）。
- `revealView` は order のとき見出しを「正解は A → C → B」にする（`src/venue/view.ts:5-15`）。
- `OptionCard` は pick だけ不正解を薄くする（`src/ui/OptionCard.tsx:17-18`）。司会画面と参加者画面が `mode` を渡す（`src/host/HostScreen.tsx:125`、`src/guest/GuestScreen.tsx:83`）。
- 本番の `content/questions.yaml` は 4 問とも pick。テスト用の問題ファイルは第 2 問・第 4 問が order。

## Done Means

- 単体テストで、正解が rank 1 の選択肢になり、3 択の正解発表で正解の選択肢だけが正解の見た目になり、公開形が `mode` を持たないことを確かめる。
- E2E で、2 択と 3 択の正解発表で各選択肢のラベル・正解の赤枠・「正解は B」の形の見出しと解説が出ることを確かめる。
- `pnpm typecheck`・`pnpm test`・`pnpm e2e`・`pnpm build`・`openspec validate remove-order-mode` が通る。
