import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { LEAK_CANARY } from "../../src/guest/leak-canary.ts";
import { VIEW_ONLY_NOTE } from "../../src/guest/view-only-note.ts";
import { secretFields, secretStrings } from "../../src/question-set/model.ts";
import { loadQuestionSet } from "../../src/question-set/vite-plugin.ts";
import { PONG } from "../../src/venue/protocol.ts";
import { revealView } from "../../src/venue/view.ts";
import { findSecrets } from "../leak.ts";
import { expectNoLabels, expectOptions, optionCard, optionNote, optionPhoto, photoBoxes } from "./options.ts";
import {
  connectHost,
  connectVenue,
  operate,
  recordTraffic,
  relayVenue,
  resetVenue,
  skipIfRemote,
  viewShapeProblems,
  type VenueClient,
} from "./venue.ts";

// package.json の e2e がこのフィクスチャでビルドした dist に対して流す
const set = loadQuestionSet(path.resolve(import.meta.dirname, "../.."), { contentDir: "tests/fixtures/content" });
const { questions } = set;
const secrets = secretStrings(set);
const last = questions.length - 1;
const TWO = 0;
const THREE = 1;
if (questions[TWO].options.length !== 2) throw new Error(`フィクスチャの第 ${TWO + 1} 問は 2 択の前提`);
if (questions[THREE].options.length !== 3) throw new Error(`フィクスチャの第 ${THREE + 1} 問は 3 択の前提`);

const clients: VenueClient[] = [];
const contexts: BrowserContext[] = [];

test.beforeEach(async ({ baseURL }) => {
  skipIfRemote();
  await resetVenue(baseURL!);
});
test.afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/** 司会としての接続。テストの終わりに閉じる */
async function host(baseURL: string | undefined) {
  const client = await connectHost(baseURL!);
  clients.push(client);
  return client;
}

/** 別のブラウザコンテキストのページ。テストの終わりに閉じる */
async function newPage(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, ...options });
  contexts.push(context);
  return context.newPage();
}

const status = (page: Page) => page.getByRole("status");
const celebration = (page: Page) => page.getByTestId("celebration");
const stage = (page: Page) => page.getByRole("heading", { level: 1 }).locator("small");

/** 参加者画面を開き、会場から最初のフレームが届くまで待つ（タイトル画面は届く前と見た目が同じなので、画面では待てない） */
async function openGuest(page: Page) {
  const joined = new Promise<void>((resolve) => page.on("websocket", (ws) => ws.once("framereceived", () => resolve())));
  await page.goto("/");
  await joined;
}

/** タイトル画面に閲覧専用の案内が表示され、問題とボタンは表示されていない */
async function expectTitle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(set.title);
  for (const line of VIEW_ONLY_NOTE) await expect(page.getByText(line)).toBeVisible();
  await expect(page.locator(".option-card")).toHaveCount(0);
  await expect(page.getByText(/^STAGE /)).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
}

/** 第 index + 1 問の問題名・説明・全選択肢（表示順の写真と選択肢の説明）・番号が表示されている */
async function expectQuestion(page: Page, index: number) {
  const q = questions[index];
  await expect(page.getByRole("heading", { level: 1 })).toContainText(q.title);
  await expect(stage(page)).toHaveText(`STAGE ${index + 1}`);
  await expect(page.getByText(q.description)).toBeVisible();
  await expectOptions(page, q.options);
}

/** 画面に見えている文字のうち正解情報にあたるもの */
function visibleAnswerInfo(page: Page) {
  return page.evaluate(
    ({ secrets }) => {
      const text = document.body.innerText;
      return [...secrets, "正解", "1位", "2位", "3位"].filter((s) => text.includes(s));
    },
    { secrets },
  );
}

/** 第 index + 1 問が正解発表前の状態（正解情報もラベルもない）で表示されている */
async function expectAsking(page: Page, index: number) {
  await expectQuestion(page, index);
  expect(await visibleAnswerInfo(page), "正解発表前に見えている正解情報").toEqual([]);
  await expectNoLabels(page);
}

/** 第 index + 1 問の正解発表（正解ラベル・解説・表示順の各選択肢のラベル・正解の選択肢）が表示されている */
async function expectRevealed(page: Page, index: number) {
  const view = revealView(questions[index]);
  await expect(page.getByText(`${view.headline}！`)).toBeVisible();
  await expect(page.getByText(view.explanation)).toBeVisible();
  await expect(page.locator(".guest-opts")).not.toContainText("正解");
  for (const [i, o] of view.options.entries()) {
    await expect(optionCard(page, i)).toHaveAttribute("data-label", o.label);
    await expect(optionCard(page, i).locator(".label-bar")).toHaveText(o.label);
    if (o.correct) await expect(optionCard(page, i)).toHaveClass(/option-card--correct/);
    else await expect(optionCard(page, i)).not.toHaveClass(/option-card--correct/);
  }
}

