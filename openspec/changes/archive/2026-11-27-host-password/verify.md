# Verify

## Result

PASS。CRITICAL は 0 件。

- `openspec validate host-password` は valid。
- `pnpm typecheck`・`pnpm test`（276 件）・`pnpm e2e`（scenario 109 件・content 9 件、ビルドの検査 14 件 × 2）が通る（`aa978fc` で計測）。
- 最初の対応表では PARTIAL が 3 件あった。`aa978fc` で E2E を足して埋めた。
  - 改ざんした Cookie の接続が拒否されることと、古いパスワードの Cookie の接続が拒否されることは、単体テストの `isHost` でしか確かめていなかった。
  - 「ログイン済みかを確かめている間の再接続中」には E2E がなかった。

## Spec Coverage

### host-auth

| Scenario | コード | テスト |
| --- | --- | --- |
| パスワード未設定ではログインできない | `src/venue/host-auth.ts:64` | `tests/unit/host-auth.test.ts:59` |
| ビルドの成果物にパスワードを含めない | `tests/build/host-password.test.ts`（陽性対照 `:44`） | `tests/build/host-password.test.ts:48` |
| 正しいパスワードで Cookie を発行する | `src/venue/host-auth.ts:68` | `tests/unit/host-auth.test.ts:26`、`tests/e2e/auth.setup.ts` |
| 誤ったパスワードでは Cookie を発行しない | `src/venue/host-auth.ts:69` | `tests/unit/host-auth.test.ts:42` |
| 正しいパスワードの末尾に文字を足したものでは Cookie を発行しない | `src/venue/host-auth.ts:14`（鍵を SHA-256 にする） | `tests/unit/host-auth.test.ts:42`（NUL の行） |
| 空のパスワードでは Cookie を発行しない | `src/venue/host-auth.ts:9` | `tests/unit/host-auth.test.ts:42` |
| 正しい Cookie を持つ司会の接続は会場に渡す | `src/server.ts:13` | `tests/e2e/venue.spec.ts:51`（最後の行） |
| Cookie のない司会の接続は拒否する | `src/server.ts:13` | `tests/e2e/venue.spec.ts:51` |
| 改ざんした Cookie の司会の接続は拒否する | `src/server.ts:13`、`src/venue/host-auth.ts:26` | `tests/e2e/venue.spec.ts:66`、`tests/unit/host-auth.test.ts:86` |
| パスワードを変えると古い Cookie は使えない | `src/venue/host-auth.ts:14` | `tests/e2e/venue.spec.ts:66`、`tests/unit/host-auth.test.ts:107` |
| 参加者の接続は Cookie なしで受け付ける | `src/server.ts:13`、`src/venue/protocol.ts`（`roleOf`） | `tests/e2e/venue.spec.ts:38`、`tests/unit/protocol.test.ts:61` |

### host-screen（ADDED）

| Scenario | コード | テスト |
| --- | --- | --- |
| ログイン前はパスワード入力欄だけを表示する | `src/host/HostScreen.tsx:20`、`src/host/HostLogin.tsx` | `tests/e2e/host.spec.ts:146`、`tests/e2e/content.spec.ts:181` |
| 正しいパスワードで会場の今の画面を表示する | `src/host/gate.ts`（`useHostGate`） | `tests/e2e/host.spec.ts:158` |
| 誤ったパスワードでは入力欄のままにする | `src/host/HostLogin.tsx`、`src/host/gate.ts` | `tests/e2e/host.spec.ts:178` |
| ログイン後は再読み込みしても入力欄を出さない | `src/host/gate.ts`（確認の GET） | `tests/e2e/host.spec.ts:188` |
| ログイン後は新しいタブでも入力欄を出さない | 同上 | `tests/e2e/host.spec.ts:197` |
| 無効な Cookie で開くと入力欄を出す | `src/host/gate.ts`、`src/host/HostScreen.tsx`（`HostChecking`） | `tests/e2e/host.spec.ts:211` |
| つないでいる間に Cookie が無効になると入力欄に戻す | `src/host/gate.ts`（`watchExpiry`・`useExpiryWatch`）、`src/venue/socket.ts:195` | `tests/e2e/host.spec.ts:225`（5 秒以内・再接続の試行が増えないこと）、`tests/unit/host-gate.test.ts:100` |

### host-screen（MODIFIED）

