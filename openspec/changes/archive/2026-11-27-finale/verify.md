# Verify

## Result

PASS。CRITICAL は 0 件。tasks.md は 3/3 完了。`pnpm typecheck`・`pnpm test`（194 件）・`pnpm e2e`（build 12 件 × 2・scenario 104 件・content 8 件）・`openspec validate finale --strict` が通った。

## Spec Coverage

### host-screen

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 結果発表の画面の表示: 最終問の次は結果発表の画面で、紙吹雪を再生する | `src/ui/FinaleScreen.tsx`、`src/host/HostScreen.tsx` の `finale` の枝、`src/venue/socket.ts` の `celebrationOf` | `tests/e2e/host.spec.ts:171`（文字ごとに `finale-drop, finale-bounce` が当たることも確かめる） |
| 結果発表の画面の表示: 再読み込みすると紙吹雪を再生しない | `celebrationOf` が `joined` で null | `tests/e2e/host.spec.ts:184`、`tests/unit/use-venue.test.ts:236` |
| 結果発表の画面の表示: reduced motion | `src/styles/theme.css` の `prefers-reduced-motion: no-preference`、`Celebration` | `tests/e2e/host.spec.ts:194` |
| 表彰のランクと景品の画面の表示 | `src/ui/IntroScreen.tsx` の `awards`、`src/deck/cursor.ts` の `deckOf` | `tests/e2e/content.spec.ts:236`（実データ）、`tests/unit/cursor.test.ts:91` |
| 画面の並びと前後の移動: 最終問の次は結果発表の画面で、そこでは次へと正解発表を操作できない | `src/deck/cursor.ts` の `sequence`・`boundsOf` | `tests/e2e/host.spec.ts:239`、`tests/unit/venue-machine.test.ts:45`・`:55` |
| 画面の並びと前後の移動: ランクと景品があると結果発表の次にランクと景品の画面を表示し、そこで終わる | `deckOf` の `outro` | `tests/e2e/content.spec.ts:236`（最後に ▶ が無効）、`tests/unit/venue-machine.test.ts:50`、`tests/unit/cursor.test.ts:30` |
| 画面の並びと前後の移動: ほかのシナリオ | 変更なし | 名前の同じ既存テスト（describe を要件名に合わせて改名） |
| キーボード操作: 結果発表の画面では Space キーと Enter キーで何も起きない | `src/venue/machine.ts` の reveal の無視 | `tests/e2e/host.spec.ts:402`（陽性対照つき）、`tests/unit/venue-machine.test.ts:84` |
| 投影時の可読性: 結果発表の画面・表彰のランクと景品の画面が 1 画面に収まる | `theme.css` の `.finale--host` | `tests/e2e/content.spec.ts:236`（`overflows` の `finale`・`awards`） |

### guest-screen

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 結果発表の表示: 司会が最終問の次へ進むと結果発表と紙吹雪を出す | `src/guest/GuestScreen.tsx` の `finale` の枝 | `tests/e2e/guest.spec.ts:274` |
| 結果発表の表示: reduced motion | `Celebration` | `tests/e2e/guest.spec.ts:283` |
| 結果発表の表示: 結果発表中に開いたときは紙吹雪を再生しない | `celebrationOf` | `tests/e2e/guest.spec.ts:293` |
| 表彰のランクと景品の表示 | `GuestScreen` の `awards` の枝 | `tests/e2e/content.spec.ts:281`（実データ。表の行とルールが出ないこと） |

### venue-sync

| Requirement / Scenario | 実装 | テスト |
| --- | --- | --- |
| 参加者へ届ける正解の範囲: 結果発表の画面と表彰のランクと景品の画面は画面の種類だけを持つ | `src/venue/view.ts` の `finale`・`awards` の枝 | `tests/unit/view.test.ts:21`・`:35`、`tests/e2e/content.spec.ts:281`（最後の 2 画面のフレームも漏洩走査とフレーム数の検査に入る） |
| 参加者へ届ける正解の範囲: ほかのシナリオ | 変更なし | 名前の同じ既存テスト |

