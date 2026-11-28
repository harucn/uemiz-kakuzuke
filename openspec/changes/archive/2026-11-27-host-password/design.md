# Design

## Context

- `/host` の HTML は事前レンダリングした静的アセットで、Worker を通らない（`wrangler.jsonc:7`、`vite.config.ts:11`）。HttpOnly の Cookie は JS から読めない。そのため、ログイン済みかどうかは、クライアントが実行時に HTTP で確かめるしかない。
- ブラウザの WebSocket は、HTTP 401 で拒否された upgrade を close 1006 としてしか受け取れない。`socket.ts` はどんな切断でも再接続を続け、未認可を表す状態を持たない（`src/venue/socket.ts:3`・`:126`）。
- 役割は URL の `role` だけで決まり（`src/venue/room.ts:56`）、DO はタグで操作を受け付ける（`room.ts:64`）。Worker は `/api/venue` をそのまま DO に渡す（`src/server.ts:8`）。
- `wrangler secret put` は新しい版をデプロイするので、パスワードを変えると、つないでいる司会画面の接続は切れ、つなぎ直しが拒否される（Cloudflare の挙動からの推測で、未検証）。そのため、ログイン後に Cookie が無効になる経路は、パスワードを変えるたびに通る。
- E2E は `vite preview` に対して流れ（`playwright.config.ts:19`）、司会の接続は Node の `WebSocket` で開く（`tests/e2e/venue.ts:22`）。
- `@cloudflare/vite-plugin` は、ビルド時にルートの `.dev.vars`（なければ `.env` と、`secrets.required` に挙げたキーの `process.env`）を `dist/server/.dev.vars` に書き出し、`vite preview` はそれを読む（設計の候補 2 案がプラグインと wrangler のソースで確認）。

## Goals / Non-Goals

**Goals:**

- 正しいパスワードでログインした司会画面だけが、会場の進行を変えられる。認可は、Worker が DO へ渡す分岐の中で行う。
- ログイン前の司会画面は、会場への WebSocket を開かない。これを `if` の分岐ではなく、コンポーネントのマウントで保証する。
- 参加者画面、DO、`useVenue` の呼び出し方は変えない。

**Non-Goals:**

- 総当たり対策、ログアウト、複数のパスワード。
- パスワードを変えたときに、つないでいる司会の接続を Worker から切ること（デプロイで切れる場合は、上の経路で入力欄に戻る）。

## Decisions

### データの形

サーバー側に保存する状態はない。Cookie の値はパスワードから決まる 1 つの派生値で、クライアントの状態は 1 つの判別共用体で表す。

```ts
// src/venue/host-auth.ts（パスワードを知るのはこのファイルだけ）
/** HMAC-SHA256(key = SHA-256(HOST_PASSWORD), message = "kakuzuke:host") の base64url（43 文字）。
 *  鍵を固定長の SHA-256 にするのは、HMAC が短い鍵の末尾を 0 で埋めるため（"pw" と "pw\0" が同じ鍵になる） */
type SessionToken = string;

// src/host/gate.ts（ログイン済みかを持つのはこのファイルだけ）
export type Gate =
  | { readonly kind: "checking"; readonly failures: number } // SSR・確認中。failures > 0 なら「再接続中」を出して確認し直す
  | { readonly kind: "locked"; readonly error: null | "wrong" | "network" }
  | { readonly kind: "open" };

export type GateEvent =
  | { readonly type: "probed"; readonly result: Probe }
  | { readonly type: "login"; readonly result: "ok" | "wrong" | "network" }
  | { readonly type: "expired" };

/** GET HOST_SESSION_PATH の結果。204 だけが authorized、401 だけが unauthorized、それ以外の状態と fetch の失敗は network */
export type Probe = "authorized" | "unauthorized" | "network";
```

```
checking --probed authorized-->   open
checking --probed unauthorized--> locked(null)
checking --probed network-->      checking(failures+1)   「再接続中」を出し、バックオフで確認し直す
locked   --login ok-->            open                   ここで初めて HostVenue がマウントされ、useVenue("host") が購読する
locked   --login wrong-->         locked("wrong")
locked   --login network-->       locked("network")
open     --expired-->             locked(null)           HostVenue がアンマウントされ、購読が 0 になって socket が閉じる
```

### 呼び出し側の使い方

