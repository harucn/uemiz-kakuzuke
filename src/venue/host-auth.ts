import { z } from "zod";

/** HMAC-SHA256(key = SHA-256(HOST_PASSWORD), message = "kakuzuke:host") の base64url（43 文字）。
 *  鍵を固定長の SHA-256 にするのは、HMAC が短い鍵の末尾を 0 で埋めるため（"pw" と "pw\0" が同じ鍵になる） */
type SessionToken = string;

const COOKIE = "kakuzuke_host";
const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Strict; Path=/";
const LoginSchema = z.strictObject({ password: z.string().min(1) });
const MESSAGE = new TextEncoder().encode("kakuzuke:host");
/** 32 バイトの base64url。最後の文字の下位 2 ビットは捨てられるので、0 のものだけを受け付けて同じ MAC の別表記を拒む */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** 漏洩検査が派生値を探すためにも使う */
export async function sessionToken(secret: string): Promise<SessionToken> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), MESSAGE));
  return btoa(String.fromCharCode(...mac)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** crypto.subtle.verify("HMAC") で比べる。長さの違う値や base64url として読めない値は false */
async function verifies(token: string, secret: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) return false;
  const mac = Uint8Array.from(atob(token.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), mac, MESSAGE);
}

/** 同じ名前の Cookie が複数あれば最初の値 */
function cookieOf(request: Request, name: string): string | null {
  for (const pair of (request.headers.get("Cookie") ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return null;
}

/** Cookie の値が secret の SessionToken と一致するか。secret が undefined か "" なら false */
export async function isHost(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const token = cookieOf(request, COOKIE);
  return token !== null && verifies(token, secret);
}

function respond(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * HOST_SESSION_PATH の応答。どの応答も Cache-Control: no-store。
 * - GET: isHost なら 204、それ以外は 401
 * - POST {"password": string}: 一致なら 204 と Set-Cookie。誤り・空・読めない本文は 401
 * - そのほかのメソッドは 405
 * secret が undefined か "" なら、WebCrypto を呼ぶ前に 401 を返す
 */
export async function hostSession(request: Request, secret: string | undefined): Promise<Response> {
  switch (request.method) {
    case "GET":
      return respond((await isHost(request, secret)) ? 204 : 401);
    case "POST": {
      if (!secret) return respond(401);
      const login = LoginSchema.safeParse(await request.json().catch(() => undefined));
      if (!login.success) return respond(401);
      // 比べるのは常に固定長の MAC なので、一致した文字数で時間は変わらない
      const token = await sessionToken(login.data.password);
      if (!(await verifies(token, secret))) return respond(401);
      return respond(204, { "Set-Cookie": `${COOKIE}=${token}; ${COOKIE_ATTRIBUTES}` });
    }
    default:
      return respond(405, { Allow: "GET, POST" });
  }
}