## Blast Radius

**安全の根拠になる事実.** 最後の 2 画面の状態は `{ phase }` だけで、正解情報を持たない。単体テスト（`tests/unit/view.test.ts:21`・`:35`）が、`finale`・`awards` の配信形に、どの問題の解説・ラベル・順位も含まれないことを確かめる。実データの content E2E（`tests/e2e/content.spec.ts:281`）は、参加者が最後の 2 画面まで受け取ったフレームを漏洩走査に通し、フレーム数が `1 + intro + 問題数 + outro` であることを確かめる。最初の実行ではこのフレーム数の検査が 2 件多いと落ちた。2 画面のフレームが走査の対象に入ったことは、それで確かめられた。到達段階は 4（実行）。

**リスク.**
- 問題セットを変えずにコードだけをデプロイすると、`publicVersion` が変わらないので、デプロイ前に開いた参加者画面は古い JS のまま残る。古い JS は `finale`・`awards` のフレームを読めずに捨てる（`src/venue/socket.ts:168`）。その参加者画面は、司会が最後の 2 画面にいる間も最終問の表示のまま残る。HEAD~1 の `parseServerFrame` に新しいフレームを渡すスクリプトを実行し、`finale`・`awards` は null、`asking` は読めることを確かめた（段階 4）。本番前にデプロイを済ませれば起きない。
- 問題セットを変えずにコードだけをロールバックすると、古いコードは保存した `finale`・`awards` を読めず、会場はタイトル画面に戻る。HEAD~1 の `StoredSchema` に `finale`・`awards` を渡すスクリプトを実行し、`safeParse` が失敗すること（`prizes` は成功）を確かめた（段階 4）。読めない保存値をタイトル画面にする動きは、既存の `tests/unit/venue-do.test.ts:125` が確かめている。
- 表彰のランクと景品の画面は、実データに `prizes` があるときだけ E2E を通る（design.md Risks）。

**確認して問題なかったもの.**
- 新しいコードは古い保存値を読める。新しい `StoredSchema` は古い phase をすべて含む（`src/venue/room.ts`）。
- 最後の 2 画面では正解発表の操作が状態を変えない。状態機械が `index` のない状態で reveal を無視する（`src/venue/machine.ts`）。E2E の陽性対照つきテストで、キーが届いていることも確かめた。
- 最後の 2 画面では次の問題を先読みしない（`src/host/HostScreen.tsx`・`src/guest/GuestScreen.tsx` の `upcoming`）。
- 1280×720 の司会画面と、幅 390px の参加者画面の結果発表を、スクリーンショットで目で見て確かめた。

## Interrogate

tasks の段階で 2 モデル（Opus・Sonnet）に走らせた。処置は decisions.tsv の `interrogate` の行に書いた。

- **Act On**:
  - proposal のロールバックの記述の誤り。Opus が指摘し、修正した。
  - 最後の 2 画面での Enter と、文字のアニメーションの肯定側テストの欠け。2 モデルとも指摘し、テストを足した。
  - テストの describe 名と要件名の不一致。Opus が指摘し、改名した。
  - 最後の画面での先読み。Opus が指摘し、止めた。
  - tasks の粒度。2 モデルとも指摘した。会場の状態と両画面の表示に分けたが、単独では型検査が通らなかった。そのため 1 グループにまとめ、理由を tasks.md に書いた。
- **Consider（見送り）**:
  - `awards` の画面をフィクスチャで通すこと。2 モデルとも指摘した。理由は design.md Risks に書いた。
  - 表彰の画面から ◀ で結果発表に戻ったときにも紙吹雪を打つこと。Opus が指摘した。spec どおりの動きなので、design.md Risks に書いた。
- **Dismissed**:
  - 「MODIFIED でシナリオを消せる」という Opus の指摘。`openspec validate` がそのとおりにするとエラーを出すので退けた。
  - 司会画面の Stage の共通化と、`celebration` の型を判別共用体にすること。画面が 2 つ増えただけでは抽象に見合わない。