```ts
// src/server.ts。ルーティングはここだけ。DO へ渡す分岐の中で認可するので、検証を通らずに DO へ届く経路を作れない
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === HOST_SESSION_PATH) return hostSession(request, env.HOST_PASSWORD);
    if (url.pathname === VENUE_PATH) {
      if (roleOf(url) === "host" && !(await isHost(request, env.HOST_PASSWORD))) return new Response(null, { status: 401 });
      return env.VENUE.getByName(VENUE_NAME).fetch(request);
    }
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

```tsx
// src/host/HostScreen.tsx
export function HostScreen({ set }: { readonly set: PublicQuestionSet }) {
  const { gate, login, expire } = useHostGate();
  switch (gate.kind) {
    case "checking": return <HostChecking failures={gate.failures} />;   // <main aria-label="司会画面">。事前レンダリングの HTML もこれ
    case "locked":   return <HostLogin error={gate.error} onSubmit={login} />;
    case "open":     return <HostVenue set={set} onExpired={expire} />;  // 今の HostScreen の本体。useVenue("host") はここだけ
  }
}
```

```ts
// tests/e2e/venue.ts
const host = await connectHost(baseURL!);                       // 今のまま。host は setup で得た Cookie を自動で付ける
const bare = connectVenue(baseURL!, "host", { cookie: null });  // 拒否の検査だけ Cookie を外す
```

### シグネチャ

```ts
// src/venue/protocol.ts（追加）
export const HOST_SESSION_PATH = "/api/host-session";
/** role のクエリから役割を決める。"host" だけが host で、それ以外は guest。同じキーが複数あれば最初の値（URLSearchParams.get） */
export function roleOf(url: URL): Role;
```

```ts
// src/venue/host-auth.ts。Request・Response・crypto.subtle だけを使うので、tsconfig の Worker 専用のリストには足さない
/**
 * HOST_SESSION_PATH の応答。どの応答も Cache-Control: no-store。
 * - GET: isHost なら 204、それ以外は 401
 * - POST {"password": string}: 一致なら 204 と Set-Cookie。誤り・空・読めない本文は 401
 * - そのほかのメソッドは 405
 * secret が undefined か "" なら、WebCrypto を呼ぶ前に 401 を返す
 */
export function hostSession(request: Request, secret: string | undefined): Promise<Response>;
/** Cookie の値が secret の SessionToken と一致するか。secret が undefined か "" なら false */
export function isHost(request: Request, secret: string | undefined): Promise<boolean>;
/** 漏洩検査が派生値を探すためにも使う */
export function sessionToken(secret: string): Promise<SessionToken>;

// 以下は export しない
const COOKIE = "kakuzuke_host";
const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Strict; Path=/"; // 有効期限なし = セッション Cookie
const LoginSchema = z.strictObject({ password: z.string().min(1) });
/** crypto.subtle.verify("HMAC") で比べる。長さの違う値や base64url として読めない値は false。同じ名前の Cookie が複数あれば最初の値 */
async function verifies(token: string, secret: string): Promise<boolean>;
// ログインの照合は verifies(await sessionToken(submitted), secret)。比べるのは常に固定長の MAC なので、一致した文字数で時間は変わらない
```

```ts
// src/host/gate.ts
export function reduceGate(gate: Gate, event: GateEvent): Gate; // 純粋。上の表にない組は現状維持
export function useHostGate(): { gate: Gate; login(password: string): Promise<void>; expire(): void };
/** connection が "lost" になった時点で GET HOST_SESSION_PATH し、その後も lost の間は 5 秒ごとに確かめる。
 *  unauthorized なら onExpired。network は無視する（会場が落ちているだけのときに入力欄へ戻さない） */
