# Verify

## Result

PASS。CRITICAL は 0 件。tasks.md は 1/1 完了。`pnpm typecheck`・`pnpm test`（190 件）・`pnpm e2e`（build 12 件 × 2・scenario 97 件・content 8 件）・`openspec validate photo-reveal` が通った。

## Spec Coverage

### question-set

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 問題セットの形式: 写真当ての問題で誰の写真かがない選択肢は検証に失敗する | `src/question-set/parse.ts` の `crossFieldIssues` | `tests/unit/parse.test.ts:140` |
| 問題セットの形式: 写真当てでない問題に誰の写真かを書くと検証に失敗する | 同上（`field-for-mode`） | `tests/unit/parse.test.ts:146` |
| 問題セットの形式: 写真当ての問題は選択肢の説明なしで検証を通る（`caption` を読む） | `parse.ts` の `toQuestionSet` | `tests/unit/parse.test.ts:123` |
| 参加者向けの公開形: `caption` を含まない | `src/question-set/model.ts` の `toPublicOption`（許可リスト） | `tests/unit/model.test.ts:72`（公開形と完全一致）、`tests/build/leak.test.ts`（選択肢のキーが `image`・`note` と完全一致） |

### host-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 正解発表: 写真当ての正解発表では中央にラベルを重ねず、写真の下に誰の写真かを表示する | `tests/e2e/host.spec.ts:137`、`tests/unit/reveal.test.ts:56` |
| 問題画面の表示: 写真当ての問題は正解発表前から各選択肢にラベルを表示する（誰の写真かはまだ出ない） | `tests/e2e/host.spec.ts:128`（`expectLabelsBeforeReveal` が `.option-caption` が空であることを確かめる） |

### guest-screen

| Requirement / Scenario | テスト |
| --- | --- |
| 正解発表の正解情報の表示: 写真当ての正解発表では中央にラベルを重ねず、写真の下に誰の写真かを表示する | `tests/e2e/guest.spec.ts:359` |
| 正解発表前の表示: 写真当ての問題は正解発表前から各選択肢にラベルを表示する（誰の写真かはまだ出ない） | `tests/e2e/guest.spec.ts:349` |
| 参加者に届くデータ: 誰の写真かを含めない | 公開形は上の question-set の行。会場の状態は、正解発表前のフレームが `phase`・`index` だけを持つことを `viewShapeProblems` で確かめる（`tests/e2e/guest.spec.ts` の「参加者へ届ける正解の範囲」） |

## Blast Radius

**安全の根拠になる事実.** `caption` を画面へ運ぶ道は `revealView` だけで、会場は正解発表中の状態でしかこれを作らない（`src/venue/view.ts` の `viewOf`）。公開形は許可リストで写すので `caption` を含まない。

**リスク.**
- `caption` は文字列の漏洩検査（解説の文字列を探す検査）の対象にしていない。「新婦」のような短い語は問題文にも出るので、文字列で探すと誤検出になる。発表前に届かないことは、データの構造（公開形と会場の状態の形）で守っている。
- 正解でない選択肢はカードごと薄くするので、写真の下の誰の写真かも薄くなる。正解の選択肢は濃いまま。
- 誰の写真かは 1 行に収め、はみ出す分は「…」で切る。長い文は書かない前提（README）。
- 本番の第 4 問の `caption` は rank 1 の「新婦」以外が仮置き（TODO）。

**確認して問題なかったもの.**
- 本番データの content E2E で、第 4 問の写真の位置と大きさが発表の前後で完全一致することを確かめた。最初は誰の写真かの行の高さが発表の前後で 0.02px ずれたので、高さを固定した。

## Interrogate

設計の問いが残っていないので実施していない。
