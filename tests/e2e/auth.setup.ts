import { expect, test as setup } from "@playwright/test";
import { HOST_SESSION_PATH } from "../../src/venue/protocol.ts";
import { HOST_STATE, hostPassword } from "./venue.ts";

setup("司会としてログインする", async ({ request }) => {
  const response = await request.post(HOST_SESSION_PATH, { data: { password: hostPassword() } });
  expect(response.status()).toBe(204);
  const state = await request.storageState({ path: HOST_STATE });
  expect(state.cookies.map((c) => c.name)).toContain("kakuzuke_host");
});