/** 紙吹雪の canvas に色の付いたドットがある */
function celebrationHasDots(page: Page) {
  return celebration(page).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    return data.some((v, i) => i % 4 === 3 && v > 0);
  });
}

/** 会場から届いたフレームの view の index を書き換える */
const withIndex = (index: number) => (frame: string) => frame.replace(/"index":\d+/, `"index":${index}`);

test.describe("司会画面への追従", () => {
  test("司会がタイトル画面から進むと第 1 問を表示する", async ({ page, browser }) => {
    const guests = [await newPage(browser), await newPage(browser)];
    for (const guest of guests) await openGuest(guest);
    await page.goto("/host");
    await page.getByRole("button", { name: "次へ" }).click();
    for (const guest of guests) await expectAsking(guest, 0);
  });

  test("司会が前の問題に戻ると参加者画面も戻る", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next", "next");
    await page.goto("/");
    await expectQuestion(page, 1);
    await operate(venue, "prev");
    await expectAsking(page, 0);
  });

  test("移動の操作がない", async ({ page, baseURL }) => {
    await openGuest(page);
    await expectTitle(page);
    await operate(await host(baseURL), "next");
    await expectQuestion(page, 0);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test.describe(() => {
    // 第 1 問がスクロールでき、次の第 2 問はそれより長い高さ
    test.use({ viewport: { width: 360, height: 480 } });

    test("問題が切り替わると先頭までスクロールする", async ({ page, baseURL }) => {
      const venue = await host(baseURL);
      await operate(venue, "next");
      await page.goto("/");
      await expectQuestion(page, 0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => window.scrollY), "下までスクロールした").toBeGreaterThan(100);
      await operate(venue, "next");
      await expectQuestion(page, 1);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });
});

test.describe("問題画面の表示", () => {
  test("第 1 問を問題番号つきで表示する", async ({ page, baseURL }) => {
    await openGuest(page);
    await operate(await host(baseURL), "next");
    await expectQuestion(page, 0);
  });

  test("3 択の問題で 3 つの選択肢を表示する", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next");
    await page.goto("/");
    await expectQuestion(page, THREE);
    for (const [i, o] of questions[THREE].options.entries()) {
      await expect(optionPhoto(page, i)).toBeVisible();
      await expect(optionPhoto(page, i)).toHaveAttribute("src", o.image);
      await expect(optionNote(page, i)).toHaveText(o.note);
    }
  });
});

test.describe("正解発表の表示", () => {
  test("正解発表で正解情報を表示する", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await expectAsking(page, TWO);
    await operate(venue, "reveal");
    await expectRevealed(page, TWO);
  });

  test("正解発表で選択肢の位置は変わらない", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next", "next");
    await page.goto("/");
    await expectAsking(page, THREE);
    const before = await photoBoxes(page);
    expect(before.map((p) => p.src)).toEqual(questions[THREE].options.map((o) => o.image));
    await operate(venue, "reveal");
    await expectRevealed(page, THREE);
    expect(await photoBoxes(page)).toEqual(before);
  });

  test("正解発表後に次の問題へ進むと正解情報を消す", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await operate(venue, "reveal");
    await expectRevealed(page, TWO);
    await operate(venue, "next");
    await expectAsking(page, 1);
  });
});

test.describe("正解発表の演出", () => {
  test("正解発表で紙吹雪を再生する", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await expectAsking(page, TWO);
    await operate(venue, "reveal");
    await expect(celebration(page)).toHaveCount(1);
    await expect.poll(() => celebrationHasDots(page)).toBe(true);
  });

  test("正解発表をもう一度押すと紙吹雪を再生し直す", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await expectAsking(page, TWO);
    await operate(venue, "reveal");
    await expect.poll(() => celebrationHasDots(page)).toBe(true);
    const first = await celebration(page).elementHandle();
    await operate(venue, "reveal");
    await expect.poll(() => first!.evaluate((el) => el.isConnected)).toBe(false);
    await expect(celebration(page)).toHaveCount(1);
    await expect.poll(() => celebrationHasDots(page)).toBe(true);
    await expectRevealed(page, TWO);
  });

  test("正解発表中に開いたときは紙吹雪を再生しない", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "reveal");
    await page.goto("/");
    await expectRevealed(page, TWO);
    await expect(celebration(page)).toHaveCount(0);
  });

  test("reduced motion が有効なときは紙吹雪を再生しない", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await expectAsking(page, TWO);
    await operate(venue, "reveal");
    await expectRevealed(page, TWO);
    await expect(celebration(page)).toHaveCount(0);
  });
});

