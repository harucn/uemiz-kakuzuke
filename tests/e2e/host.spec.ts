import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { answerOf, secretStrings, type Label } from "../../src/question-set/model.ts";
import { loadQuestionSet } from "../../src/question-set/vite-plugin.ts";
import { revealView } from "../../src/venue/view.ts";
import { expectLabelsBeforeReveal, expectOptions, labelTraces, optionCard, photoBoxes, settleCards } from "./options.ts";
import { connectVenue, relayVenue, resetVenue, skipIfRemote } from "./venue.ts";

test.beforeEach(async ({ baseURL }) => {
  skipIfRemote();
  await resetVenue(baseURL!);
});

// package.json の e2e がこのフィクスチャでビルドした dist に対して流す
const set = loadQuestionSet(path.resolve(import.meta.dirname, "../.."), { contentDir: "tests/fixtures/content" });
const { questions } = set;
const secrets = secretStrings(set);
const last = questions.length - 1;

const prevButton = (page: Page) => page.getByRole("button", { name: "前へ" });
const nextButton = (page: Page) => page.getByRole("button", { name: "次へ" });
const revealButton = (page: Page) => page.getByRole("button", { name: "正解発表" });
const fullscreenButton = (page: Page) => page.getByRole("button", { name: "全画面" });
const card = (page: Page, label: Label) => page.locator(`.option-card[data-label="${label}"]`);
const correctCard = (page: Page) => page.locator(".option-card--correct");
const qrCode = (page: Page) => page.getByRole("img", { name: "参加者画面の QR コード" });
/** テストが開いているサーバーの参加者画面 */
const guestUrl = (page: Page) => new URL("/", page.url()).href;
const celebration = (page: Page) => page.getByTestId("celebration");
const status = (page: Page) => page.getByRole("status");
const TWO = 0;
const THREE = 1;
if (questions[TWO].options.length !== 2) throw new Error(`フィクスチャの第 ${TWO + 1} 問は 2 択の前提`);
if (questions[THREE].options.length !== 3) throw new Error(`フィクスチャの第 ${THREE + 1} 問は 3 択の前提`);

/** 第 index + 1 問の問題名・説明・全選択肢（表示順の写真と選択肢の説明）・番号が表示されている */
async function expectQuestion(page: Page, index: number) {
  const q = questions[index];
  await expect(page.getByRole("heading", { level: 1 })).toContainText(q.title);
  await expect(page.getByRole("heading", { level: 1 }).locator("small")).toHaveText(`STAGE ${index + 1}`);
  await expect(page.getByText(q.description)).toBeVisible();
  await expectOptions(page, q.options);
}

/** 画面に見えている文字（埋め込みデータの <script> は innerText に入らない） */
function visibleAnswerInfo(page: Page) {
  return page.evaluate(
    ({ secrets }) => {
      const text = document.body.innerText;
      return [...secrets, "正解は", "正解！", "1位", "2位", "3位"].filter((s) => text.includes(s));
    },
    { secrets },
  );
}

/** 第 index + 1 問が正解発表前の状態（正解情報がなく、ラベルは写真当ての問題だけ）で表示されている */
async function expectAsking(page: Page, index: number) {
  await expectQuestion(page, index);
  expect(await visibleAnswerInfo(page), "正解発表前に見えている正解情報").toEqual([]);
  await expectLabelsBeforeReveal(page, questions[index]);
}

/** タイトル画面が表示され、問題は表示されていない */
async function expectTitle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(set.title);
  await expect(qrCode(page)).toBeVisible();
  await expect(page.locator(".option-card")).toHaveCount(0);
  await expect(page.getByText(/^STAGE /)).toHaveCount(0);
  await expect(revealButton(page)).toHaveCount(0);
}

async function openTitle(page: Page) {
  await page.goto("/host");
  await expectTitle(page);
}

/** タイトル画面から第 1 問へ進んだところ */
async function openHost(page: Page) {
  await openTitle(page);
  await nextButton(page).click();
  await expectAsking(page, 0);
}

async function goTo(page: Page, index: number) {
  for (let i = 1; i <= index; i++) {
    await nextButton(page).click();
    await expectQuestion(page, i);
  }
}

