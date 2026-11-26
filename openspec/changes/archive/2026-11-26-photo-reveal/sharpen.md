# Sharpen

## Request

> 正解発表でABCを被せたくないな。あと、正解発表したら、下に誰の（なんの）写真だったか出したいな

（写真当ての問題についての依頼。直前に dev サーバーで写真当てモードを確認した流れ）

## Sharpened

写真当ての問題の正解発表を変える。

- **正解発表のラベル**: 中央に大きなラベルを重ねず、発表前と同じ左上の小さいラベルを残す。正解の選択肢のラベルは赤にする。
- **誰の写真か**: 選択肢に `caption`（誰の・なんの写真か）を書き、正解発表後に写真の下に出す。写真当ての問題では必須、ほかの問題では書けない。正解情報なので、発表前は参加者に届けない。
- **写真の位置**: 発表の前後で写真の位置と大きさを変えない。
- **範囲外**: 写真当てでない問題の正解発表。

## Current System

- 正解発表では、`OptionCard` が写真当てかどうかに関係なく、写真の中央に `.label-bar` を重ねる（`src/ui/OptionCard.tsx`）。
- 正解発表のデータは `revealView` が作り、選択肢ごとに `label` と `correct` だけを持つ（`src/venue/view.ts`、`src/venue/protocol.ts` の `RevealedOptionSchema`）。会場は正解発表中だけこれを配る。
- 写真当ての選択肢は `note` を持たず、写真の下に何も出さない（`src/question-set/parse.ts`、`src/ui/OptionCard.tsx`）。

## Done Means

- 単体テストで、`caption` の必須と禁止の検証、`revealView` が写真当ての選択肢に `caption` を付けることを確かめる。
- E2E で、写真当ての正解発表で両画面の左上のラベルが残り、`.label-bar` がなく、写真の下に `caption` が出ること、発表前は `caption` が出ないこと、本番データで写真の位置が発表の前後で変わらないことを確かめる。
- `pnpm typecheck`・`pnpm test`・`pnpm e2e`・`openspec validate photo-reveal` が通る。
