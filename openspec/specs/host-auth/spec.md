# host-auth Specification

## Purpose
司会のパスワードを確かめてログイン状態を Cookie で渡し、司会としての接続をその Cookie で検証する。正しいパスワードを知る人だけが会場を操作できるようにする。

## Requirements

### Requirement: パスワードの置き場所
司会のパスワードは Worker secret `HOST_PASSWORD` から読まなければならない（MUST）。パスワードとその派生値を、リポジトリと、配信またはデプロイされるビルドの成果物（参加者と司会に配る HTML・JavaScript、Worker のコード）に含めてはならない（MUST NOT）。`vite preview` のためにビルドが書き出す `dist/server/.dev.vars` は、配信もデプロイもされないので対象外とする。`HOST_PASSWORD` が設定されていないとき、ログインはすべて失敗し、司会としての接続はすべて拒否する。

#### Scenario: パスワード未設定ではログインできない
- **WHEN** `HOST_PASSWORD` を設定せずにログインを送る
- **THEN** ログインは失敗し、Cookie は発行されない

#### Scenario: ビルドの成果物にパスワードを含めない
- **WHEN** テスト用のパスワードを設定してビルドする
- **THEN** `dist/server/.dev.vars` を除くビルドの成果物のどのファイルにも、そのパスワードの文字列が含まれない

### Requirement: ログイン
ログインの API は、送られたパスワードが `HOST_PASSWORD` と一致したときだけ、司会のログインを示す Cookie を発行しなければならない（MUST）。Cookie は `HttpOnly`・`Secure`・`SameSite=Strict`・`Path=/` を持ち、有効期限（`Max-Age`・`Expires`）を持たない。パスワードの比較は、一致した文字数で処理時間が変わらない方法で行い、正しいパスワードと異なる文字列（末尾に文字を足したものを含む）を一致としてはならない（MUST NOT）。

#### Scenario: 正しいパスワードで Cookie を発行する
- **WHEN** 正しいパスワードでログインを送る
- **THEN** 成功が返り、`HttpOnly`・`Secure`・`SameSite=Strict`・`Path=/` を持ち有効期限のない Cookie が発行される

#### Scenario: 誤ったパスワードでは Cookie を発行しない
- **WHEN** 誤ったパスワードでログインを送る
- **THEN** 失敗が返り、Cookie は発行されない

#### Scenario: 正しいパスワードの末尾に文字を足したものでは Cookie を発行しない
- **WHEN** 正しいパスワードの末尾に NUL 文字を足した文字列でログインを送る
- **THEN** 失敗が返り、Cookie は発行されない

#### Scenario: 空のパスワードでは Cookie を発行しない
- **WHEN** 空の文字列、またはパスワードのない本文でログインを送る
- **THEN** 失敗が返り、Cookie は発行されない

### Requirement: 司会としての接続の検証
`role=host` で会場につなぐ要求は、正しいログインの Cookie を持つときだけ会場に渡さなければならない（MUST）。Cookie がない、または改ざんされた要求は会場に渡さずに拒否し、参加者としての接続に切り替えてはならない（MUST NOT）。`HOST_PASSWORD` を変えると、それまでに発行した Cookie は正しくなくなる。参加者としての接続は Cookie を確かめない。

#### Scenario: 正しい Cookie を持つ司会の接続は会場に渡す
- **WHEN** ログインで発行された Cookie を付けて `role=host` で会場につなぐ
- **THEN** 接続は受け付けられ、今の進行状態が届く

#### Scenario: Cookie のない司会の接続は拒否する
- **WHEN** Cookie を付けずに `role=host` で会場につなぐ
- **THEN** 接続は拒否され、会場には届かない

#### Scenario: 改ざんした Cookie の司会の接続は拒否する
- **WHEN** 発行された Cookie の値を書き換えて `role=host` で会場につなぐ
- **THEN** 接続は拒否され、会場には届かない

#### Scenario: パスワードを変えると古い Cookie は使えない
- **WHEN** あるパスワードで発行された Cookie を、別のパスワードを設定した Worker で使って `role=host` でつなぐ
- **THEN** 接続は拒否される

#### Scenario: 参加者の接続は Cookie なしで受け付ける
- **WHEN** Cookie を付けずに `role=guest` で会場につなぐ
- **THEN** 接続は受け付けられ、今の進行状態が届く
