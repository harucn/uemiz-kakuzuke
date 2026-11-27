import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, test as setup } from "@playwright/test";
import { HOST_SESSION_PATH } from "../../src/venue/protocol.ts";
import { HOST_STATE } from "./venue.ts";

setup("司会としてログインする", async ({ request }) => {
  // vite preview が読むのはビルドが書き出したこのファイルなので、ルートの .dev.vars や .env と食い違わない
  const password = parseEnv(readFileSync("dist/server/.dev.vars", "utf8")).HOST_PASSWORD;
  if (!password) throw new Error("dist/server/.dev.vars に HOST_PASSWORD がない。HOST_PASSWORD を設定してビルドする");

  const response = await request.post(HOST_SESSION_PATH, { data: { password } });
  expect(response.status()).toBe(204);
  const state = await request.storageState({ path: HOST_STATE });
  expect(state.cookies.map((c) => c.name)).toContain("kakuzuke_host");
});
