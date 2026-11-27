# Tasks

各タスクは「作る → 検証コマンドが通る → コミット」で閉じる。どのコミットでも `pnpm typecheck && pnpm test && pnpm e2e` が通る順に並べる。

## 1. サーバーで司会の接続を守る

- [x] 1.1 `roleOf(url)` と `HOST_SESSION_PATH` を `src/venue/protocol.ts` に足し、`src/venue/room.ts:56` を `roleOf` に置き換える。単体テストで次を確かめる。`host` は host になる。`guest`・`HOST`・`role` なし・`role=guest&role=host` は guest になる。検証: `pnpm typecheck && pnpm test`
- [x] 1.2 `src/venue/host-auth.ts`（`hostSession`・`isHost`・`sessionToken`）を作る。`tests/unit/host-auth.test.ts` で host-auth spec の全シナリオを確かめる。
  - ログイン: 未設定・空の secret、誤り・空・NUL を足したパスワード、正しいパスワード、Cookie の属性。
  - Cookie: 正しい・ない・改ざんした・別のパスワードで作った・同じ名前が 2 つ。
  - GET の 204 と 401、405、`Cache-Control: no-store`。

  検証: `pnpm typecheck && pnpm test`
- [x] 1.3 Worker で接続を拒否し、テストに Cookie を配る。1 つのコミットにまとめる。
  - `wrangler.jsonc` に `secrets.required` を足し、`wrangler types` で `worker-configuration.d.ts` を作り直す。`.gitignore` に `.dev.vars*`・`.env*`・`playwright/.auth` を足す。
  - `src/server.ts` を design のルーティングにする。
  - `package.json` の `e2e` を `export HOST_PASSWORD=...;` で始める。CI の job の `env` にテスト用の値を置く。
  - Playwright の `setup` project で本物のログインを行い、`storageState` を書き出す。`connectVenue` はその Cookie を付け、`{ cookie: null }` で外せるようにする。
  - venue-sync の「ログインせずに司会としてつなぐと拒否される」を `venue.spec.ts` に足す。

  検証: `pnpm typecheck && pnpm test && pnpm e2e` が全部通る（司会画面はまだ入力欄を持たないが、Cookie があるので今まで通り動く）。

## 2. 司会画面にログインを足す

- [x] 2.1 `src/host/gate.ts` に `Gate`・`GateEvent`・`Probe`・`reduceGate` を作る。`tests/unit/host-gate.test.ts` で、design の遷移表の全行と、表にない組で状態が変わらないことを確かめる。検証: `pnpm test`
- [x] 2.2 司会画面にゲートを入れる。
  - `useHostGate`・`useExpiryWatch`・`HostLogin`・`HostChecking` を作り、`HostScreen` を `gate.kind` の switch と `HostVenue`（今の本体）に分ける。
  - `socket.ts` の `close()` で `connection`・`frame`・`failures` を初期値に戻し、`:58` のコメントを直す。
  - 単体テストで次を確かめる。
    - `use-venue.test.ts`: 閉じてから購読し直すと、古い問題が出ず、バックオフが最初の値から始まる。
    - `useExpiryWatch`（偽のタイマー）: lost になった時点で確かめ、401 で `onExpired` を呼ぶ。network では呼ばない。
  - host-screen spec の ADDED の全シナリオを、空の `storageState` の describe で `host.spec.ts` に足す。「つないでいる間に Cookie が無効になると入力欄に戻す」は、`context.addCookies` で書き換えてから `relayVenue` で切る。
  - `content.spec.ts:181` をログイン前の describe に移し、入力欄が出ること、HTTP の応答に正解情報がないこと、`/api/venue` への接続を開かないことを確かめる。

  検証: `pnpm typecheck && pnpm test && pnpm e2e`

## 3. 漏洩検査・ドキュメント・仕上げ

- [x] 3.1 `tests/build` にパスワードの漏洩検査を足す。
  - 陽性対照: `dist/server/.dev.vars` にパスワードがある。
  - 本検査: それ以外の `dist` の全ファイルに、パスワードと `sessionToken` の値がない。メッセージには値を出さない。
  - パスワードのないビルドでは飛ばし、飛ばしたことをテスト名で示す。GitHub Actions（`GITHUB_ACTIONS=true`）なら失敗させる。Workers Builds も `CI=true` を付けるので、`CI` では判定しない。

  検証: `pnpm e2e` が通る。`.dev.vars` も `HOST_PASSWORD` もない状態で `pnpm build` を流すと、通って、検査を飛ばしたことがテスト名に出る。
- [x] 3.2 README を書き換える。
  - 画面と URL の表と、操作の節の「誰でも会場を操作できる」を直す。
  - デプロイの前に `wrangler secret put HOST_PASSWORD` を実行すること。
  - ローカルでは `.dev.vars` に書くこと。
  - ログインはブラウザを閉じるまで有効だが、ブラウザの設定によっては再起動後も残り、パスワードを変えるまで使えること。会場の PC では使い終わったら Cookie を消すこと。
  - 長いパスワードを使うこと。
  - ローカルで確かめるときは Chromium の `localhost` で開くこと。

  検証: `grep -n "誰でも" README.md` が何も返さない。
- [x] 3.3 全体を流す。検証: `pnpm typecheck && pnpm test && pnpm e2e && pnpm build && openspec validate host-password` が通る
