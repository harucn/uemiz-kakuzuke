# kakuzuke

写真を見て値段の高いものを当てる格付けクイズを、会場のプロジェクタと参加者のスマホに出す Web アプリ。Cloudflare Workers で配信し、司会の進行は Durable Object「会場」が持って両画面へ WebSocket で配る。

## 画面と URL

| URL | 画面 | 使い方 |
| --- | --- | --- |
| `/` | 参加者画面 | QR コードに載せて参加者に配る。司会画面と同じ問題を表示し、正解は正解発表のときにその問題の分だけ届く |
| `/host` | 司会画面 | プロジェクタに映す。開いた人は誰でも会場を操作できるので、参加者に教えない |

## 問題と写真の追加

編集するのは `content/questions.yaml` と `content/images/` だけ。

1. 写真を `content/images/` に好きな名前で置く。使える形式は `.jpg`・`.jpeg`・`.png`・`.webp`・`.gif`・`.avif`。
2. `content/questions.yaml` の `questions` に問題を足し、`image` に写真のファイル名を書く。

```yaml
title: 2026 忘年会 格付けチェック  # 会のタイトル（参加者にも見える）
rules:                            # ゲームのルール（参加者にも見える）。省略できる
  - テーブルで相談して、答えを決めましょう
prizes:                           # ランクと景品（参加者にも見える）。省略できる
  - { rank: 1流, condition: 4問正解, prize: 景品を3つ }
  - { rank: 3流, condition: 1問以下, prize: 景品を1つ }
questions:
  - mode: pick                    # pick: 一番高いものを選ぶ / order: 高い順に並べる
    title: ワイン                  # 問題名（参加者にも見える）
    description: 高いワインはどちら？ # 説明（参加者にも見える）
    explanation: B は 1本 8万円のシャトー・マルゴー。A はスーパーで買える 1本 900円の赤ワインでした。
    options:                      # 画面に出す順に書く
      - { label: B, image: ボルドー.jpg, note: フランス産の赤ワイン, rank: 1 }
      - { label: A, image: テーブルワイン.jpg, note: チリ産の赤ワイン, rank: 2 }
```

- `title` は必須で、両画面のタイトル画面に出る。
- `rules` は書いた順に番号付きで、両画面のルール画面（タイトル画面の次）に出る。省略するとルール画面を出さず、タイトル画面の次が第 1 問になる。投影画面に収まるのは 1 行の文で 6 個まで。はみ出すと `pnpm e2e` が失敗する。
- `prizes` は正解数で決まるランク（`rank`）・条件（`condition`）・景品（`prize`）で、上のランクから書く。司会画面ではルール画面の次の画面に表で出る。参加者画面はルールとランクと景品を 1 画面に並べて出す。3 つとも必須。省略するとこの画面を出さない。
- `options` は 2〜3 個で、書いた順に画面に並ぶ。
- `label` は会場で配るものに書いたラベル。書いた順とは関係なく、A から選択肢の数番目の文字までを 1 回ずつ使う。
- `note`（選択肢の説明）は必須で、参加者にも見える。
- `rank` は値段の順位で、1 が最も高い。1 から選択肢の数までを 1 回ずつ使う。
- 正解発表では、各選択肢の写真の中央にラベルが大きく出て、`explanation`（解説）が両画面に出る。発表前の問題の分は、どちらの画面にも届かない。
- 銘柄を見せたいときは `note` に書く。`note` は発表前から出るので、書くかどうかは問題ごとに決める。
- タイトル・ルール・ランクと景品・問題名・説明・選択肢の説明に、解説の文字列と写真のファイル名（拡張子を除く）を書かない。書くとビルドが失敗する。`note` に銘柄を書くときは、写真のファイル名と同じ文字列を含まないよう写真の名前を付ける。
- 解説は 100〜150 字程度にする。投影画面からはみ出すと `pnpm e2e` が失敗する。
- 写真には意味のある名前を付ける。`a.png` のような 1〜2 文字の名前は、漏洩走査が誤検出してビルドが失敗する。
- 公開されるのは `image` で指定した写真だけで、ファイル名は中身のハッシュに置き換わる。指定していない写真は `content/images/` にあっても公開されない。

誤りはビルドと `pnpm dev` の両方で全件まとめて表示される。

## 操作（司会画面）

開くと会場の今の画面が出る。一度も操作していない会場ではタイトル画面（会のタイトルと参加者画面の QR コード）になる。▶ でルール画面、ランクと景品の画面、第 1 問の順に進み、◀ で同じ順に戻る。`rules`・`prizes` を書いていない画面は飛ばす。

| 操作 | キー | ボタン |
| --- | --- | --- |
| 次の問題へ | → / PageDown | ▶ |
| 前の問題へ | ← / PageUp | ◀ |
| 正解発表 | Space / Enter | 正解発表 |
| 全画面 | なし | ⛶ |

第 1 問より前の画面では Space・Enter は何もしない。

