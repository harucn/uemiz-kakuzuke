# Tasks

## 1. 最終問の後に結果発表とランクと景品の画面を足す

`VenueView` に新しい phase を足すと、両画面がそれを扱うまで型検査が通らない。会場の状態と両画面の表示は 1 つの検証単位にする。

- [x] 1.1 `Deck` に `outro`（`finale`・`awards`）を足し、状態機械・保存形・配信形・`viewOf`・`celebrationOf` を広げる。単体テストで並び・正解発表の無視・配信形・紙吹雪の合図を確かめる
- [x] 1.2 `FinaleScreen` と表彰のランクと景品の画面を司会画面と参加者画面に出し、最後の画面では次の問題を先読みしない。E2E（host・guest・content）と README を直す
- [x] 1.3 検証: `pnpm typecheck && pnpm test && pnpm e2e && openspec validate finale --strict` が通る