export function useExpiryWatch(connection: Connection, onExpired: () => void): void;
```

- `src/venue/socket.ts` の `close()` で、`connection`・`frame`・`failures` を初期値に戻し、`current` を作り直す。ログインし直したとき、モジュールの `Map` に残ったソケットが古い問題と「再接続中」を一瞬出したり、バックオフが上限から始まったりしないようにするため。`socket.ts:58` のコメントを「購読が 0 になったら初期状態に戻る。それ以外に connecting へ戻る遷移はない」に直す。`close()` は購読が 0 になったときだけ呼ばれるので、表示中の参加者画面の挙動は変わらない。
- `src/host/HostLogin.tsx`（新規）は、`<main aria-label="司会画面">` の中にパスワード入力欄とログインのボタンを置き、`error` があれば `role="alert"` の文を出す。`HostChecking` は、`failures > 0` なら既存の `HostScreen` と同じ「再接続中」を出す。タイマーは持たない。

### 設定と型

- `wrangler.jsonc` に `"secrets": { "required": ["HOST_PASSWORD"] }` を足し、`wrangler types` で `worker-configuration.d.ts` を作り直す。`Env.HOST_PASSWORD` は型では `string` だが、未設定なら実行時は `undefined` なので、`hostSession` と `isHost` は `string | undefined` で受ける。
- `.gitignore` に `.dev.vars*`・`.env*`・`playwright/.auth` を足す。

### テストの配管

- **パスワード**: `package.json` の `e2e` の先頭を `export HOST_PASSWORD=${HOST_PASSWORD:-e2e-password};` にして、2 回のビルドと 2 回の `playwright test` のすべてに効かせる。CI は job の `env` にテスト専用の値を置く。GitHub secret にしないのは、本番の値ではなく、fork からの PR でも E2E を流せるようにするため。
- **Cookie は本物のログインで得る**: Playwright に `setup` project を足し、`scenario` と `content` の `dependencies` にする。
  - setup は、`vite preview` が実際に読む `dist/server/.dev.vars` から `HOST_PASSWORD` を読む（`node:util` の `parseEnv`）。開発者のルートに別の `.dev.vars` や `.env` があっても、ビルドに入った値と食い違わない。
  - その値で `POST /api/host-session` を呼び、`storageState` を `playwright/.auth/host.json` に書く。
  - `BASE_URL` へ流すときは、setup を飛ばす。
- **ブラウザ**: `use.storageState` に `playwright/.auth/host.json` を指定する（`BASE_URL` がないときだけ）。ログイン前を検査するテストは、`test.use({ storageState: { cookies: [], origins: [] } })` の describe に置く。Chromium は `http://localhost` でも `Secure` の Cookie を送る。`relayVenue` の `connectToServer` もページの中で本物の WebSocket を開くので、Cookie が載る（候補 1 案が確認済み）。
- **Node の司会の接続**: `connectVenue` は `playwright/.auth/host.json` の Cookie を `headers` で載せる。`tsconfig.json` の DOM の lib ではグローバルの `WebSocket` が `{ headers }` を受けない型になる。そこで `tests/e2e/venue.ts` に、undici の `WebSocketInit` を受けるコンストラクタとして型を付け直すヘルパーを 1 つ置く（実行時は Node 26 のグローバル `WebSocket` のまま）。
- **`content.spec.ts:181`（本番にも流れる検査）**: ログイン前の describe に移す。入力欄が出ること、HTTP の応答に正解情報がないこと、`/api/venue` への接続を開かないことを確かめる。本番でもパスワードなしで流れる。
- **ビルドの漏洩検査**（`tests/build`）:
  - 陽性対照として、`dist/server/.dev.vars` にパスワードがあることを確かめる。
  - そのうえで、`dist/server/.dev.vars` を除く `dist` の全ファイルに、パスワードと `sessionToken(パスワード)` がないことを確かめる。
  - 見つかったときのメッセージは、ファイル名と位置だけにして、値を出さない。
  - パスワードのないビルド（`pnpm run deploy`）では、検査を飛ばしたことをテスト名で示す。GitHub Actions（`GITHUB_ACTIONS=true`）でパスワードがなければ失敗させる。Workers Builds も `CI=true` を付けてパスワードなしでビルドするので、`CI` では判定しない。

### 却下した案

- **upgrade を受けてから close 4401 で閉じ、`socket.ts` に終端の `refused` を足す（候補 1 案）。** 無効になったことを即座に伝えられる。しかし、拒否が HTTP 401（Node のテストと `GET`）と close 4401 の 2 通りになる。さらに、`socket.ts` の段階、司会だけの `Connection` 型、ブランド型 `HostPass` が増える。切れた時点ですぐ GET で確かめれば、1 往復で入力欄に戻れる。
- **事前確認をやめ、WebSocket だけで判定する。** ログイン前に接続を開くので、spec の「ログイン前は会場への接続は開かれない」に反する。
- **事前確認がネットワークの失敗で終わったら `open` にして、`socket.ts` の再接続に任せる（レビュー A の提案）。** `failures` と再試行がなくなる。しかし、ログインしていない人の画面が会場へつなぎにいくので、上の spec に反する。
- **ランダムなセッション ID を DO か KV に保存する。** ログアウトと個別の失効は範囲外。保存先と掃除が増え、パスワード変更時の失効も別に作る必要がある。
- **署名用の別 secret を持つ。** パスワードを変えても Cookie が残り、spec に反する。
- **`run_worker_first` で `/host` の HTML を Worker でゲートする。** 守る対象は接続で、ページは公開データだけ。事前レンダリングの前提が崩れる。
- **`useVenue("host")` に `enabled` 引数を足す。** 呼び出し側が渡し忘れうる。マウントを分ければ、渡し忘れが起きない。
- **認可を `Response | null` を返す入口の 1 関数にまとめる（最初の設計）。** ルーティングを `server.ts` と認可関数で 2 回判定することになり、片方だけ変えると DO への抜け道ができる。
- **テストで Cookie の値を計算する。** 実装の式の写しになり、ログインの API を通らない。
- **`__Host-` 接頭辞の Cookie 名。** 独自ドメインの兄弟サブドメインからの上書きを防げる。しかし今は `workers.dev` で運用していて、localhost の preview での扱いを確かめる手間に見合わない。