test.describe("接続が切れている間の表示", () => {
  test("接続が切れると再接続中と表示する", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next");
    const relay = await relayVenue(page);
    await page.goto("/");
    await expectQuestion(page, 1);
    await expect(status(page)).toBeEmpty();
    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    await expectQuestion(page, 1);
  });

  test("最初につながらないときは再接続中と表示する", async ({ page }) => {
    await page.routeWebSocket(/\/api\/venue/, () => {});
    await page.goto("/");
    await expectTitle(page);
    await expect(status(page), "最初の 5 秒は再接続中と出さない").toBeEmpty();
    await expect(status(page)).toHaveText("再接続中", { timeout: 10_000 });
    await expectTitle(page);
  });

  test("再接続すると再接続中の表示を消す", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next");
    const relay = await relayVenue(page);
    await page.goto("/");
    await expectQuestion(page, 0);
    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    relay.resume();
    await expect(status(page)).toBeEmpty({ timeout: 15_000 });
    await expectQuestion(page, 0);
  });
});

test.describe("タイトル画面で司会を待つ", () => {
  test("会場がタイトル画面のときに開くとタイトル画面を表示する", async ({ page }) => {
    await openGuest(page);
    await expectTitle(page);
  });

  test("司会が始めるまでタイトル画面のまま", async ({ page }) => {
    await openGuest(page);
    await page.waitForTimeout(2000);
    await expectTitle(page);
  });

  test("タイトル画面に正解情報を表示しない", async ({ page }) => {
    await openGuest(page);
    await expectTitle(page);
    expect(await visibleAnswerInfo(page)).toEqual([]);
  });
});

test.describe("正解情報を表示しない", () => {
  test("どの問題でも正解情報が表示されない", async ({ page, baseURL }) => {
    expect(secrets.length).toBeGreaterThan(0);
    await openGuest(page);
    const venue = await host(baseURL);
    for (let i = 0; i <= last; i++) {
      await operate(venue, "next");
      await expectQuestion(page, i);
      expect(await visibleAnswerInfo(page), `第 ${i + 1} 問で見えている正解情報`).toEqual([]);
    }
  });

  test("どの問題でもラベルが表示されない", async ({ page, baseURL }) => {
    await openGuest(page);
    const venue = await host(baseURL);
    for (let i = 0; i <= last; i++) {
      await operate(venue, "next");
      await expectQuestion(page, i);
      await expectNoLabels(page);
    }
  });

  test("正解発表の操作がない", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next");
    await page.goto("/");
    await expectAsking(page, 0);
    await expect(page.getByRole("button", { name: "正解発表" })).toHaveCount(0);
    await expect(page.locator(":focus")).toHaveCount(0);
    for (const key of ["Space", "Enter"]) {
      await page.keyboard.press(key);
      await expectAsking(page, 0);
    }
  });
});

test.describe("スマホでの表示", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  async function expectNoHorizontalScroll(page: Page) {
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(360);
    expect(width.scroll).toBeLessThanOrEqual(width.client);
  }

  test("幅 360px で横スクロールが発生しない", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next");
    await page.goto("/");
    await expectQuestion(page, THREE);
    await expectNoHorizontalScroll(page);
    for (const i of questions[THREE].options.keys()) {
      for (const target of [optionPhoto(page, i), optionNote(page, i)]) {
        await target.scrollIntoViewIfNeeded();
        await expect(target).toBeInViewport({ ratio: 1 });
      }
    }
  });

  test("幅 360px で正解発表が横スクロールなしに見られる", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next", "next");
    await page.goto("/");
    await expectQuestion(page, THREE);
    await operate(venue, "reveal");
    await expectRevealed(page, THREE);
    await expect(celebration(page), "紙吹雪を重ねた状態で測る").toHaveCount(1);
    await expectNoHorizontalScroll(page);
    const view = revealView(questions[THREE]);
    for (const i of view.options.keys()) {
      const target = optionCard(page, i).locator(".label-bar");
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport({ ratio: 1 });
      expect(await target.evaluate((el) => el.scrollWidth <= el.clientWidth), "中身が横にはみ出さない").toBe(true);
    }
    for (const text of [`${view.headline}！`, view.explanation]) {
      const target = page.getByText(text);
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport({ ratio: 1 });
    }
  });
});

