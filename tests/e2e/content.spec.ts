import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parse as parseYaml } from "yaml";
import { LEAK_CANARY } from "../../src/guest/leak-canary.ts";
import { deckOf } from "../../src/deck/cursor.ts";
import { PONG } from "../../src/venue/protocol.ts";
import { revealView } from "../../src/venue/view.ts";
import { secretStrings, type Label } from "../../src/question-set/model.ts";
import { loadQuestionSet } from "../../src/question-set/vite-plugin.ts";
import { findSecrets } from "../leak.ts";
import { expectLabelsBeforeReveal, expectOptions, expectRevealedOption, optionCard, photoBoxes, settleCards } from "./options.ts";
import { connectHost, freshVenue, operate, recordTraffic, skipIfRemote, TEXT_TYPE, viewShapeProblems } from "./venue.ts";

test.beforeEach(freshVenue);

// 期待値はローカルの問題ファイルから作る。BASE_URL でデプロイ先に流すときは、デプロイしたものと同じ content であること
const root = path.resolve(import.meta.dirname, "../..");
const set = loadQuestionSet(root);
const { questions } = set;
const secrets = secretStrings(set);
const last = questions.length - 1;
const { intro } = deckOf(set);
const contentDir = path.resolve(root, process.env.KAKUZUKE_CONTENT_DIR ?? "content");
const authored = parseYaml(readFileSync(path.join(contentDir, "questions.yaml"), "utf8")) as {
  readonly questions: readonly { readonly options: readonly { readonly image: string }[] }[];
};
const imageBaseNames = [
  ...new Set(authored.questions.flatMap((q) => q.options.map((o) => path.parse(o.image).name.normalize("NFC")))),
];

const SERVER_FN = "/_serverFn/";
const BINARY_TYPE = /^(image\/|font\/|application\/(font-|x-font-|octet-stream))/;

const nextButton = (page: Page) => page.getByRole("button", { name: "次へ" });
const revealButton = (page: Page) => page.getByRole("button", { name: "正解発表" });
const card = (page: Page, label: Label) => page.locator(`.option-card[data-label="${label}"]`);