### 合成の記録

- 土台は候補 2 案（差分を最小にする案）。拒否は HTTP 401 の 1 通りで、`Gate` を `socket.ts` の外に置く。
- 候補 1 案から取り入れたもの:
  - `crypto.subtle.verify` による比較と `LoginSchema`。
  - `Cache-Control: no-store`。
  - `content.spec.ts:181` をログイン前の検査にすること。
  - 漏洩検査の範囲を「`.dev.vars` を除く `dist` 全体」にすること。
  - Secure Cookie と `connectToServer` の確認結果。
- 審査役のサブエージェントは立てなかった（skip）。2 案は Cookie の方式・事前確認・`roleOf`・`secrets.required`・クライアントの判別共用体で一致しており、違いはログイン後に Cookie が無効になったことを知る手段だけだったため。

### interrogate の反映

レビュアー A（Opus）と B（Sonnet）の指摘のうち、Act On として反映したもの:

- `e2e` の前置き代入は最初のコマンドにしか効かない（A・B）。`export` にした。
- ログイン後に無効になる経路が spec の MUST NOT に反し、テストもない（A・B）。spec を「切れてから 5 秒以内に入力欄へ戻す」に直し、シナリオを足した。`useExpiryWatch` は、切れた時点ですぐ確かめる。
- タスクの途中で E2E が赤くなる（A・B）。Cookie の配管を、Worker の拒否と同じタスクに入れた。
- テスト用の Cookie の作り方が未設計（A・B）。setup project での本物のログインにした。
- 既存の spec の要件と矛盾する（A）。host-screen の 3 つと venue-sync の 1 つを MODIFIED にした。
- `hostGate` がルーティングと認可を別々に判定する（A・B）。ルーティングを `server.ts` に寄せた。
- `HOST_SESSION_PATH` の置き場所（A）。`protocol.ts` に移し、`host-auth.ts` を Worker 専用のリストから外した。
- 空の secret を WebCrypto の例外に頼っていた（A）。先に 401 にした。
- HMAC の鍵の 0 埋め（A）。鍵を SHA-256 にし、spec にシナリオを足した。
- 漏洩検査の陽性対照、CI での未設定、派生値、メッセージの値（A・B）。
- `{ headers }` が型検査を通らない（A）。型を付け直すヘルパーを置く。
- `close()` で `failures` を戻していない（A・B）。
- 確認の API の 204・401 以外の扱い（A）。
- venue-sync の新しいシナリオは、拒否された接続に送れないので実行できない（A）。書き直した。

Consider・Noted・Dismissed:

- `Secure` の Cookie は、http の LAN アドレスと Safari の localhost では保存されない（B）。本番は https の `workers.dev` で、ローカルの確認は Chromium で行うので、README に書くだけにする。
- Cookie が漏れたときのオフラインの総当たり（A・B）。PBKDF2 などは入れず、README に長いパスワードを勧める。
- セッション Cookie は、ブラウザの「前回のページを開く」で再起動後も残る（A）。README に「パスワードを変えるまで使える。会場の PC では使い終わったら Cookie を消す」と書く。
- `wrangler deploy` と `deploy:preview` の secret 未設定時の挙動は未検証（B）。Risks に残す。
- DO が単体では認可しない（B）。DO の入口は Worker だけなので受け入れる。重複した `role` の単体テストは足す。
- `__Host-` 接頭辞（A）。上の却下理由のとおり。

## Risks / Trade-offs

- Cookie の値はパスワードから決まる固定の値なので、漏れるとパスワードを変えるまで使え、手元でパスワードを総当たりされうる。代わりに保存する状態がない。
- 初回表示では `checking` の空の画面が 1 往復分見える。代わりに、ログイン済みの司会に入力欄が一瞬出ることはない。
- `secrets.required` を足すと、デプロイ先に `HOST_PASSWORD` がなければ `wrangler deploy` が失敗するはず（候補 1 案が wrangler のソースから読んだだけで、未検証）。どちらでも `isHost` は失敗側に倒れる。`deploy:preview` の環境にも secret が要るかは未確認。
- `dist/server/.dev.vars` にはパスワードが入る。理由は 3 つで、`dist/client/.assetsignore` が除外していること、Worker の upload は `wrangler.json` の module の規則（`*.js`・`*.mjs`）が拾うファイルだけであること、`dist` が `.gitignore` に入っていることから、配信もデプロイもされない。
- パスワードの変更でデプロイされても、つないでいる司会の接続が切れないなら、その司会画面は次に切れるまで操作できる（範囲外）。