test.describe("タイトル画面と QR コード", () => {
  test("会場がタイトル画面のときに開くとタイトル画面を表示する", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await openTitle(page);
    await context.close();
  });

  test("QR コードを読み取ると参加者画面の URL になる", async ({ page }) => {
    await openTitle(page);
    const png = PNG.sync.read(await qrCode(page).screenshot());
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(guestUrl(page));
    expect(guestUrl(page)).toBe(new URL("/", test.info().project.use.baseURL).href);
  });
});

test.describe("問題画面の表示", () => {
  test("第 1 問を問題番号つきで表示する", async ({ page }) => {
    await openTitle(page);
    await nextButton(page).click();
    await expectQuestion(page, 0);
  });

  test("正解発表前は正解情報を表示しない", async ({ page }) => {
    await openHost(page);
    for (let i = 1; i <= last; i++) {
      await nextButton(page).click();
      await expectAsking(page, i);
    }
    // 陽性対照: 正解発表すれば同じ検査が正解情報を見つける
    await page.keyboard.press("Enter");
    await expect.poll(() => visibleAnswerInfo(page)).toEqual(expect.arrayContaining(["正解は", questions[last].explanation]));
  });

  test("写真当ての問題は正解発表前から各選択肢にラベルを表示する", async ({ page }) => {
    const index = questions.findIndex((q) => q.mode === "photo");
    expect(index, "フィクスチャに写真当ての問題がある").toBeGreaterThan(0);
    await openHost(page);
    await goTo(page, index);
    await expectLabelsBeforeReveal(page, questions[index]);
    await expect(page.locator(".option-note")).toHaveCount(0);
  });

  test("正解発表前はラベルを表示しない", async ({ page }) => {
    await openHost(page);
    for (let i = 1; i <= last; i++) {
      await nextButton(page).click();
      await expectAsking(page, i);
    }
    // 陽性対照: 正解発表すれば同じ検査がラベルを見つける
    await page.keyboard.press("Enter");
    await expect.poll(() => labelTraces(page)).toEqual(
      expect.arrayContaining(questions[last].options.flatMap((o) => [`.label-bar「${o.label}」`, `data-label="${o.label}"`])),
    );
  });

  test("正解発表後に移動して戻るとラベルを表示しない", async ({ page }) => {
    await openHost(page);
    await page.keyboard.press("Space");
    await expect(card(page, questions[0].options[0].label)).toBeVisible();
    await nextButton(page).click();
    await expectAsking(page, 1);
    await prevButton(page).click();
    await expectAsking(page, 0);
  });
});

test.describe("前後の画面への移動", () => {
  test("タイトル画面で次へを押すと第 1 問を表示する", async ({ page }) => {
    await openTitle(page);
    await nextButton(page).click();
    await expectAsking(page, 0);
  });

  test("第 1 問で前へを押すとタイトル画面に戻る", async ({ page }) => {
    await openHost(page);
    await prevButton(page).click();
    await expectTitle(page);
  });

  test("タイトル画面では前へを操作できない", async ({ page }) => {
    await openTitle(page);
    await expect(prevButton(page)).toBeDisabled();
    await prevButton(page).click({ force: true });
    await expectTitle(page);
  });

  test("次へで次の問題を表示する", async ({ page }) => {
    await openHost(page);
    await nextButton(page).click();
    await expectAsking(page, 1);
  });

  test("前へで前の問題を表示する", async ({ page }) => {
    await openHost(page);
    await goTo(page, 1);
    await prevButton(page).click();
    await expectAsking(page, 0);
  });

  test("最終問では次へを操作できない", async ({ page }) => {
    await openHost(page);
    await goTo(page, last);
    await expect(nextButton(page)).toBeDisabled();
    await nextButton(page).click({ force: true });
    await expectAsking(page, last);
  });

  test("正解発表後に移動して戻ると発表前に戻る", async ({ page }) => {
    await openHost(page);
    await page.keyboard.press("Space");
    await expect(page.getByText(questions[0].explanation)).toBeVisible();
    await nextButton(page).click();
    await expectAsking(page, 1);
    await prevButton(page).click();
    await expectAsking(page, 0);
  });
});