/** 第 index + 1 問の番号・問題名と全選択肢の写真・選択肢の説明が表示順に表示され、写真が読み込み済み */
async function expectQuestion(page: Page, index: number) {
  const q = questions[index];
  await expect(page.getByRole("heading", { level: 1 }).locator("small")).toHaveText(`STAGE ${index + 1}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(q.title);
  await expectOptions(page, q.options);
}

const prizeRows = set.prizes.map((p) => `${p.rank}${p.condition}${p.prize}`);

/** 司会画面の問題の前の画面に、その画面の見出しと書いた中身だけが書いた順に出ている */
async function expectIntro(page: Page, screen: (typeof intro)[number]) {
  if (screen === "rules") {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ルール");
    await expect(page.getByRole("listitem")).toHaveText([...set.rules]);
    await expect(page.getByRole("row")).toHaveCount(0);
  } else {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ランクと景品");
    await expect(page.getByRole("row")).toHaveText(prizeRows);
    await expect(page.getByRole("listitem")).toHaveCount(0);
  }
}

/** 参加者画面は、司会画面が問題の前のどの画面でも、ルールとランクと景品を両方とも出している */
async function expectGuestIntro(page: Page) {
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(intro.map((s) => (s === "rules" ? /ルール/ : /ランクと景品/)));
  await expect(page.getByRole("listitem")).toHaveText([...set.rules]);
  await expect(page.getByRole("row")).toHaveText(prizeRows);
}

/** 画面ごとに、枠に収まるべき要素（名前と CSS セレクタ）と、少なくともいくつ測るか */
const LAYOUTS = {
  question: {
    targets: [
      ["問題名", ".host-title"],
      ["選択肢", ".option-card"],
      ["写真", ".option-card__photo"],
      ["選択肢の説明", ".option-note"],
      ["メッセージ欄", ".msg"],
      ["ボタン", ".host-btns button"],
    ],
    min: 12,
  },
  title: {
    targets: [
      ["タイトル", ".host-cover__title"],
      ["QR コード", ".qr"],
      ["ボタン", ".host-btns button"],
    ],
    min: 5,
  },
  rules: {
    targets: [
      ["見出し", ".host-title"],
      ["ルール", ".intro-rules li"],
      ["ボタン", ".host-btns button"],
    ],
    min: 5,
  },
  prizes: {
    targets: [
      ["見出し", ".host-title"],
      ["ランク", ".intro-prizes tr"],
      ["ボタン", ".host-btns button"],
    ],
    min: 5,
  },
} as const;

/** 1920×1080 で、画面の要素（LAYOUTS）が表示領域と 16:9 の枠に収まり、ページも解説欄もスクロールしない。収まらない要素の一覧を返す */
async function overflows(page: Page, layout: keyof typeof LAYOUTS): Promise<string[]> {
  await settleCards(page);
  return page.evaluate(async ({ targets: selectors, min }) => {
    void document.body.offsetHeight;
    await document.fonts.ready;
    // 枠の幅は端数になるので 1px の誤差は許す
    const EPSILON = 1;
    const frame = document.querySelector(".host")!.getBoundingClientRect();
    const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const inside = (r: DOMRect, box: { left: number; top: number; right: number; bottom: number }) =>
      r.left >= box.left - EPSILON && r.top >= box.top - EPSILON && r.right <= box.right + EPSILON && r.bottom <= box.bottom + EPSILON;
    const targets = selectors.flatMap(([name, selector]) =>
      [...document.querySelectorAll(selector)].map((el, i): [string, Element] => [
        `${name} ${i + 1}（${el.getAttribute("aria-label") ?? el.textContent}）`,
        el,
      ]),
    );
    const found: string[] = [];
    for (const [name, el] of targets) {
      const r = el.getBoundingClientRect();
      if (!inside(r, view)) found.push(`${name} が表示領域の外 ${JSON.stringify(r)}`);
      if (!inside(r, frame)) found.push(`${name} が枠の外 ${JSON.stringify(r)} 枠 ${JSON.stringify(frame)}`);
    }
    if (targets.length < min) found.push(`測る要素が足りない（${targets.length} 個）`);
    const doc = document.documentElement;
    if (doc.scrollHeight > window.innerHeight) found.push(`ページが縦にスクロールする（${doc.scrollHeight} > ${window.innerHeight}）`);
    if (doc.scrollWidth > window.innerWidth) found.push(`ページが横にスクロールする（${doc.scrollWidth} > ${window.innerWidth}）`);
    // 解説や選択肢の説明が長いと写真の行が先に 0 まで縮み、枠からはみ出す前に選択肢の説明がカードの外へ出る
    for (const [i, el] of [...document.querySelectorAll(".option-card")].entries()) {
      if (el.scrollHeight > el.clientHeight) found.push(`選択肢 ${i + 1} の中身がカードに収まらない（${el.scrollHeight} > ${el.clientHeight}）`);
    }
    const msg = document.querySelector(".msg");
    if (msg !== null && msg.scrollHeight > msg.clientHeight) found.push(`メッセージ欄の中身が切れる（${msg.scrollHeight} > ${msg.clientHeight}）`);
    const body = document.querySelector(".intro");
    if (body !== null && body.scrollHeight > body.clientHeight) found.push(`本文が欄に収まらない（${body.scrollHeight} > ${body.clientHeight}）`);
    return found;
  }, LAYOUTS[layout]);
}

/** 写真の高さがカードの高さの半分に満たない選択肢の一覧。写真の行は minmax(0, 1fr) なので、選択肢の説明が長いと枠に収まったまま写真だけが縮む */
function smallPhotos(page: Page): Promise<string[]> {
  return page.locator(".option-card").evaluateAll((cards) =>
    cards.flatMap((card, i) => {
      const photo = card.querySelector(".option-card__photo")!.getBoundingClientRect().height;
      const whole = card.getBoundingClientRect().height;
      return photo * 2 >= whole ? [] : [`選択肢 ${i + 1} の写真の高さ ${photo} がカードの高さ ${whole} の半分未満`];
    }),
  );
}

/** 第 index + 1 問の正解発表が revealView のとおり表示されている */
async function expectRevealed(page: Page, index: number) {
  const view = revealView(questions[index]);
  await expect(page.getByText(`${view.headline}！`)).toBeVisible();
  await expect(page.locator(".msg")).toContainText(view.explanation);
  await expect(page.locator(".host-opts")).not.toContainText("正解");
  for (const [i, o] of view.options.entries()) {
    await expect(optionCard(page, i)).toHaveAttribute("data-label", o.label);
    await expectRevealedOption(page, i, questions[index], o);
    if (o.correct) await expect(card(page, o.label)).toHaveClass(/option-card--correct/);
  }
}

const drivers = [
  { name: "ボタン", reveal: (page: Page) => revealButton(page).click(), next: (page: Page) => nextButton(page).click() },
  { name: "キー", reveal: (page: Page) => page.keyboard.press("Space"), next: (page: Page) => page.keyboard.press("ArrowRight") },
];

test.describe("司会画面", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // 会場を動かさないので BASE_URL でも流す。正解は会場からの WebSocket でだけ届き、HTTP の応答には載らない
  test("開いてもサーバー関数を呼ばず、HTTP の応答に正解情報がない", async ({ page }) => {
    const traffic = recordTraffic(page);
    await page.goto("/host");
    await expect(page.locator(".host")).toBeVisible();
    const texts = await traffic.http();

    expect(texts.map(({ url }) => new URL(url).pathname), "/host の HTML を検査できている").toContain("/host");
    expect(traffic.requests.filter((url) => url.includes(SERVER_FN))).toEqual([]);
    const leaks = texts.flatMap(({ url, text }) => findSecrets(text, secrets).map((hit) => `${url}: 「${hit.secret}」 …${hit.context}…`));
    expect(leaks).toEqual([]);
  });

  for (const driver of drivers) {
    test(`${driver.name}で全問を進めて正解発表し、溢れない`, async ({ page }) => {
      skipIfRemote();
      await page.goto("/host");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(set.title);
      await expect(page.getByRole("img", { name: "参加者画面の QR コード" })).toBeVisible();
      expect(await overflows(page, "title"), "タイトル画面").toEqual([]);
      for (const screen of intro) {
        await driver.next(page);
        await expectIntro(page, screen);
        await expect(revealButton(page), `${screen} の画面に正解発表ボタンを出さない`).toHaveCount(0);
        expect(await overflows(page, screen), `${screen} の画面`).toEqual([]);
      }
      for (let i = 0; i <= last; i++) {
        await driver.next(page);
        await expectQuestion(page, i);
        expect(await overflows(page, "question"), `第 ${i + 1} 問の正解発表前`).toEqual([]);
        expect(await smallPhotos(page), `第 ${i + 1} 問の正解発表前`).toEqual([]);
        await expectLabelsBeforeReveal(page, questions[i]);
        const asking = await photoBoxes(page);
        await driver.reveal(page);
        await expectRevealed(page, i);
        expect(await overflows(page, "question"), `第 ${i + 1} 問の正解発表後`).toEqual([]);
        expect(await photoBoxes(page), `第 ${i + 1} 問の写真の位置が正解発表の前後で同じ`).toEqual(asking);
      }
      await expect(nextButton(page)).toBeDisabled();

      await page.reload();
      await expectRevealed(page, last);
    });
  }
});

test.describe("参加者画面", () => {
  // 会場を動かさないので BASE_URL でも流す。HTML と JS に正解情報がない（会場はデプロイ先で正解発表中かもしれないので、フレームは検査しない）
  test("開いたときの HTTP の応答に正解情報がなく、サーバー関数も呼ばない", async ({ page }) => {
    const traffic = recordTraffic(page);
    await page.goto("/");
    await expect(page.locator(".guest")).toBeVisible();
    const http = await traffic.http();

    expect(http.map(({ url }) => new URL(url).pathname), "参加者画面の HTML を検査できている").toContain("/");
    expect(traffic.requests.filter((url) => url.includes(SERVER_FN))).toEqual([]);
    expect(http.some(({ text }) => findSecrets(text, [LEAK_CANARY]).length > 0), "陽性対照: 応答の中身からカナリアを読める").toBe(true);
    const leaks = http.flatMap(({ url, text }) => findSecrets(text, secrets).map((hit) => `${url}: 「${hit.secret}」 …${hit.context}…`));
    expect(leaks).toEqual([]);
  });

  test("司会が最後まで進める間の応答とフレームに正解情報がなく、サーバー関数も呼ばない", async ({ page, baseURL }) => {
    skipIfRemote();
    expect(secrets.length).toBeGreaterThan(0);
    expect(imageBaseNames.length).toBeGreaterThan(0);
    const traffic = recordTraffic(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(set.title);
    await expect.poll(() => traffic.frames.length, "会場につながった").toBeGreaterThan(0);
    const host = await connectHost(baseURL!);
    try {
      for (const _ of intro) {
        await operate(host, "next");
        await expectGuestIntro(page);
      }
      for (let i = 0; i <= last; i++) {
        await operate(host, "next");
        await expectQuestion(page, i);
      }
    } finally {
      host.close();
    }
    const texts = await traffic.texts();

    expect(traffic.requests.filter((url) => url.includes(SERVER_FN))).toEqual([]);

    const unknown = traffic.responses
      .filter((r) => r.status() < 300 || r.status() >= 400)
      .map((r) => ({ url: r.url(), type: r.headers()["content-type"] ?? "" }))
      .filter(({ type }) => !TEXT_TYPE.test(type) && !BINARY_TYPE.test(type));
    expect(unknown, "中身を検査できない種類の応答").toEqual([]);

    expect(traffic.frames.filter((f) => f !== PONG), "つないだ直後・問題の前の画面・各問題のフレームを受け取っている").toHaveLength(
      1 + intro.length + questions.length,
    );
    expect(texts.some(({ text }) => findSecrets(text, [LEAK_CANARY]).length > 0), "陽性対照: 応答の中身からカナリアを読める").toBe(true);
    const leaks = texts.flatMap(({ url, text }) => findSecrets(text, secrets).map((hit) => `${url}: 「${hit.secret}」 …${hit.context}…`));
    expect(leaks).toEqual([]);
    expect(viewShapeProblems(traffic.frames)).toEqual([]);

    const imageUrls = traffic.responses.filter((r) => (r.headers()["content-type"] ?? "").startsWith("image/")).map((r) => r.url());
    const shown = new Set(questions.flatMap((q) => q.options.map((o) => new URL(o.image, page.url()).href)));
    expect(imageUrls, "全問題の写真を受け取っている").toEqual(expect.arrayContaining([...shown]));
    const named = imageUrls.flatMap((url) => {
      const decoded = decodeURIComponent(url).normalize("NFC");
      return imageBaseNames.filter((name) => decoded.includes(name)).map((name) => `${url}: 「${name}」`);
    });
    expect(named).toEqual([]);
  });
});
