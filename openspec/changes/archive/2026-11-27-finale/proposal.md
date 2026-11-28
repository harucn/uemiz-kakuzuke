# Proposal

## Why

最終問の正解発表の後、司会画面は ▶ が効かず、最終問の正解発表のまま止まる。運営がテーブルの回答を集計して表彰する間、区切りの画面も読み上げる表もない（sharpen.md の Sharpened）。

## What Changes

- 最終問の次に結果発表の画面、その次にランクと景品の画面を足す。`prizes` がなければ結果発表の画面で終わる。
- 結果発表の画面は両画面で「結果発表」の文字を 1 字ずつ落とし、紙吹雪を打つ。紙吹雪は司会の操作で結果発表にしたときだけ打つ。
- 最後のランクと景品の画面は、第 1 問の前と同じ表を `RESULT` の小見出しで出す。参加者画面はこの表だけを出す。
- 最後の 2 画面では正解発表（Space・Enter）を無視する。
- 「最終問では次へを操作できない」は「並びの最後の画面では次へを操作できない」に置き換わる。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `host-screen`: 画面の並びに最後の 2 画面が加わる。2 画面の表示、キー操作、投影時に収まることの要件が変わる。
- `guest-screen`: 結果発表とランクと景品の表示、結果発表の紙吹雪が加わる。
- `venue-sync`: 届ける状態の許可リストに最後の 2 画面が加わり、どちらも画面の種類だけを持つ。

## Impact

- コード: `src/deck/cursor.ts`、`src/venue/machine.ts`・`protocol.ts`・`room.ts`・`view.ts`・`socket.ts`、`src/host/HostScreen.tsx`、`src/guest/GuestScreen.tsx`、`src/ui/IntroScreen.tsx`、新規 `src/ui/FinaleScreen.tsx`、`src/styles/theme.css`。
- 保存形: 会場の保存する状態に `finale`・`awards` が加わる。保存の版は問題セットの版なので、問題セットを変えずにコードだけロールバックすると、古いコードがこの 2 画面の状態を読めず、会場はタイトル画面に戻る（venue-sync「保存した状態が読めないときはタイトル画面」）。
- ドキュメント: README の操作の説明。
- 完了の判定は sharpen.md の Done Means。
