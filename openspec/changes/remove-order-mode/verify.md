# Verify

## Result

PASS。CRITICAL は 0 件。tasks.md は 1/1 完了。`pnpm typecheck`・`pnpm test`（183 件）・`pnpm e2e`（scenario・content とも）・`pnpm build`・`openspec validate remove-order-mode` が通った。

## Spec Coverage

### question-set

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 問題セットの形式: 正しい問題セットは検証を通る（2 択と 3 択） | `src/question-set/parse.ts`（`mode` のスキーマを削除） | `tests/unit/parse.test.ts:44` |
| 問題セットの形式: ほかの 12 件 | 変更なし | 名前の同じ既存テスト（`tests/unit/parse.test.ts`） |
| 選択肢の順位と正解: rank 1 がない・rank が重複する | 変更なし | `tests/unit/parse.test.ts:200`・`:211` |
| 選択肢の順位と正解: 正解は rank 1 の選択肢になる | `src/question-set/model.ts` の `answerOf` | `tests/unit/model.test.ts:50` |
| 公開形が `mode` を持たない（要件の本文） | `src/question-set/model.ts` の `toPublicQuestion`・`PUBLIC_QUESTION_KEYS` | `tests/unit/model.test.ts:81`、`tests/build/leak.test.ts:136` |

### host-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 正解発表: 各選択肢にラベル（B・A）・3 択で（C・A・B） | `tests/e2e/host.spec.ts:454`・`:459` |
| 正解発表: 選択肢の位置は変わらない | `tests/e2e/host.spec.ts:464` |
| 正解発表: 正解の選択肢だけを正解の見た目にする（2 択・3 択） | `tests/e2e/host.spec.ts:474`・`:479`、`tests/unit/reveal.test.ts:29`・`:44` |
| 正解発表: 正解ラベルと解説を表示する | `tests/e2e/host.spec.ts:484`、`tests/unit/reveal.test.ts:38` |

### guest-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 正解発表の正解情報の表示: 正解情報を表示する | `tests/e2e/guest.spec.ts:196` |
| 正解発表の正解情報の表示: 選択肢の位置は変わらない（3 択） | `tests/e2e/guest.spec.ts:205` |
| 正解発表の正解情報の表示: 次の問題へ進むと正解情報を消す | `tests/e2e/guest.spec.ts:217` |

## Blast Radius

**安全の根拠になる事実.** `mode` を参照するコードは残っていない（`rg -w mode src` の結果は vite の `environment.mode` だけ）。型検査が通っているので、`Question`・`PublicQuestion` から `mode` を消して壊れる呼び出し側はない。

**リスク.**
- `mode:` を書いたままの古い問題ファイルは、エラーにならず黙って通る。zod の `z.object` は知らないキーを捨てるため。一時的な単体テストで `mode: order` を書いた問題が検証を通り、結果に `mode` が残らないことを実行して確かめた。並べる問題のつもりで書いた問題も、rank 1 を当てる問題として出る。
- 3 択でも正解以外の選択肢が薄くなる。全選択肢のラベルを読ませる order の理由がなくなったので意図どおり。目での確認はしていない（unproven）。

**確認して問題なかったもの.**
- 本番の `content/questions.yaml` は 4 問とも pick だったので、出題内容は変わらない。content の E2E が全問を進めて正解発表し、溢れないことを確かめた。
- 会場の状態（Durable Object）は画面の位置と演出の回数だけを持ち、問題の形式を保存しない（`src/venue/machine.ts`）。

## Interrogate

設計の問いが残っていないので実施していない。
