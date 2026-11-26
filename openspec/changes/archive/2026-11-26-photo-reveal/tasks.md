# Tasks

## 1. 写真当ての正解発表を変える

- [x] 1.1 `Option.caption` を足し、検証で写真当ての問題では必須、ほかでは `field-for-mode` で落とす。`revealView` と `RevealedOptionSchema` に `caption` を足す。`OptionCard` は写真当てのとき中央の `.label-bar` を出さず、左上の `.label-chip` を残し、写真の下に `.option-caption`（発表前は空、高さ固定）を出す。本番の第 4 問とテスト用の問題ファイルに `caption` を足し、単体・E2E のテストと README を直す。検証: `pnpm typecheck && pnpm test && pnpm e2e && openspec validate photo-reveal` が通る
