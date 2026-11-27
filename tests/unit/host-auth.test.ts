import { describe, expect, it } from "vitest";
import { hostSession, isHost, sessionToken } from "../../src/venue/host-auth.ts";
import { HOST_SESSION_PATH } from "../../src/venue/protocol.ts";

const PASSWORD = "シャンパンタワー 2026";
const url = `https://kakuzuke.test${HOST_SESSION_PATH}`;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function login(body: string, secret: string | undefined) {
  return hostSession(new Request(url, { method: "POST", body, headers: { "Content-Type": "application/json" } }), secret);
}
const loginWith = (password: unknown, secret: string | undefined) => login(JSON.stringify({ password }), secret);

/** ログインの応答から、ブラウザが次の要求に付ける Cookie の形を作る */
async function cookieFromLogin(password = PASSWORD): Promise<string> {
  const setCookie = (await loginWith(password, password)).headers.get("Set-Cookie");
  expect(setCookie).not.toBeNull();
  return setCookie!.split(";")[0];
}

const withCookie = (cookie: string | null, method = "GET") =>
  new Request(url, { method, headers: cookie === null ? {} : { Cookie: cookie } });

describe("ログイン", () => {
  it("正しいパスワードで 204 と、HttpOnly・Secure・SameSite=Strict・Path=/ で有効期限のない Cookie を返す", async () => {
    const response = await loginWith(PASSWORD, PASSWORD);

    expect(response.status).toBe(204);
    const attributes = response.headers.get("Set-Cookie")!.split(";").map((part) => part.trim());
    expect(attributes[0]).toMatch(/^kakuzuke_host=[A-Za-z0-9_-]{43}$/);
    expect(attributes.slice(1).sort()).toEqual(["HttpOnly", "Path=/", "SameSite=Strict", "Secure"]);
  });

  it("発行する Cookie の値はパスワードの派生値で、パスワードそのものではない", async () => {
    const cookie = await cookieFromLogin();

    expect(cookie).toBe(`kakuzuke_host=${await sessionToken(PASSWORD)}`);
    expect(cookie).not.toContain(PASSWORD);
  });

  it.each([
    ["誤ったパスワード", JSON.stringify({ password: "シャンパンタワー 2025" })],
    ["正しいパスワードの末尾に NUL 文字を足したもの", JSON.stringify({ password: `${PASSWORD}\0` })],
    ["正しいパスワードの前方だけ", JSON.stringify({ password: PASSWORD.slice(0, -1) })],
    ["空のパスワード", JSON.stringify({ password: "" })],
    ["パスワードのない本文", JSON.stringify({})],
    ["余計な項目", JSON.stringify({ password: PASSWORD, extra: 1 })],
    ["文字列でないパスワード", JSON.stringify({ password: 123 })],
    ["JSON でない本文", PASSWORD],
    ["空の本文", ""],
  ])("%s では 401 を返し、Cookie を発行しない", async (_, body) => {
    const response = await login(body, PASSWORD);

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it.each([
    ["未設定", undefined],
    ["空", ""],
  ])("パスワードが%sなら、どのパスワードでも 401 を返し、Cookie を発行しない", async (_, secret) => {
    for (const password of ["", "undefined", PASSWORD]) {
      const response = await loginWith(password, secret);

      expect(response.status).toBe(401);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
  });
});

describe("Cookie の検証", () => {
  it("ログインで発行された Cookie を正しいとみなす", async () => {
    expect(await isHost(withCookie(await cookieFromLogin()), PASSWORD)).toBe(true);
  });

  it("ほかの Cookie と並んでいても見つける", async () => {
    expect(await isHost(withCookie(`theme=dark; ${await cookieFromLogin()}; lang=ja`), PASSWORD)).toBe(true);
  });

  it("Cookie がなければ拒否する", async () => {
    expect(await isHost(withCookie(null), PASSWORD)).toBe(false);
    expect(await isHost(withCookie("theme=dark"), PASSWORD)).toBe(false);
  });

  it("値を書き換えた Cookie を拒否する", async () => {
    const cookie = await cookieFromLogin();
    const token = cookie.slice("kakuzuke_host=".length);
    const flip = (c: string) => (c === "A" ? "Q" : "A");
    const tampered = [
      `${flip(token[0])}${token.slice(1)}`,
      `${token.slice(0, -1)}${flip(token.at(-1)!)}`,
      // 最後の文字の捨てられる下位ビットだけを変えた別表記
      `${token.slice(0, -1)}${BASE64URL[BASE64URL.indexOf(token.at(-1)!) + 1]}`,
      token.slice(0, -1),
      `${token}A`,
      `${token}=`,
      "",
      encodeURIComponent(PASSWORD),
    ];

    for (const value of tampered) {
      expect(await isHost(withCookie(`kakuzuke_host=${value}`), PASSWORD), value).toBe(false);
    }
  });

  it("別のパスワードで発行された Cookie を拒否する", async () => {
    const old = await cookieFromLogin("前のパスワード");

    expect(await isHost(withCookie(old), PASSWORD)).toBe(false);
  });

  it("同じ名前の Cookie が 2 つあれば最初の値で確かめる", async () => {
    const valid = await cookieFromLogin();
    const invalid = await cookieFromLogin("前のパスワード");

    expect(await isHost(withCookie(`${valid}; ${invalid}`), PASSWORD)).toBe(true);
    expect(await isHost(withCookie(`${invalid}; ${valid}`), PASSWORD)).toBe(false);
  });

  it.each([
    ["未設定", undefined],
    ["空", ""],
  ])("パスワードが%sなら、どの Cookie も拒否する", async (_, secret) => {
    const empty = `kakuzuke_host=${await sessionToken("")}`;

    for (const cookie of [null, empty, await cookieFromLogin()]) {
      expect(await isHost(withCookie(cookie), secret)).toBe(false);
    }
  });
});

describe("ログインの確認と応答", () => {
  it("GET は正しい Cookie なら 204、それ以外は 401 を返す", async () => {
    const cookie = await cookieFromLogin();

    expect((await hostSession(withCookie(cookie), PASSWORD)).status).toBe(204);
    expect((await hostSession(withCookie(null), PASSWORD)).status).toBe(401);
    expect((await hostSession(withCookie(cookie), undefined)).status).toBe(401);
  });

  it.each(["PUT", "DELETE", "PATCH"])("%s には 405 を返す", async (method) => {
    const response = await hostSession(withCookie(await cookieFromLogin(), method), PASSWORD);

    expect(response.status).toBe(405);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("どの応答も Cache-Control: no-store を持つ", async () => {
    const cookie = await cookieFromLogin();
    const responses = await Promise.all([
      loginWith(PASSWORD, PASSWORD),
      loginWith("誤り", PASSWORD),
      loginWith(PASSWORD, undefined),
      hostSession(withCookie(cookie), PASSWORD),
      hostSession(withCookie(null), PASSWORD),
      hostSession(withCookie(cookie, "DELETE"), PASSWORD),
    ]);

    expect(responses.map((r) => r.headers.get("Cache-Control"))).toEqual(Array(responses.length).fill("no-store"));
  });
});