test.describe("状態の変化を全画面へ届ける", () => {
  test("正解発表が参加者画面に届く", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    await page.goto("/");
    await expectAsking(page, TWO);
    venue.send({ type: "reveal" });
    // 届いたことは正解の選択肢のカード（めくり始めた裏の面）で測る。正解の見出しはカードをめくり終えてから出る
    await expect(page.locator(".option-card--correct")).toBeAttached({ timeout: 1000 });
    await expectRevealed(page, TWO);
  });

  test("前へが参加者画面に届く", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next", "next");
    await page.goto("/");
    await expectQuestion(page, 1);
    venue.send({ type: "prev" });
    await expect(stage(page)).toHaveText("STAGE 1", { timeout: 1000 });
    await expectAsking(page, 0);
  });
});

test.describe("つながった画面に今の状態を届ける", () => {
  test("途中から開いた参加者画面は今の問題から始まる", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next", "next");
    await page.goto("/");
    await expectAsking(page, 2);
  });

  test("正解発表中に開いた参加者画面は正解発表を表示する", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next", "reveal");
    await page.goto("/");
    await expectRevealed(page, 1);
  });

  test("切断中に進んだ状態に再接続で追いつく", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    const relay = await relayVenue(page);
    await page.goto("/");
    await expectQuestion(page, 0);
    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    await operate(venue, "next", "next");
    await expectQuestion(page, 0);
    relay.resume();
    await expect(status(page)).toBeEmpty({ timeout: 15_000 });
    await expectAsking(page, 2);
  });
});

test.describe("接続が切れたら自動で再接続する", () => {
  test("接続が切れても自動で再接続する", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    const relay = await relayVenue(page);
    await page.goto("/");
    await expectQuestion(page, 0);
    await relay.drop();
    await operate(venue, "next");
    await expect.poll(() => relay.attempts, "つなぎ直した").toBe(2);
    await expectAsking(page, 1);
    await expect(status(page)).toBeEmpty();
  });

  test("画面が表示に戻るとすぐ再接続する", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    const relay = await relayVenue(page);
    await page.goto("/");
    await expectQuestion(page, 0);
    await relay.reject();
    await expect(status(page)).toHaveText("再接続中");
    // 最初の接続と、すぐ閉じられた 3 回のつなぎ直し。次のつなぎ直しはバックオフで 4 秒以上先になる
    await expect.poll(() => relay.attempts, { timeout: 20_000, intervals: [50] }).toBe(4);
    await operate(venue, "next");
    relay.resume();
    await page.evaluate(() => {
      for (const state of ["hidden", "visible"] as const) {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });
    await expect(status(page)).toBeEmpty({ timeout: 1500 });
    expect(relay.attempts, "表示に戻ったときの 1 回でつながった").toBe(5);
    await expectAsking(page, 1);
  });

  test("応答しなくなった接続を切れたものとして扱う", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next");
    const relay = await relayVenue(page);
    await page.clock.install();
    await page.goto("/");
    await expectQuestion(page, 0);
    relay.mute();
    await page.clock.runFor(20_000);
    await expect(status(page)).toHaveText("再接続中", { timeout: 1000 });
    await expect.poll(() => relay.attempts, "再接続を試みた").toBeGreaterThan(1);
    await expectQuestion(page, 0);
  });
});

test.describe("進行状態を 1 か所で持つ", () => {
  test("参加者画面でキーを押しても進行状態は変わらない", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    // タイトル画面は Space・Enter を無視するので、どのキーも効く第 1 問で確かめる
    await operate(venue, "next");
    venue.close();
    await page.goto("/");
    await expectAsking(page, 0);
    const observer = connectVenue(baseURL!, "guest");
    clients.push(observer);
    expect((await observer.next()).view).toEqual({ phase: "asking", index: 0 });
    for (const key of ["ArrowRight", "Space", "Enter"]) await page.keyboard.press(key);
    await expect(observer.next(1000), "会場の状態が変わったフレーム").rejects.toThrow(/届かない/);
    await expectAsking(page, 0);
  });
});

