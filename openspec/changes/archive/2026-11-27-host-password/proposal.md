# Proposal

## Why

今は `/host` を開くか、`/api/venue?role=host` に直接つなげば、誰でも会場を操作できる（`src/venue/room.ts:56`）。参加者が司会の URL を知ったり推測したりすると、本番の進行を勝手に進められる。司会の操作をパスワードで守り、司会だけが進行を動かせるようにする（sharpen.md の Sharpened）。

## What Changes

- パスワードは Worker secret `HOST_PASSWORD` に置く。
- ログインの API を足す。正しいパスワードを受け取ると、署名付きの HttpOnly Cookie を有効期限なし（ブラウザを閉じるまで）で発行する。
- Worker は `role=host` の WebSocket 接続を、Durable Object に渡す前に Cookie で検証する。正しくなければ拒否し、参加者には落とさない。
- 司会画面は、ログインするまでパスワード入力欄だけを出す。誤ったパスワードでは誤りを伝えて入力欄のままにする。ログイン後は今まで通りの画面を出す。
- 参加者画面は変えない。
- 範囲外は、総当たり対策・ログアウト・複数のパスワード・secret を変えたときの既存の司会接続の切断。

## Capabilities

### New Capabilities

- `host-auth`: 司会のパスワード、ログインと Cookie の発行、司会としての接続の検証。

### Modified Capabilities

- `host-screen`: ログインするまでパスワード入力欄を出し、会場につながない。ログインが無効になったら入力欄に戻す。タイトル画面・進行状態の表示・接続が切れている間の表示は、ログインした司会画面についての要件にする。
- `venue-sync`: 進行状態を変えられるのは、正しい Cookie を持つ司会の接続だけになる。ログインが無効だとわかった司会画面は再接続をやめる。

## Impact

- コード: `src/server.ts`（ログインの API と接続の検証）、`src/host/HostScreen.tsx`（入力欄と、ログイン後にだけ会場へつなぐこと）、`src/venue/socket.ts`（未認可の扱い）、`worker-configuration.d.ts`（`HOST_PASSWORD`）。
- 設定と運用: デプロイ前に `wrangler secret put HOST_PASSWORD` が要る。ローカルとテストは `.dev.vars` で渡し、`.gitignore` に足す。CI は `pnpm e2e` の前にテスト用のパスワードを用意する。README の「開いた人は誰でも会場を操作できる」を書き換える。
- テスト: E2E の司会の接続（`tests/e2e/venue.ts` の `connectVenue`）と `/host` を開く箇所は、ログインしてから使う。本番に流す `content.spec.ts:181` の扱いを見直す。
- 完了の判定は sharpen.md の Done Means。
