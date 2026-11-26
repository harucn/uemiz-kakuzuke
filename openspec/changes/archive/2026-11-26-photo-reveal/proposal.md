# Proposal

## Why

写真当ての正解発表で中央に大きなラベルを重ねると、子どもの頃の写真が隠れる。また、正解発表で誰の写真だったかが分からない（sharpen.md の Sharpened）。

## What Changes

- 写真当ての正解発表では、中央にラベルを重ねず、左上のラベルを残す。正解の選択肢のラベルは赤にする。
- 選択肢に `caption`（誰の写真か）を足す。写真当ての問題では必須、ほかの問題では書けない。正解発表後に写真の下に出す。
- `caption` は正解情報として扱い、正解発表中の会場の状態でだけ届ける。公開形には含めない。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `question-set`: 選択肢が `caption` を持てる。写真当てでは必須、ほかでは禁止。公開形は `caption` を含まない。
- `host-screen`: 写真当ての正解発表で中央にラベルを重ねず、写真の下に誰の写真かを出す。
- `guest-screen`: 同じ。届くデータは正解発表前に `caption` を含まない。

## Impact

- コード: `src/question-set/model.ts`・`parse.ts`、`src/venue/protocol.ts`・`view.ts`、`src/ui/OptionCard.tsx`、`src/styles/theme.css`。
- データ: `content/questions.yaml` の第 4 問とテスト用の写真当ての問題に `caption` を足す。本番の第 4 問の `caption` は rank 1 の「新婦」以外を仮置き（TODO）。README を直す。
- 完了の判定は sharpen.md の Done Means。
