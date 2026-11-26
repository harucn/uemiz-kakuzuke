# Proposal

## Why

本番の第 4 問は新婦の子どもの頃の写真を当てる問題で、参加者は写真を A・B・C で呼んで答える。今はラベルを正解発表まで伏せ、写真の下に説明を出すので、写真を指して答えられず、説明が手がかりになる（sharpen.md の Sharpened）。

## What Changes

- 写真当てモード `mode: photo` を足す。省いた問題は今まで通り。
- 写真当ての問題は、発表前から両画面の写真の左上にラベルを出す。写真の中央は隠さない。
- 写真当ての問題の選択肢は `note` を書けない。書くと検証に失敗する。写真の下には何も出さない。
- 参加者に届くデータは、写真当ての問題だけ表示順のラベル列を持つ。
- 公開形の要件に残っていた「出題形式」の文言を消す（`remove-order-mode` の消し漏れ）。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `question-set`: 問題が `mode: photo` を持てる。写真当ての問題は `note` を持たない。公開形は写真当ての問題だけラベル列を持つ。
- `host-screen`: 写真当ての問題は発表前からラベルを出し、説明を出さない。
- `guest-screen`: 写真当ての問題は発表前からラベルを出し、説明を出さない。届くデータに写真当ての問題のラベルを含める。

## Impact

- コード: `src/question-set/model.ts`・`parse.ts`、`src/ui/OptionCard.tsx`、`src/host/HostScreen.tsx`、`src/guest/GuestScreen.tsx`、`src/styles/theme.css`。
- データ: `content/questions.yaml` の第 4 問を `mode: photo` にして `note` を消す。テスト用の問題ファイルに写真当ての最終問を足す。README に書き方を足す。
- 完了の判定は sharpen.md の Done Means。
