import { defineConfig, devices } from "@playwright/test";
import { HOST_STATE } from "./tests/e2e/venue.ts";

const port = 4173;
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;
const remote = process.env.BASE_URL !== undefined;
// BASE_URL へ流すときはログインしない。それ以外は setup が本物のログインで得た Cookie をブラウザに持たせる
const browser = { ...devices["Desktop Chrome"], ...(remote ? {} : { storageState: HOST_STATE }) };
const login = remote ? {} : { dependencies: ["setup"] };

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL },
  // 会場は 1 つなので、会場を戻す beforeEach が他のテストの会場を動かさないよう直列に流す
  workers: 1,
  // scenario は tests/fixtures/content、content は content/ でビルドした dist に対して流す（package.json の e2e がビルドし分ける）
  projects: [
    ...(remote ? [] : [{ name: "setup", testMatch: "auth.setup.ts" }]),
    { name: "scenario", testMatch: ["host.spec.ts", "guest.spec.ts", "venue.spec.ts"], ...login, use: browser },
    { name: "content", testMatch: ["smoke.spec.ts", "content.spec.ts"], ...login, use: browser },
  ],
  webServer: remote
    ? undefined
    : {
        command: `pnpm exec vite preview --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
      },
});
