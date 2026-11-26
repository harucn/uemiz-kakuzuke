# Verify

## Result

PASS。CRITICAL は 0 件。tasks.md は 1/1 完了。`pnpm typecheck`・`pnpm test`（187 件）・`pnpm e2e`（build 12 件 × 2・scenario 95 件・content 8 件）・`openspec validate photo-mode` が通った。

## Spec Coverage

### question-set

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 問題セットの形式: 写真当ての問題は選択肢の説明なしで検証を通る | `src/question-set/parse.ts`（`mode`・`note` のスキーマ、`toQuestionSet`） | `tests/unit/parse.test.ts:120` |
| 問題セットの形式: 写真当ての問題に選択肢の説明を書くと検証に失敗する | `parse.ts` の `crossFieldIssues`（`note-in-photo`） | `tests/unit/parse.test.ts:128` |
| 問題セットの形式: 未知の mode は検証に失敗する | `parse.ts` の `mode` のスキーマ | `tests/unit/parse.test.ts:133` |
| 問題セットの形式: 選択肢の説明がない選択肢は検証に失敗する（写真当てでない問題） | `parse.ts` の `crossFieldIssues` | 名前の同じ既存テスト（`tests/unit/parse.test.ts`） |
| 参加者向けの公開形: 写真当ての問題の公開形は表示順のラベルを持ち、rank と解説を含まない | `src/question-set/model.ts` の `toPublicQuestion` | `tests/unit/model.test.ts:72` |
| 参加者向けの公開形・選択肢の順位と正解: ほかのシナリオ | 変更なし | 名前の同じ既存テスト |

### host-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 問題画面の表示: 写真当ての問題は正解発表前から各選択肢にラベルを表示する | `tests/e2e/host.spec.ts:128` |
| 問題画面の表示: 正解発表前はラベルを表示しない（写真当てでない問題） | `tests/e2e/host.spec.ts:137`（全問を進め、問題の種類ごとに `expectLabelsBeforeReveal` で判定） |

### guest-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 正解発表前の表示: どの問題でも正解情報が表示されない・正解発表の操作がない | 名前の同じ既存テスト（`tests/e2e/guest.spec.ts`） |
| 正解発表前の表示: 写真当て以外の問題ではラベルが表示されない | `tests/e2e/guest.spec.ts:338` |
| 正解発表前の表示: 写真当ての問題は正解発表前から各選択肢にラベルを表示する | `tests/e2e/guest.spec.ts:349` |
| 参加者に届くデータ: 写真当て以外の問題はラベルを持たない | `tests/build/leak.test.ts:154` |

## Blast Radius

**安全の根拠になる事実.** 参加者に届くラベルは `toPublicQuestion` の `labels` だけで、`mode === "photo"` のときにしか値を持たない。ビルドの漏洩検査（`tests/build/leak.test.ts:154`）が、本番データの写真当てでない 3 問の `labels` が null であることを確かめている。選択肢のキーは今まで通り `image`・`note` だけ。

**リスク.**
- 写真当ての問題の正解は rank 1 で、`rank` の名前は「値段の順位」のまま。README と問題ファイルのコメントに「写真当てでは 1 が正解の写真」と書いた。
- 発表前のラベル（`.label-chip`）は参加者画面では小さめ（幅 360px で約 20px）。スクリーンショットで読めることを目で確かめた。

**確認して問題なかったもの.**
- 本番データでビルドし、第 4 問の司会画面（1920×1080、発表前・発表後）と参加者画面（幅 360px）をスクリーンショットで確かめた。発表前は左上にラベル、説明なし。発表後は中央の大きなラベルと正解の赤枠。
- content の E2E が本番データの全問で、溢れないことと発表前のラベルの扱いを確かめた。

## Interrogate

設計の問いが残っていないので実施していない。