| Scenario | テスト |
| --- | --- |
| 会場がタイトル画面のときに開くとタイトル画面を表示する | `tests/e2e/host.spec.ts:243` |
| QR コードを読み取ると参加者画面の URL になる | `tests/e2e/host.spec.ts:250` |
| 第 3 問で再読み込みすると第 3 問に戻る ほか 2 件 | `tests/e2e/host.spec.ts:371` の describe |
| 接続が切れると再接続中と表示する | `tests/e2e/host.spec.ts:423` |
| 最初につながらないときは再接続中と表示する | `tests/e2e/host.spec.ts:433`（WebSocket が止まる場合）、`tests/e2e/host.spec.ts:442`（ログインの確認が止まる場合） |
| 接続が切れている間のキー操作は捨てる | `tests/e2e/host.spec.ts` の同じ describe |

`:433` が確かめるのは、「再接続中」が 10 秒以内に出ることまでです。5 秒ちょうどかどうかは確かめていません。この検査は変更前からあり、今回の変更で時間の扱いは変えていないので、CRITICAL にはしていません。

### venue-sync（MODIFIED）

| Scenario | テスト |
| --- | --- |
| 2 つの司会画面は同じ状態を表示する | `tests/e2e/host.spec.ts`（「会場の進行状態を表示する」） |
| 参加者画面でキーを押しても進行状態は変わらない | `tests/e2e/guest.spec.ts:535` |
| 参加者としての接続から操作を送っても進行状態は変わらない | `tests/unit/venue-do.test.ts:166` |
| ログインせずに司会としてつなぐと拒否される | `tests/e2e/venue.spec.ts:51` |
| 自動の再接続の 3 件 | `tests/e2e/guest.spec.ts:484`・`:497`・`:520` |
| ログインが無効だとわかった司会画面は再接続をやめる | `tests/e2e/host.spec.ts:225` |

## Blast Radius

**安全だと言える事実**: 認可を通るのは `role=host` の接続だけで、参加者の経路と DO は変わりません。到達度 4 で、実行して確かめました。

- `src/server.ts:13` は `roleOf(url) === "host"` のときだけ `isHost` を呼びます。`roleOf` は `"host"` 以外をすべて guest にします（`tests/unit/protocol.test.ts:61`）。
- Cookie を持たない Node の参加者の接続は、今まで通り状態を受け取ります（`tests/e2e/venue.spec.ts:38`、通過）。
- 認可を外す変異を入れると、拒否の 3 件（`venue.spec.ts:51`・`:66` × 2）だけが落ちることを確かめました（`aa978fc` の作業中に計測）。

**リスク**

- **本番の secret がないままデプロイする**: 起きうる。ただし実害はありません。
  - wrangler 4.163.0 は、`secrets.required` に挙げた名前を `inherit` の束縛としてアップロードします（`node_modules/wrangler/wrangler-dist/cli.js:179001`）。
  - 既存の Worker に secret がないと、API のエラーを「required secrets have not been set」としてデプロイを失敗させます（`cli.js:179026`）。
  - 到達度 2 です。ソースを読んだだけで、実際にデプロイはしていません。
  - 失敗したときは、前の版が動き続けます。
- **`deploy:preview`（`wrangler preview`）の secret の扱い**: unproven。プレビュー用の束縛（`wrangler.jsonc` の `previews`）が secret を引き継ぐかは確かめていません。引き継がない場合は、プレビューで司会がログインできません。本番には影響しません。
- **Workers Builds が `CI=true` を付けること**: `094d42c` で対処しました。パスワードなしのビルドで漏洩検査を落とすのは、`GITHUB_ACTIONS=true` のときだけです。`CI=true` だけでは検査を飛ばし、`GITHUB_ACTIONS=true` では失敗することを、手元で実行して確かめました。
- **ブラウザの E2E の参加者ページも司会の Cookie を持つ**: E2E の `storageState` は project 単位で付くので、`guest.spec.ts` のブラウザも Cookie を持ちます。参加者画面は Cookie を使いませんが、ブラウザで「Cookie なしの参加者」を確かめる検査はありません。これを補うのが Node の `venue.spec.ts:38` です。影響は小さいと見ています。
- **事前レンダリングした `/host` の HTML**: 中身が空の確認中の画面に変わりました。本番にも流れる `tests/e2e/content.spec.ts:181` を、ログイン前の検査に移してあります。本番の URL に対してはまだ流していません。

**問題がないと確かめたこと**

- **`socket.ts` の `close()` で状態を戻す変更**: `close()` が呼ばれるのは購読が 0 になったときだけです（`src/venue/socket.ts:214`）。そのため、表示中の参加者画面の挙動は変わりません。閉じてから購読し直したときに古い問題を出さないことは、単体テスト（`tests/unit/use-venue.test.ts`）で確かめています。
- **`dist/server/.dev.vars` のパスワード**: 本検査がこのファイル以外の `dist` 全体を走査し、通っています。値を埋め込むと失敗し、出力に値が出ないことも確かめました。

## Interrogate

実行していません。設計の未決事項は残っていません。interrogate の指摘は design.md の「interrogate の反映」で処理済みです。
