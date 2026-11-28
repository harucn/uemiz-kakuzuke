# Sharpen

## Request

> 進行画面にパスワード入力しないと開けなくしたいな。どうするといい？

対話で確定した前提: 守る対象はページではなく司会としての接続。パスワードは Worker secret に置き、ログインで発行した Cookie を WebSocket の接続時に検証する。ログインはブラウザを閉じるまで有効。総当たり対策・ログアウト・複数のパスワードは範囲外。

## Sharpened

司会の操作をパスワードで守る。

- **パスワード**: Worker secret `HOST_PASSWORD` に置き、リポジトリに入れない。
- **ログイン**: 司会画面はログインするまでパスワード入力欄を出す。正しいパスワードを入れると署名付きの HttpOnly Cookie が発行され、会場の今の画面が出る。Cookie はブラウザを閉じるまで有効（有効期限を付けない）。間違ったパスワードでは入力欄のままで、誤りを伝える。
- **操作の権限**: 正しい Cookie を持つ接続だけを司会として扱う。Cookie のない、または不正な `role=host` の接続は拒否し、参加者に落とさない。
- **参加者画面**: 変えない。
- **範囲外**: 総当たり対策（回数制限）、ログアウトボタン、複数のパスワード、ログイン後に secret を変えたときの既存の司会接続の切断。

## Current System

- Worker は `/api/venue` への要求をすべて、そのまま会場の Durable Object に渡す。役割は見ていない（`src/server.ts:8`）。
- 役割は URL の `role` だけで決まる。`host` 以外は参加者になる（`src/venue/room.ts:56`）。この役割は `acceptWebSocket` のタグとして付き（`room.ts:58`）、操作を受け付けるかどうかはタグだけで判定する（`room.ts:64`）。いったん受け付けた接続は、休止から戻っても同じ権限のまま。
- クライアントは `venueUrl(origin, role)` で `?role=host` を付けて接続する（`src/venue/protocol.ts:75`、`src/venue/useVenue.ts:15`）。同じオリジンの WebSocket なので、Cookie は自動で送られる。
- `/host` の HTML は事前レンダリングした静的アセットで（`vite.config.ts:11`）、`assets` に `run_worker_first` がないため Worker を通らない（`wrangler.jsonc:7`）。そのため HTML の段階ではゲートできない。ログイン済みかどうかは、クライアントが実行時に確かめる必要がある。
- 接続が拒否されると、クライアントには close（1006）が届くだけで、HTTP ステータスは読めない。`socket.ts` はどんな切断でも `lose()` で無限に再接続し（`src/venue/socket.ts:126`・`:130`）、状態は `connecting | open | lost` の 3 つだけ（`socket.ts:3`）。未認可を表す状態はない。
- `HostScreen` は `useVenue("host")` を無条件に呼ぶ（`src/host/HostScreen.tsx:19`）。ソケットはモジュール内の `Map` に置かれ、購読した時点で接続が始まる（`useVenue.ts:9`、`socket.ts:201`）。そのため、ログインするまでは `useVenue("host")` を呼ぶ部分をマウントしてはいけない。
- `Env` は `wrangler types` で生成した `worker-configuration.d.ts` にあり、今は `VENUE` だけ。
- E2E は `vite preview` に対して流れる（`playwright.config.ts:19`）。司会の接続は Node の `WebSocket` から Cookie なしで開いている（`tests/e2e/venue.ts:22` の `connectVenue`。`resetVenue`・`freshVenue`・`connectHost` もこれを使う）。ブラウザでは `page.goto("/host")` で開く（`host.spec.ts`・`guest.spec.ts`・`content.spec.ts`）。
- `content.spec.ts:181` の検査は本番（`BASE_URL`）にも流れ、`/host` を開いて `.host` が見えることを前提にしている。
- `.dev.vars` は `.gitignore` に入っていない。CI（`.github/workflows/ci.yml:26`）には env も secret もない。
- 単体テストは `tests/unit/venue-do.test.ts`（役割付きの Request は `:78`）と `tests/unit/use-venue.test.ts`。

## Done Means

- 単体テストで次を確かめる。
  - Cookie の発行と検証。正しいパスワードなら発行され、誤りなら発行されない。正しい Cookie は通し、改ざんした Cookie と Cookie なしは拒否する。
  - Cookie のない `role=host` の接続が Durable Object に届かない。
- E2E で次を確かめる。
  - Cookie なしの Node の WebSocket で `role=host` につなぐと拒否され、送った操作で進行状態が変わらない。
  - 司会画面は、ログイン前はパスワード入力欄だけを出す。誤ったパスワードでは入力欄のままになる。正しいパスワードで今の画面が出て操作できる。再読み込みしても入力し直さずに済む。
  - 参加者画面は今まで通り。
- `pnpm typecheck`・`pnpm test`・`pnpm e2e`・`pnpm build`・`openspec validate host-password` が通る。CI でも `pnpm e2e` が通る。
