import path from "node:path";
import { expect, test } from "@playwright/test";
import { loadQuestionSet } from "../../src/question-set/vite-plugin.ts";
import { freshVenue } from "./venue.ts";

test.beforeEach(freshVenue);

for (const [path, text] of [
  ["/", `aria-label="参加者画面"`],
  ["/host", `aria-label="司会画面"`],
]) {
  test(`GET ${path} returns 200 HTML without redirect`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(await res.text()).toContain(text);
  });
}

// 参加者画面の HTML はタイトル画面で写真を含まないので、写真の URL は問題データから取る
test("写真はハッシュ名の URL で配信される", async ({ request }) => {
  const set = loadQuestionSet(path.resolve(import.meta.dirname, "../.."));
  const sources = [...new Set(set.questions.flatMap((q) => q.options.map((o) => o.image)))];
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) {
    expect(src).toMatch(/^\/images\/[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/);
    const res = await request.get(src, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  }
});