test.describe("会場の進行状態を表示する", () => {
  test("タイトル画面で再読み込みするとタイトル画面のまま", async ({ page }) => {
    await openHost(page);
    await prevButton(page).click();
    await expectTitle(page);
    await page.reload();
    await expectTitle(page);
  });

  test("第 3 問で再読み込みすると第 3 問に戻る", async ({ page }) => {
    await openHost(page);
    await goTo(page, 2);
    await page.reload();
    await expectAsking(page, 2);
  });

  test("正解発表後に再読み込みすると正解発表を表示する", async ({ page }) => {
    await revealAt(page, THREE);
    await page.reload();
    await expectRevealed(page, THREE);
  });

  test("新しいタブで開くと会場の今の状態を表示する", async ({ page, context }) => {
    await openHost(page);
    await goTo(page, 1);
    const tab = await context.newPage();
    await tab.goto("/host");
    await expectAsking(tab, 1);
  });

  test("2 つの司会画面は同じ状態を表示する", async ({ page, context }) => {
    const other = await context.newPage();
    await openTitle(page);
    await openTitle(other);
    await nextButton(page).click();
    await expectAsking(page, 0);
    await expectAsking(other, 0);
  });
});

test.describe("つないだ直後は演出を再生しない", () => {
  test("正解発表中に再読み込みしても演出を再生しない", async ({ page }) => {
    await revealAt(page, THREE);
    // 陽性対照: 操作した直後は同じ検査が演出を見つける
    await expect(celebration(page)).toHaveCount(1);
    await page.reload();
    await expectRevealed(page, THREE);
    await expect(celebration(page)).toHaveCount(0);
  });
});

test.describe("接続が切れている間の表示と操作", () => {
  test("接続が切れると再接続中と表示する", async ({ page }) => {
    const relay = await relayVenue(page);
    await openHost(page);
    await expect(status(page)).toBeEmpty();
    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    for (const button of [prevButton, revealButton, nextButton]) await expect(button(page)).toBeDisabled();
    await expectQuestion(page, 0);
  });

  test("最初につながらないときは再接続中と表示する", async ({ page }) => {
    await page.routeWebSocket(/\/api\/venue/, () => {});
    await page.goto("/host");
    await expect(page.getByRole("main", { name: "司会画面" })).toBeVisible();
    await expect(status(page), "最初の 5 秒は再接続中と出さない").toBeEmpty();
    await expect(status(page)).toHaveText("再接続中", { timeout: 10_000 });
    await expect(page.getByRole("heading")).toHaveCount(0);
  });

  test("接続が切れている間のキー操作は捨てる", async ({ page, baseURL }) => {
    const relay = await relayVenue(page);
    await openHost(page);
    await relay.cut();
    await expect(status(page)).toHaveText("再接続中");
    await page.keyboard.press("ArrowRight");
    relay.resume();
    await expect(status(page)).toBeEmpty({ timeout: 15_000 });
    await expect(nextButton(page)).toBeEnabled();
    await expectAsking(page, 0);
    const observer = connectVenue(baseURL!, "guest");
    try {
      expect((await observer.next()).view, "会場の進行状態").toEqual({ phase: "asking", index: 0 });
    } finally {
      observer.close();
    }
    // 陽性対照: つながっていれば同じキーで進む
    await page.keyboard.press("ArrowRight");
    await expectAsking(page, 1);
  });
});

const isFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

