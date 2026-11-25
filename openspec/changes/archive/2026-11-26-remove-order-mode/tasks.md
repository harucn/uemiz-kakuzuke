# Tasks

## 1. 出題形式をなくす

- [x] 1.1 `Mode`・`Question.mode`・公開形の `mode`・`Answer` をなくし、`answerOf` を rank 1 のラベルを返す関数にする。`parseQuestionSet` の `mode` のスキーマ、`revealView` の order の見出し、`OptionCard` の `mode` の分岐を消す。問題ファイル・README・単体テスト・E2E を同じコミットで移す。テスト用の order の問題は 3 択の問題にし、E2E の `PICK`・`ORDER` を `TWO`・`THREE`（2 択・3 択）にする。検証: `pnpm typecheck && pnpm test && pnpm e2e && pnpm build && openspec validate remove-order-mode` が通る
