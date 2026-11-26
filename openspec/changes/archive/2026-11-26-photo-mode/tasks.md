# Tasks

## 1. 写真当てモードを足す

- [x] 1.1 `Question.mode`（`price`・`photo`）と `Option.note: string | null` を足し、検証で `mode: photo` を読み、写真当ての問題の `note` を `note-in-photo` で落とす。公開形の問題に表示順のラベル列 `labels`（写真当てでなければ null）を足す。`OptionCard` は写真当ての問題で発表前から写真の左上に `.label-chip` を出し、`note` が null なら説明を出さない。本番の第 4 問とテスト用の問題ファイルを移し、単体・ビルド・E2E のテストと README を直す。検証: `pnpm typecheck && pnpm test && pnpm e2e && pnpm build && openspec validate photo-mode` が通る