test.describe("全画面表示", () => {
  test("全画面ボタンで全画面表示になる", async ({ page }) => {
    await openHost(page);
    await fullscreenButton(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await expect(fullscreenButton(page)).toHaveAttribute("aria-pressed", "true");
    await expectAsking(page, 0);
  });

  test("全画面表示中に全画面ボタンで元に戻る", async ({ page }) => {
    await openHost(page);
    await fullscreenButton(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await fullscreenButton(page).click();
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await expect(fullscreenButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("全画面表示が拒否されても操作を続けられる", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (e) => errors.push(e));
    await page.addInitScript(() => {
      const w = window as typeof window & { fullscreenRequests: number };
      w.fullscreenRequests = 0;
      Element.prototype.requestFullscreen = () => {
        w.fullscreenRequests++;
        return Promise.reject(new Error("denied"));
      };
    });
    await openHost(page);
    await fullscreenButton(page).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { fullscreenRequests: number }).fullscreenRequests)).toBe(1);
    expect(await isFullscreen(page)).toBe(false);
    await nextButton(page).click();
    await expectAsking(page, 1);
    await prevButton(page).click();
    await expectAsking(page, 0);
    await revealButton(page).click();
    await expect(page.getByText(questions[0].explanation)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("キーボード操作", () => {
  for (const key of ["ArrowRight", "PageDown"]) {
    const name = key === "ArrowRight" ? "→" : key;
    test(`${name} キーでタイトル画面から第 1 問へ進む`, async ({ page }) => {
      await openTitle(page);
      await page.keyboard.press(key);
      await expectAsking(page, 0);
    });
  }

  for (const key of ["ArrowLeft", "PageUp"]) {
    const name = key === "ArrowLeft" ? "←" : key;
    test(`${name} キーで第 1 問からタイトル画面へ戻る`, async ({ page }) => {
      await openHost(page);
      await page.keyboard.press(key);
      await expectTitle(page);
    });
  }

  test("タイトル画面では Space キーと Enter キーで何も起きない", async ({ page }) => {
    await openTitle(page);
    for (const key of ["Space", "Enter"]) {
      await page.keyboard.press(key);
      await expectTitle(page);
      expect(await visibleAnswerInfo(page), `${key} を押した後に見えている正解情報`).toEqual([]);
    }
    // 陽性対照: 同じキーで第 1 問なら正解発表になる（キーが届いていて、タイトル画面だけが無視している）
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(correctCard(page)).toBeVisible();
  });

  for (const key of ["ArrowRight", "PageDown"]) {
    const name = key === "ArrowRight" ? "→" : key;
    test(`${name} キーで次の問題へ進む`, async ({ page }) => {
      await openHost(page);
      await page.keyboard.press(key);
      await expectAsking(page, 1);
    });
  }

  for (const key of ["ArrowLeft", "PageUp"]) {
    const name = key === "ArrowLeft" ? "←" : key;
    test(`${name} キーで前の問題へ戻る`, async ({ page }) => {
      await openHost(page);
      await goTo(page, 1);
      await page.keyboard.press(key);
      await expectAsking(page, 0);
    });
  }

  for (const key of ["Space", "Enter"]) {
    test(`${key} キーで正解発表する`, async ({ page }) => {
      await openHost(page);
      await page.keyboard.press(key);
      // 第 1 問は B が rank 1（フィクスチャの前提）
      await expect(page.getByText("正解は B")).toBeVisible();
      await expect(page.getByText(questions[0].explanation)).toBeVisible();
    });
  }
});

/** 第 index + 1 問を開いて正解発表を 1 回押し、正解の選択肢が出るまで待つ */
async function revealAt(page: Page, index: number) {
  await openHost(page);
  await goTo(page, index);
  await revealButton(page).click();
  // 正解のカードが DOM に入ってから（めくり始めてから）めくり終えるのを待つ。押した直後はまだめくり始めていない
  await expect(correctCard(page)).toBeAttached();
  await settleCards(page);
  await expect(correctCard(page)).toBeVisible();
}

/** 正解の見た目になるのは rank 1 の選択肢だけで、「正解」の文字の印はどの選択肢にも付かない */
async function expectCorrectOnlyOn(page: Page, winner: Label) {
  await expect(correctCard(page)).toHaveCount(1);
  await expect(correctCard(page)).toHaveAttribute("data-label", winner);
  await expect(page.locator(".host-opts")).not.toContainText("正解");
}

/** 第 index + 1 問の正解発表（正解ラベル・解説・全選択肢のラベル・正解の選択肢）が表示されている */
async function expectRevealed(page: Page, index: number) {
  const answer = answerOf(questions[index]);
  await expect(page.getByText(`正解は ${answer}`)).toBeVisible();
  await expect(page.getByText(questions[index].explanation)).toBeVisible();
  for (const o of questions[index].options) {
    await expect(card(page, o.label).locator(".label-bar")).toHaveText(o.label);
  }
  await expectCorrectOnlyOn(page, answer);
}

/** 紙吹雪の canvas に色の付いたドットがある */
function celebrationHasDots(page: Page) {
  return celebration(page).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    return data.some((v, i) => i % 4 === 3 && v > 0);
  });
}

/** 表示順の n 番目の選択肢に、問題データのとおりのラベルが付いている */
async function expectLabelsInDisplayOrder(page: Page, index: number, expected: readonly Label[]) {
  expect(questions[index].options.map((o) => o.label), `フィクスチャの第 ${index + 1} 問の書いた順`).toEqual(expected);
  for (const [i, label] of expected.entries()) {
    await expect(optionCard(page, i)).toHaveAttribute("data-label", label);
    await expect(optionCard(page, i).locator(".label-bar")).toHaveText(label);
  }
}

test.describe("正解発表", () => {
  const q = questions[TWO];
  const winner = answerOf(q);

  test("正解発表で各選択肢にラベルを表示する", async ({ page }) => {
    await revealAt(page, TWO);
    await expectLabelsInDisplayOrder(page, TWO, ["B", "A"]);
  });

  test("3 択の正解発表で各選択肢にラベルを表示する", async ({ page }) => {
    await revealAt(page, THREE);
    await expectLabelsInDisplayOrder(page, THREE, ["C", "A", "B"]);
  });

  test("正解発表で選択肢の位置は変わらない", async ({ page }) => {
    await openHost(page);
    const before = await photoBoxes(page);
    expect(before.map((p) => p.src)).toEqual(q.options.map((o) => o.image));
    await revealButton(page).click();
    await expect(correctCard(page)).toBeVisible();
    await expect(page.getByText(q.explanation)).toBeVisible();
    expect(await photoBoxes(page)).toEqual(before);
  });

  test("正解の選択肢だけを正解の見た目にする", async ({ page }) => {
    await revealAt(page, TWO);
    await expectCorrectOnlyOn(page, winner);
  });

  test("3 択で正解の選択肢だけを正解の見た目にする", async ({ page }) => {
    await revealAt(page, THREE);
    await expectCorrectOnlyOn(page, answerOf(questions[THREE]));
  });

  test("正解発表で正解ラベルと解説を表示する", async ({ page }) => {
    await revealAt(page, TWO);
    await expect(page.getByText(`正解は ${winner}`)).toBeVisible();
    await expect(page.getByText(q.explanation)).toBeVisible();
  });
});

test("正解発表の各カードのラベルは同じ位置の写真のラベルである", async ({ page }) => {
  await openHost(page);
  for (const [index, q] of questions.entries()) {
    if (index > 0) {
      await nextButton(page).click();
      await expectAsking(page, index);
    }
    await revealButton(page).click();
    await expect(correctCard(page)).toBeVisible();
    const labelOf = new Map<string, string>(q.options.map((o) => [o.image, o.label]));
    for (const [i, photo] of (await photoBoxes(page)).entries()) {
      await expect(optionCard(page, i).locator(".label-bar"), `第 ${index + 1} 問の ${i + 1} 番目`).toHaveText(labelOf.get(photo.src!)!);
    }
  }
});

test.describe("正解発表の再演出", () => {
  test("正解発表をもう一度押すと演出を再生する", async ({ page }) => {
    await revealAt(page, TWO);
    await expect.poll(() => celebrationHasDots(page)).toBe(true);
    const first = await celebration(page).elementHandle();
    await revealButton(page).click();
    await expect.poll(() => first!.evaluate((el) => el.isConnected)).toBe(false);
    await expect(celebration(page)).toHaveCount(1);
    await expect.poll(() => celebrationHasDots(page)).toBe(true);
  });

  test("正解発表をもう一度押しても正解情報は変わらない", async ({ page }) => {
    await revealAt(page, THREE);
    const shown = () =>
      Promise.all([
        page.locator(".host-opts").innerText(),
        page.locator(".msg").innerText(),
        page.locator(".option-card").evaluateAll((cards) => cards.map((c) => [c.getAttribute("data-label"), c.querySelector(".label-bar")?.textContent])),
        correctCard(page).getAttribute("data-label"),
      ]);
    const before = await shown();
    expect(before[2], "1 回目の正解発表後のラベル").toEqual(questions[THREE].options.map((o) => [o.label, o.label]));
    const firstCelebration = await celebration(page).elementHandle();
    await revealButton(page).click();
    await expect.poll(() => firstCelebration!.evaluate((el) => el.isConnected)).toBe(false);
    await expect(celebration(page)).toHaveCount(1);
    expect(await shown()).toEqual(before);
  });

  test("reduced motion が有効なときは演出を再生しない", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await revealAt(page, TWO);
    const q = questions[TWO];
    await expect(page.getByText(q.explanation)).toBeVisible();
    for (const o of q.options) await expect(card(page, o.label).locator(".label-bar")).toHaveText(o.label);
    await expect(celebration(page)).toHaveCount(0);
  });
});

test.describe("紙吹雪の表示範囲と大きさ", () => {
  test("画面が 16:9 より縦長でも演出は画面全体に重なる", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    await revealAt(page, TWO);
    expect(await celebration(page).boundingBox()).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  test("画面が広いほど紙吹雪のドットも大きくなり、画面に対する紙吹雪の大きさは変わらない", async ({ page }) => {
    const dotsAcross = () => celebration(page).evaluate((canvas: HTMLCanvasElement) => canvas.width);
    await page.setViewportSize({ width: 1280, height: 720 });
    await revealAt(page, TWO);
    const narrow = await dotsAcross();
    // 演出は作り直したときに canvas の寸法を測るので、広げてからもう一度正解発表を押す
    await page.setViewportSize({ width: 2560, height: 1440 });
    const first = await celebration(page).elementHandle();
    await revealButton(page).click();
    await expect.poll(() => first!.evaluate((el) => el.isConnected)).toBe(false);
    expect(await dotsAcross()).toBe(narrow);
  });
});

test.describe("正解発表でカードをめくる", () => {
  const slotAnimations = (page: Page) => page.locator(".card-slot").evaluateAll((slots) => slots.map((el) => getComputedStyle(el).animationName));

  test("問題が出たときはめくらず、正解発表でめくって答えの面を出す", async ({ page }) => {
    await openHost(page);
    await goTo(page, THREE);
    expect(await slotAnimations(page)).toEqual(["none", "none", "none"]);
    const slot = await page.locator(".card-slot").first().elementHandle();
    await revealButton(page).click();
    await expect.poll(() => slotAnimations(page)).toEqual(["flip", "flip", "flip"]);
    await expect.poll(() => slotAnimations(page)).toEqual(["none", "none", "none"]);
    await expect(correctCard(page)).toBeVisible();
    expect(await slot!.evaluate((el) => el.isConnected), "正解発表の前後で同じ置き場所").toBe(true);
  });

  test("左から順にめくる", async ({ page }) => {
    await openHost(page);
    await goTo(page, THREE);
    await revealButton(page).click();
    await expect.poll(() => slotAnimations(page)).toEqual(["flip", "flip", "flip"]);
    const delays = await page.locator(".card-slot").evaluateAll((slots) => slots.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
  });

  test("最後の 1 枚をめくり終えてから正解のメッセージと紙吹雪を出す", async ({ page }) => {
    await openHost(page);
    await goTo(page, THREE);
    const { headline } = revealView(questions[THREE]);
    await revealButton(page).click();
    await expect.poll(() => slotAnimations(page)).toEqual(["flip", "flip", "flip"]);
    await expect(page.locator(".msg")).toContainText(questions[THREE].description);
    await expect(celebration(page)).toHaveCount(0);
    await expect.poll(() => slotAnimations(page)).toEqual(["none", "none", "none"]);
    await expect(page.locator(".msg")).toContainText(`${headline}！`);
    await expect(celebration(page)).toHaveCount(1);
  });

  test("正解発表中に開いたときはめくらない", async ({ page }) => {
    await revealAt(page, TWO);
    await page.reload();
    await expect(correctCard(page)).toBeVisible();
    expect(await slotAnimations(page)).toEqual(["none", "none"]);
  });

  test("reduced motion が有効なときはめくらない", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHost(page);
    await revealButton(page).click();
    await expect(correctCard(page)).toBeVisible();
    expect(await slotAnimations(page)).toEqual(["none", "none"]);
  });
});