- 会場は 1 つだけで、進行状態は会場が持つ。再読み込みしても、別のタブや端末で司会画面を開いても、同じ画面（正解発表中なら正解発表）が出る。司会画面を 2 つ開いて同時に ▶ を押すと 2 問進む。
- 参加者画面は操作できず、司会画面に合わせて切り替わる。正解発表では司会画面と同じ正解と紙吹雪が出る。途中から開いた参加者も今の画面から始まる。
- 接続が切れると両画面に「再接続中」と出て、自動でつなぎ直す。切れている間、司会画面は操作できない。
- 問題セット（`content/`）を変えてデプロイすると、会場はタイトル画面に戻る。開いたままの古い画面は自動で読み込み直す。
- 問題セットを変えずにリハーサルから本番へ移るときは、◀ でタイトル画面まで戻しておく。

## 開発コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバーを起動する。問題ファイルの誤りはエラーオーバーレイに出る |
| `pnpm typecheck` | ブラウザ側とサーバー側（`tsconfig.worker.json`）の型を検査する |
| `pnpm test` | 単体テストを実行する |
| `pnpm build` | 問題ファイルを検証し、`/` と `/host` を事前レンダリングして、正解の漏洩を走査する。どれかが失敗したらビルドも失敗する |
| `pnpm e2e` | フィクスチャ（`tests/fixtures/content`）でビルドして E2E を流し、実データでビルドし直して全問を通す E2E を流す |
| `pnpm run deploy` | `pnpm test` と `pnpm build` の後に `wrangler deploy` で公開する |
| `pnpm run deploy:preview` | 同じ手順の最後を `wrangler preview` にして、本番に出さずにプレビューを作る。Workers Builds が main 以外のブランチで使う |

`pnpm e2e` の後の `dist` は実データのビルドなので、そのままデプロイできる。

- `pnpm dev`・`pnpm preview`・`pnpm e2e` は手元の会場（`.wrangler/state`）を共有する。E2E は各テストの前に会場をタイトル画面へ戻すので、手元の会場の状態は残らない。
- `BASE_URL` を付けて E2E をデプロイ先に流すと、会場を動かすテストは skip され、届く HTML・JS の検査だけが流れる。
- プレビュー（`wrangler preview`）にも会場がある（`wrangler.jsonc` の `previews`）。ブランチ名がないとき（detached HEAD など）は `pnpm exec wrangler preview --name <名前>` で名前を付ける。

## CI/CD

- CI: PR と main への push で GitHub Actions（`.github/workflows/ci.yml`）が `pnpm typecheck`・`pnpm test`・`pnpm e2e` を流す。
- CD: Cloudflare Workers Builds が main への push を拾ってビルドとデプロイを行う。GitHub に Secrets は置かない。

Workers Builds の設定はファイルに書けず、Cloudflare ダッシュボードで一度だけ設定する。手順は `package.json` の `deploy` に寄せ、ダッシュボードにはそれを呼ぶことだけを書く。

1. Workers & Pages → `kakuzuke` → Settings → Build → Connect で GitHub のこのリポジトリをつなぐ
2. 次の値を設定する

| 項目 | 値 |
| --- | --- |
| Git branch | `main` |
| Build command | 空欄 |
| Deploy command | `pnpm run deploy` |
| Preview command | `pnpm run deploy:preview` |

Node のバージョンは `.node-version` で決める。CI と Workers Builds はこのファイルを読む。asdf に読ませるには `~/.asdfrc` に `legacy_version_file = yes` を書く。Node 26 には Corepack が同梱されていない。Workers Builds が pnpm を起動できない場合は、ビルド変数に `NODE_VERSION=24` を入れる。

Workers Builds は CI の結果を待たない。単体テストと漏洩走査（`pnpm build` に含まれる）が落ちればデプロイは止まるが、E2E が落ちてもデプロイされるので、main へは CI が通った PR だけをマージする。

## 手動デプロイ

```sh
pnpm exec wrangler login   # 初回だけ
pnpm run deploy
```

直前のバージョンに戻すときは `pnpm exec wrangler rollback` を使う。

## 本番前の確認

- プレゼン用リモコンで `/host` を操作し、次へ・前へ・正解発表が効くことを確かめる。リモコンが Space・Enter を送れないと正解発表はリモコンで操作できない。
- 写真の EXIF や、写り込んだ値札・ラベルに正解が出ていないことを確かめる。漏洩走査ではこれを検出できない。
- 会場のプロジェクタに `/host` を映し、タイトル画面の QR コードを参加者のスマホで読み取って `/` が開くことを確かめる。
- ラベルはくじで決める。くじの結果がラベル順と同じ並び（A・B・C）になっても直さない。ずらすよう決めると、2 択では並びが B・A に決まってしまう。
- `content/questions.yaml` の `label` と、会場で配る実物のラベルを照合する。取り違えると正解が逆になり、ビルドでは検出できない。
- 解説の文に書いたラベル（「B は…」）と `label` を照合する。ラベルを付け替えると食い違い、ビルドでは検出できない。