test.describe("古い版の画面は読み込み直す", () => {
  test("問題セットが変わった後に古い参加者画面は読み込み直す", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next", "next");
    const relay = await relayVenue(page);
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto("/");
    await expectQuestion(page, 1);
    expect(loads).toBe(1);

    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    relay.rewrite((frame) => frame.replace(/"publicVersion":"[^"]*"/, '"publicVersion":"新しい問題セット"'));
    relay.resume();
    await expect.poll(() => loads, { timeout: 15_000 }).toBe(2);
    await expectTitle(page);

    // 読み込み直しても版が違うままなら、届いた問題番号を表示せず、もう読み込み直さない
    await operate(venue, "next");
    await expect.poll(() => relay.lastFrame, "第 3 問のフレームが届いた").toContain('"index":2');
    await page.waitForTimeout(1000);
    expect(loads).toBe(2);
    await expectTitle(page);
  });

  test("届いた問題番号が手元の問題セットにないときはタイトル画面を表示する", async ({ page, baseURL }) => {
    const venue = await host(baseURL);
    await operate(venue, "next");
    const relay = await relayVenue(page);
    relay.rewrite(withIndex(questions.length));
    await page.goto("/");
    await expectTitle(page);
    // 陽性対照: 書き換えをやめれば同じ中継で問題を表示する
    relay.rewrite((frame) => frame);
    await operate(venue, "next");
    await expectQuestion(page, 1);
  });
});

/** 問題ごとの秘密文字列。問題をまたいで部分文字列になっているものがあると、陽性と陰性を見分けられない */
function secretsOf(indexes: readonly number[]) {
  return [...new Set(indexes.flatMap((i) => secretFields(questions[i]).map((f) => f.value)))];
}

async function leaksIn(traffic: ReturnType<typeof recordTraffic>, secrets: readonly string[]) {
  return (await traffic.texts()).flatMap(({ url, text }) => findSecrets(text, secrets).map((hit) => `${url}: 「${hit.secret}」 …${hit.context}…`));
}

const venueFrames = (traffic: ReturnType<typeof recordTraffic>) => traffic.frames.filter((f) => f !== PONG);

test.describe("参加者に届くデータに正解情報を含めない", () => {
  test("参加者画面を進める間に受け取る応答に正解情報を含まない", async ({ page, baseURL }) => {
    const traffic = recordTraffic(page);
    await openGuest(page);
    await expectTitle(page);
    const venue = await host(baseURL);
    for (let i = 0; i <= last; i++) {
      await operate(venue, "next");
      await expectQuestion(page, i);
    }

    expect(venueFrames(traffic), "つないだ直後と各問題のフレームを受け取っている").toHaveLength(questions.length + 1);
    expect((await traffic.texts()).some(({ text }) => findSecrets(text, [LEAK_CANARY]).length > 0), "陽性対照: 応答の中身からカナリアを読める").toBe(true);
    expect(await leaksIn(traffic, secrets)).toEqual([]);
    expect(viewShapeProblems(traffic.frames)).toEqual([]);
  });
});

test.describe("参加者へ届ける正解の範囲", () => {
  test("正解発表した問題の正解情報だけを含む", async ({ page, baseURL }) => {
    const revealed = secretsOf([1]);
    const others = secretsOf(questions.map((_, i) => i).filter((i) => i !== 1));
    expect(others.filter((o) => revealed.some((r) => r.includes(o) || o.includes(r))), "フィクスチャの前提").toEqual([]);

    const traffic = recordTraffic(page);
    await openGuest(page);
    const venue = await host(baseURL);
    await operate(venue, "next", "next", "reveal");
    await expectRevealed(page, 1);
    for (let i = 2; i <= last; i++) {
      await operate(venue, "next");
      await expectAsking(page, i);
    }

    const texts = await traffic.texts();
    expect(revealed.filter((s) => !texts.some(({ text }) => findSecrets(text, [s]).length > 0)), "陽性対照: 受け取っていない第 2 問の正解情報").toEqual([]);
    expect(await leaksIn(traffic, others)).toEqual([]);
    expect(viewShapeProblems(traffic.frames)).toEqual([]);
  });

  test("発表後に戻した問題へ途中参加しても正解情報は届かない", async ({ page, baseURL }) => {
    await operate(await host(baseURL), "next", "next", "reveal", "next", "prev");
    const traffic = recordTraffic(page);
    await page.goto("/");
    await expectAsking(page, 1);

    expect(venueFrames(traffic), "つないだ直後のフレームを受け取っている").toHaveLength(1);
    expect(await leaksIn(traffic, secrets)).toEqual([]);
    expect(viewShapeProblems(traffic.frames)).toEqual([]);
  });
});
